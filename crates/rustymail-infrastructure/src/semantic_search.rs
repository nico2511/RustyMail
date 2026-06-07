//! SQLite-backed lexical + optional MiniLM semantic search, and embedding index.

use std::collections::{HashMap, HashSet};
use std::path::PathBuf;
use std::sync::{Mutex, OnceLock};

use rusqlite::{params, Connection, OptionalExtension};
use rustymail_domain::{lexical_search_terms, EntityKind, SearchMode, SearchQuery, Tag, ThreadListItem};

use crate::{
    build_thread_from_row, list_newsletter_rules_connection, open_sqlite_migrated,
    resolve_scoped_mailbox_for_account, thread_blocks_reply,
};

const EMBEDDING_MODEL_ID: &str = "all-MiniLM-L6-v2";

struct EmbedCache {
    dir: PathBuf,
    embedder: Mutex<Option<rustymail_semantic::MiniLmEmbedder>>,
}

static EMBED_CACHE: OnceLock<EmbedCache> = OnceLock::new();

/// Call once at app startup with `…/models/all-MiniLM-L6-v2` (or any dir containing `model.onnx` + `tokenizer.json`).
pub fn init_semantic_model_dir(dir: PathBuf) {
    let _ = EMBED_CACHE.get_or_init(|| EmbedCache {
        dir,
        embedder: Mutex::new(None),
    });
}

pub fn semantic_model_present() -> bool {
    EMBED_CACHE.get().map_or(false, |c| {
        c.dir.join("model.onnx").is_file() && c.dir.join("tokenizer.json").is_file()
    })
}

fn with_embedder<R, F>(f: F) -> Result<Option<R>, String>
where
    F: FnOnce(&mut rustymail_semantic::MiniLmEmbedder) -> Result<R, String>,
{
    let Some(cache) = EMBED_CACHE.get() else {
        return Ok(None);
    };
    if !semantic_model_present() {
        return Ok(None);
    }
    let mut slot = cache
        .embedder
        .lock()
        .map_err(|_| "semantic embedder lock poisoned".to_string())?;
    if slot.is_none() {
        match rustymail_semantic::MiniLmEmbedder::from_dir(&cache.dir) {
            Ok(e) => *slot = Some(e),
            Err(e) => {
                eprintln!("[RustyMail] semantic: failed to load MiniLM: {e}");
                return Ok(None);
            }
        }
    }
    let emb = slot.as_mut().expect("just set");
    Ok(Some(f(emb)?))
}

pub fn embedding_plain_for_message(
    subject: &str,
    body_plain: Option<&str>,
    enrich_identifiers: bool,
) -> String {
    let body = body_plain.unwrap_or("");
    let mut s = format!(
        "{}\n{}",
        subject,
        body.chars().take(8000).collect::<String>()
    );
    if enrich_identifiers {
        let ext = rustymail_modules::ai_extraction::extract_entities(&s, None);
        let mut ids: Vec<String> = ext
            .entities
            .iter()
            .filter(|e| matches!(e.kind, EntityKind::Identifier))
            .map(|e| e.value.clone())
            .collect();
        ids.sort();
        ids.dedup();
        if !ids.is_empty() {
            use std::fmt::Write;
            let _ = write!(s, "\nidentifiers: {}", ids.join(" "));
        }
    }
    s
}

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SemanticReindexStats {
    pub indexed: usize,
    pub skipped: usize,
    pub errors: usize,
}

/// Synthèses pour affichage réglages (compte + boîte courante dans la barre latérale).
#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SemanticEmbeddingCountsSnapshot {
    pub account_id: String,
    pub mailbox: String,
    pub model_id: String,
    /// Messages du compte encore présents localement ayant une embedding pour `model_id` (tous dossiers SQLite).
    pub embeddings_total_for_account: u64,
    /// Dont ceux situés précisément dans `mailbox`.
    pub embeddings_in_mailbox: u64,
    /// Nombre total de messages en cache local pour cette boîte uniquement (avant embeddings).
    pub messages_in_mailbox_cached: u64,
}

pub fn semantic_embedding_counts_snapshot(
    db_path: &std::path::Path,
    account_id: &str,
    mailbox: &str,
) -> Result<SemanticEmbeddingCountsSnapshot, String> {
    let account_id = account_id.trim();
    if account_id.is_empty() {
        return Err("account_id requis".into());
    }
    if mailbox.trim().is_empty() {
        return Err("mailbox requis".into());
    }

    let conn = open_sqlite_migrated(db_path).map_err(|e| e.to_string())?;
    let resolved = resolve_scoped_mailbox_for_account(&conn, account_id, mailbox).map_err(|e| e.to_string())?;

    let embeddings_total_for_account: u64 = conn
        .query_row(
            "
            SELECT COUNT(*) FROM message_embeddings e
            INNER JOIN messages m ON m.id = e.message_id
            WHERE m.account_id = ?1 AND e.model_id = ?2
            ",
            params![account_id, EMBEDDING_MODEL_ID],
            |row| row.get::<_, i64>(0),
        )
        .map_err(|e| e.to_string())? as u64;

    let embeddings_in_mailbox: u64 = conn
        .query_row(
            "
            SELECT COUNT(*) FROM message_embeddings e
            INNER JOIN messages m ON m.id = e.message_id
            WHERE m.account_id = ?1 AND e.model_id = ?2
              AND lower(trim(m.mailbox)) = lower(trim(?3))
            ",
            params![account_id, EMBEDDING_MODEL_ID, resolved.as_str()],
            |row| row.get::<_, i64>(0),
        )
        .map_err(|e| e.to_string())? as u64;

    let messages_in_mailbox_cached: u64 = conn
        .query_row(
            "
            SELECT COUNT(*) FROM messages
            WHERE account_id = ?1 AND lower(trim(mailbox)) = lower(trim(?2))
            ",
            params![account_id, resolved.as_str()],
            |row| row.get::<_, i64>(0),
        )
        .map_err(|e| e.to_string())? as u64;

    Ok(SemanticEmbeddingCountsSnapshot {
        account_id: account_id.to_string(),
        mailbox: resolved,
        model_id: EMBEDDING_MODEL_ID.to_string(),
        embeddings_total_for_account,
        embeddings_in_mailbox,
        messages_in_mailbox_cached,
    })
}

fn reindex_semantic_for_message_rows(
    db_path: &std::path::Path,
    rows: &[(String, String, String)],
    enrich_identifiers: bool,
) -> Result<SemanticReindexStats, String> {
    let counts = with_embedder(|emb| {
        let mut indexed = 0usize;
        let mut skipped = 0usize;
        let mut errors = 0usize;
        let conn = open_sqlite_migrated(db_path).map_err(|e| e.to_string())?;
        for (id, subject, body) in rows {
            let text = embedding_plain_for_message(subject, Some(body), enrich_identifiers);
            let vec = match emb.embed(&text) {
                Ok(v) => v,
                Err(e) => {
                    eprintln!("[RustyMail] semantic index skip {id}: {e}");
                    errors += 1;
                    continue;
                }
            };
            let dim = vec.len() as i64;
            let blob = f32_slice_to_blob(&vec);
            match conn.execute(
                "
                INSERT INTO message_embeddings (message_id, model_id, dim, vector, indexed_at)
                VALUES (?1, ?2, ?3, ?4, strftime('%Y-%m-%dT%H:%M:%fZ','now'))
                ON CONFLICT(message_id) DO UPDATE SET
                    model_id = excluded.model_id,
                    dim = excluded.dim,
                    vector = excluded.vector,
                    indexed_at = excluded.indexed_at
                ",
                params![id, EMBEDDING_MODEL_ID, dim, blob],
            ) {
                Ok(1) => indexed += 1,
                Ok(_) => skipped += 1,
                Err(e) => {
                    eprintln!("[RustyMail] semantic index SQL {id}: {e}");
                    errors += 1;
                }
            }
        }
        Ok((indexed, skipped, errors))
    })?;

    let (indexed, skipped, errors) = counts.unwrap_or((0, 0, 0));

    Ok(SemanticReindexStats {
        indexed,
        skipped,
        errors,
    })
}

/// Toutes les lignes messages du compte en cache SQLite (`messages`), tous dossiers.
pub fn reindex_semantic_account(
    db_path: &std::path::Path,
    account_id: &str,
    enrich_identifiers: bool,
) -> Result<SemanticReindexStats, String> {
    let account_id = account_id.trim();
    if account_id.is_empty() {
        return Err("account_id requis".into());
    }

    let conn = open_sqlite_migrated(db_path).map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare(
            "
            SELECT id, subject, COALESCE(body_plain, body) AS bp
            FROM messages
            WHERE account_id = ?1
            ORDER BY received_at DESC
            ",
        )
        .map_err(|e| e.to_string())?;

    let rows: Vec<(String, String, String)> = stmt
        .query_map(params![account_id], |row| {
            Ok((row.get(0)?, row.get(1)?, row.get(2)?))
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    drop(stmt);
    drop(conn);

    reindex_semantic_for_message_rows(db_path, &rows, enrich_identifiers)
}

pub fn reindex_semantic_mailbox(
    db_path: &std::path::Path,
    account_id: &str,
    mailbox: &str,
    enrich_identifiers: bool,
) -> Result<SemanticReindexStats, String> {
    let account_id = account_id.trim();
    if account_id.is_empty() || mailbox.trim().is_empty() {
        return Err("account_id et mailbox requis".to_string());
    }

    let conn = open_sqlite_migrated(db_path).map_err(|e| e.to_string())?;
    let resolved = resolve_scoped_mailbox_for_account(&conn, account_id, mailbox).map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare(
            "
            SELECT id, subject, COALESCE(body_plain, body) AS bp
            FROM messages
            WHERE account_id = ?1 AND lower(trim(mailbox)) = lower(trim(?2))
            ORDER BY received_at DESC
            ",
        )
        .map_err(|e| e.to_string())?;

    let rows: Vec<(String, String, String)> = stmt
        .query_map(params![account_id, resolved.as_str()], |row| {
            Ok((row.get(0)?, row.get(1)?, row.get(2)?))
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    drop(stmt);
    drop(conn);

    reindex_semantic_for_message_rows(db_path, &rows, enrich_identifiers)
}

fn f32_slice_to_blob(v: &[f32]) -> Vec<u8> {
    let mut b = Vec::with_capacity(v.len() * 4);
    for x in v {
        b.extend_from_slice(&x.to_le_bytes());
    }
    b
}

fn blob_to_f32_vec(blob: &[u8], dim: usize) -> Option<Vec<f32>> {
    if blob.len() != dim * 4 {
        return None;
    }
    let mut v = Vec::with_capacity(dim);
    for chunk in blob.chunks_exact(4) {
        v.push(f32::from_le_bytes(chunk.try_into().ok()?));
    }
    Some(v)
}

fn sql_like_fragment(user: &str) -> String {
    let esc: String = user
        .replace('\\', "\\\\")
        .replace('%', "\\%")
        .replace('_', "\\_");
    format!("%{esc}%")
}

/// Contact présent comme expéditeur, destinataire (To/Cc) ou Reply-To.
fn message_involves_contact(m: &rustymail_domain::Message, needle_lc: &str) -> bool {
    if m.sender.email.to_ascii_lowercase().contains(needle_lc) {
        return true;
    }
    if m
        .sender
        .name
        .as_deref()
        .is_some_and(|n| n.to_ascii_lowercase().contains(needle_lc))
    {
        return true;
    }
    if m
        .recipients
        .iter()
        .any(|r| r.email.to_ascii_lowercase().contains(needle_lc))
    {
        return true;
    }
    if m
        .reply_to
        .iter()
        .any(|r| r.email.to_ascii_lowercase().contains(needle_lc))
    {
        return true;
    }
    false
}

fn looks_like_email(s: &str) -> bool {
    let s = s.trim();
    if s.is_empty() || s.chars().any(char::is_whitespace) {
        return false;
    }
    let Some((local, domain)) = s.split_once('@') else {
        return false;
    };
    !local.is_empty() && domain.contains('.') && domain.len() >= 3
}

fn email_from_text_query(text: &str) -> Option<String> {
    let t = text.trim();
    if looks_like_email(t) {
        Some(t.to_string())
    } else {
        None
    }
}

fn push_sender_unique(out: &mut Vec<String>, raw: &str) {
    let s = raw.trim();
    if s.is_empty() {
        return;
    }
    let slc = s.to_ascii_lowercase();
    if !out.iter().any(|x| x.to_ascii_lowercase() == slc) {
        out.push(s.to_string());
    }
}

fn effective_senders(query: &SearchQuery) -> Vec<String> {
    let mut out: Vec<String> = Vec::new();
    for s in &query.senders {
        push_sender_unique(&mut out, s);
    }
    if let Some(s) = query
        .sender
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
    {
        push_sender_unique(&mut out, s);
    }
    if let Some(email) = query.text.as_deref().and_then(email_from_text_query) {
        push_sender_unique(&mut out, &email);
    }
    out
}

/// Texte libre pour LIKE / embeddings : pas une adresse e-mail seule (traitée comme expéditeur).
fn text_for_lexical_semantic(query: &SearchQuery) -> Option<String> {
    let t = query.text.as_deref()?.trim();
    if t.is_empty() {
        return None;
    }
    if email_from_text_query(t).is_some() {
        return None;
    }
    Some(t.to_ascii_lowercase())
}

fn sender_involvement_sql(like_ph: &str) -> String {
    format!(
        "lower(sender_email) LIKE {like_ph} ESCAPE '\\'
         OR lower(COALESCE(sender_name, '')) LIKE {like_ph} ESCAPE '\\'
         OR lower(COALESCE(to_header, '')) LIKE {like_ph} ESCAPE '\\'
         OR lower(COALESCE(cc_header, '')) LIKE {like_ph} ESCAPE '\\'
         OR lower(COALESCE(reply_to_header, '')) LIKE {like_ph} ESCAPE '\\'"
    )
}

/// Fil de discussion dont au moins un message implique le contact (expéditeur ou destinataire).
fn thread_ids_for_sender(
    conn: &Connection,
    account_id: &str,
    scope_mailbox: Option<&str>,
    sender_like: &str,
) -> Result<Vec<String>, String> {
    if let Some(mbox) = scope_mailbox {
        let body = sender_involvement_sql("?3");
        let sql = format!(
            "SELECT DISTINCT thread_id FROM messages
             WHERE account_id = ?1 AND lower(trim(mailbox)) = lower(trim(?2))
               AND ({body})"
        );
        let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map(params![account_id, mbox, sender_like], |row| row.get(0))
            .map_err(|e| e.to_string())?;
        rows.collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())
    } else {
        let body = sender_involvement_sql("?2");
        let sql = format!(
            "SELECT DISTINCT thread_id FROM messages
             WHERE account_id = ?1 AND ({body})"
        );
        let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map(params![account_id, sender_like], |row| row.get(0))
            .map_err(|e| e.to_string())?;
        rows.collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())
    }
}

/// Union des fils impliquant au moins un des contacts (OU).
fn thread_ids_for_senders(
    conn: &Connection,
    account_id: &str,
    scope_mailbox: Option<&str>,
    senders: &[String],
) -> Result<Vec<String>, String> {
    let mut merged: HashSet<String> = HashSet::new();
    for sender_raw in senders {
        let sender_like = sql_like_fragment(&sender_raw.to_ascii_lowercase());
        let ids = thread_ids_for_sender(conn, account_id, scope_mailbox, &sender_like)?;
        merged.extend(ids);
    }
    Ok(merged.into_iter().collect())
}

fn lexical_thread_ids_for_like(
    conn: &Connection,
    account_id: &str,
    scope_mailbox: Option<&str>,
    like_pat: &str,
) -> Result<Vec<String>, String> {
    if let Some(mbox) = scope_mailbox {
        let mut stmt = conn
            .prepare(
                "
                SELECT DISTINCT thread_id FROM messages
                WHERE account_id = ?1 AND lower(trim(mailbox)) = lower(trim(?2))
                  AND (
                    lower(subject) LIKE ?3 ESCAPE '\\'
                    OR lower(COALESCE(body_plain, body)) LIKE ?3 ESCAPE '\\'
                    OR lower(sender_email) LIKE ?3 ESCAPE '\\'
                    OR lower(sender_name) LIKE ?3 ESCAPE '\\'
                  )
                ",
            )
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map(params![account_id, mbox, like_pat], |row| row.get(0))
            .map_err(|e| e.to_string())?;
        rows.collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())
    } else {
        let mut stmt = conn
            .prepare(
                "
                SELECT DISTINCT thread_id FROM messages
                WHERE account_id = ?1
                  AND (
                    lower(subject) LIKE ?2 ESCAPE '\\'
                    OR lower(COALESCE(body_plain, body)) LIKE ?2 ESCAPE '\\'
                    OR lower(sender_email) LIKE ?2 ESCAPE '\\'
                    OR lower(sender_name) LIKE ?2 ESCAPE '\\'
                  )
                ",
            )
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map(params![account_id, like_pat], |row| row.get(0))
            .map_err(|e| e.to_string())?;
        rows.collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())
    }
}

/// Correspondance exacte ou préfixe si la valeur se termine par `*` (ex. `source:agents.allianz*`).
fn tag_matches_query(thread_tag: &Tag, query_tag: &Tag) -> bool {
    if thread_tag.family != query_tag.family {
        return false;
    }
    let qv = query_tag.value.trim();
    if qv.ends_with('*') {
        let prefix = qv.trim_end_matches('*').trim();
        if prefix.is_empty() {
            return true;
        }
        return thread_tag
            .value
            .to_ascii_lowercase()
            .starts_with(&prefix.to_ascii_lowercase());
    }
    thread_tag.value.eq_ignore_ascii_case(qv)
}

fn thread_satisfies_tag(thread: &rustymail_domain::Thread, query_tag: &Tag) -> bool {
    thread
        .tags
        .iter()
        .any(|t| tag_matches_query(t, query_tag))
        || thread
            .messages
            .iter()
            .any(|m| m.tags.iter().any(|t| tag_matches_query(t, query_tag)))
}

fn load_thread_ids_in_scope(
    conn: &Connection,
    account_id: &str,
    scope_mailbox: Option<&str>,
) -> Result<Vec<String>, String> {
    let ids: Vec<String> = if let Some(mbox) = scope_mailbox {
        let mut stmt = conn
            .prepare(
                "
                SELECT id FROM threads
                WHERE account_id = ?1 AND lower(trim(mailbox)) = lower(trim(?2))
                ORDER BY
                  (SELECT max(received_at) FROM messages WHERE thread_id = threads.id) DESC,
                  id
                ",
            )
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map(params![account_id, mbox], |row| row.get(0))
            .map_err(|e| e.to_string())?;
        rows.collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())?
    } else {
        let mut stmt = conn
            .prepare(
                "
                SELECT id FROM threads
                WHERE account_id = ?1
                ORDER BY
                  (SELECT max(received_at) FROM messages WHERE thread_id = threads.id) DESC,
                  id
                ",
            )
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map(params![account_id], |row| row.get(0))
            .map_err(|e| e.to_string())?;
        rows.collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())?
    };
    Ok(ids)
}

fn matches_thread_filters(thread: &rustymail_domain::Thread, query: &SearchQuery) -> bool {
    let senders = effective_senders(query);
    if !senders.is_empty() {
        let ok = senders.iter().any(|sender| {
            let slc = sender.to_ascii_lowercase();
            thread
                .messages
                .iter()
                .any(|m| message_involves_contact(m, &slc))
        });
        if !ok {
            return false;
        }
    }

    if let Some(lang) = query
        .language
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
    {
        let ok = thread.messages.iter().any(|m| {
            m.detected_lang
                .as_deref()
                .map(|l| l.eq_ignore_ascii_case(lang))
                .unwrap_or(false)
        });
        if !ok {
            return false;
        }
    }

    query
        .tags
        .iter()
        .all(|tag| thread_satisfies_tag(thread, tag))
}

pub fn sqlite_search_threads_unified(
    db_path: &std::path::Path,
    query: &SearchQuery,
) -> Result<Vec<ThreadListItem>, String> {
    let Some(account_id) = query
        .account_id
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
    else {
        return Err("account_id requis pour la recherche SQLite".to_string());
    };
    let raw_mailbox = query.mailbox.as_deref().filter(|s| !s.trim().is_empty());

    let conn = open_sqlite_migrated(db_path).map_err(|e| e.to_string())?;

    let scope_resolved: Option<String> = if let Some(mb) = raw_mailbox {
        Some(
            resolve_scoped_mailbox_for_account(&conn, account_id, mb).map_err(|e| e.to_string())?,
        )
    } else {
        None
    };
    let scope_mailbox: Option<&str> = scope_resolved.as_deref();

    let newsletter_rules = list_newsletter_rules_connection(&conn).map_err(|e| e.to_string())?;
    let account_email: String = conn
        .query_row(
            "SELECT lower(trim(email)) FROM accounts WHERE id = ?1 LIMIT 1",
            params![account_id.trim()],
            |row| row.get(0),
        )
        .unwrap_or_default();
    let account_emails = if account_email.is_empty() {
        Vec::new()
    } else {
        vec![account_email]
    };

    let text_lc = text_for_lexical_semantic(query);

    let mut lexical_thread_ids: Vec<String> = Vec::new();
    if let Some(ref needle) = text_lc {
        let tokens = lexical_search_terms(needle);
        if !tokens.is_empty() {
            let like0 = sql_like_fragment(tokens[0].as_str());
            lexical_thread_ids =
                lexical_thread_ids_for_like(&conn, account_id, scope_mailbox, &like0)?;
            for tok in tokens.iter().skip(1) {
                let liken = sql_like_fragment(tok.as_str());
                let next_ids =
                    lexical_thread_ids_for_like(&conn, account_id, scope_mailbox, &liken)?;
                let allowed: HashSet<String> = next_ids.into_iter().collect();
                lexical_thread_ids.retain(|id| allowed.contains(id));
                if lexical_thread_ids.is_empty() {
                    break;
                }
            }
        }
    }

    let senders = effective_senders(query);
    if !senders.is_empty() {
        let sender_ids = thread_ids_for_senders(&conn, account_id, scope_mailbox, &senders)?;
        if text_lc.is_some() {
            if lexical_thread_ids.is_empty() {
                lexical_thread_ids = sender_ids;
            } else {
                let allowed: HashSet<String> = sender_ids.into_iter().collect();
                lexical_thread_ids.retain(|id| allowed.contains(id));
            }
        } else {
            lexical_thread_ids = sender_ids;
        }
    }

    let mut semantic_scores: HashMap<String, f32> = HashMap::new();
    let want_semantic =
        matches!(query.mode, SearchMode::Semantic | SearchMode::Hybrid) && text_lc.is_some();

    if want_semantic {
        if let Some(needle) = text_lc.clone() {
            let qvec_result = with_embedder(|emb| emb.embed(&needle).map_err(|e| e.to_string()));
            if let Ok(Some(qvec)) = qvec_result {
                if let Some(mbox) = scope_mailbox {
                    let mut stmt = conn
                        .prepare(
                            "
                        SELECT m.thread_id, e.vector, e.dim
                        FROM message_embeddings e
                        INNER JOIN messages m ON m.id = e.message_id
                        WHERE m.account_id = ?1 AND lower(trim(m.mailbox)) = lower(trim(?2))
                          AND e.model_id = ?3
                        ",
                        )
                        .map_err(|e| e.to_string())?;
                    let rows = stmt
                        .query_map(params![account_id, mbox, EMBEDDING_MODEL_ID], |row| {
                            Ok((
                                row.get::<_, String>(0)?,
                                row.get::<_, Vec<u8>>(1)?,
                                row.get::<_, i64>(2)?,
                            ))
                        })
                        .map_err(|e| e.to_string())?;
                    for r in rows {
                        let (thread_id, blob, dim) = r.map_err(|e| e.to_string())?;
                        let dim = dim.max(0) as usize;
                        let Some(mvec) = blob_to_f32_vec(&blob, dim) else {
                            continue;
                        };
                        let s = rustymail_semantic::cosine_similarity(&qvec, &mvec);
                        semantic_scores
                            .entry(thread_id)
                            .and_modify(|best| *best = best.max(s))
                            .or_insert(s);
                    }
                } else {
                    let mut stmt = conn
                        .prepare(
                            "
                        SELECT m.thread_id, e.vector, e.dim
                        FROM message_embeddings e
                        INNER JOIN messages m ON m.id = e.message_id
                        WHERE m.account_id = ?1 AND e.model_id = ?2
                        ",
                        )
                        .map_err(|e| e.to_string())?;
                    let rows = stmt
                        .query_map(params![account_id, EMBEDDING_MODEL_ID], |row| {
                            Ok((
                                row.get::<_, String>(0)?,
                                row.get::<_, Vec<u8>>(1)?,
                                row.get::<_, i64>(2)?,
                            ))
                        })
                        .map_err(|e| e.to_string())?;
                    for r in rows {
                        let (thread_id, blob, dim) = r.map_err(|e| e.to_string())?;
                        let dim = dim.max(0) as usize;
                        let Some(mvec) = blob_to_f32_vec(&blob, dim) else {
                            continue;
                        };
                        let s = rustymail_semantic::cosine_similarity(&qvec, &mvec);
                        semantic_scores
                            .entry(thread_id)
                            .and_modify(|best| *best = best.max(s))
                            .or_insert(s);
                    }
                }
            }
        }
    }

    let mut thread_ids: Vec<String> = match query.mode {
        SearchMode::Lexical => lexical_thread_ids,
        SearchMode::Semantic => {
            let mut v: Vec<String> = semantic_scores.keys().cloned().collect();
            v.sort_by(|a, b| {
                let sa = semantic_scores.get(a).copied().unwrap_or(0.0);
                let sb = semantic_scores.get(b).copied().unwrap_or(0.0);
                sb.partial_cmp(&sa).unwrap_or(std::cmp::Ordering::Equal)
            });
            v.retain(|tid| semantic_scores.get(tid).copied().unwrap_or(0.0) > 0.12);
            if v.is_empty() {
                lexical_thread_ids
            } else {
                v
            }
        }
        SearchMode::Hybrid => {
            if !lexical_thread_ids.is_empty() {
                lexical_thread_ids
            } else {
                let mut v: Vec<String> = semantic_scores.keys().cloned().collect();
                v.sort_by(|a, b| {
                    let sa = semantic_scores.get(a).copied().unwrap_or(0.0);
                    let sb = semantic_scores.get(b).copied().unwrap_or(0.0);
                    sb.partial_cmp(&sa).unwrap_or(std::cmp::Ordering::Equal)
                });
                v.retain(|tid| semantic_scores.get(tid).copied().unwrap_or(0.0) > 0.12);
                if v.is_empty() {
                    lexical_thread_ids
                } else {
                    v
                }
            }
        }
    };

    let senders_empty = effective_senders(query).is_empty();
    let tags_only = text_lc.is_none() && senders_empty && !query.tags.is_empty();
    let lang_only = text_lc.is_none()
        && senders_empty
        && query.tags.is_empty()
        && query
            .language
            .as_ref()
            .map_or(false, |s| !s.trim().is_empty());
    let browse_empty = text_lc.is_none()
        && senders_empty
        && query.tags.is_empty()
        && query
            .language
            .as_ref()
            .map_or(true, |s| s.trim().is_empty());

    if thread_ids.is_empty()
        && matches!(query.mode, SearchMode::Lexical | SearchMode::Hybrid)
        && (browse_empty || tags_only || lang_only)
    {
        thread_ids = load_thread_ids_in_scope(&conn, account_id, scope_mailbox)?;
    }

    let mut out: Vec<ThreadListItem> = Vec::new();
    for tid in thread_ids {
        let row: Option<(String, String, String, String, bool)> = if let Some(mbox) = scope_mailbox
        {
            conn.query_row(
                "SELECT id, subject, tags, mailbox, COALESCE(is_followed, 0) FROM threads WHERE id = ?1 AND account_id = ?2 AND lower(trim(mailbox)) = lower(trim(?3))",
                params![tid, account_id, mbox],
                |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?, r.get::<_, i64>(4)? != 0)),
            )
            .optional()
            .map_err(|e| e.to_string())?
        } else {
            conn.query_row(
                "SELECT id, subject, tags, mailbox, COALESCE(is_followed, 0) FROM threads WHERE id = ?1 AND account_id = ?2",
                params![tid, account_id],
                |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?, r.get::<_, i64>(4)? != 0)),
            )
            .optional()
            .map_err(|e| e.to_string())?
        };
        let Some((id, subject, tags, mailbox, followed)) = row else {
            continue;
        };
        let thread = build_thread_from_row(&conn, id, subject, tags, followed)
            .map_err(|e| e.to_string())?;
        if !matches_thread_filters(&thread, query) {
            continue;
        }
        let mut item = thread.list_item(mailbox.trim().to_string());
        item.is_newsletter_thread = thread_blocks_reply(&thread, &account_emails, &newsletter_rules);
        out.push(item);
    }

    Ok(out)
}

/// Compte les fils correspondant à une requête ; si `since` est défini, seulement l’activité postérieure.
pub fn count_threads_matching_query(
    db_path: &std::path::Path,
    query: &SearchQuery,
    since: Option<chrono::DateTime<chrono::Utc>>,
) -> Result<usize, String> {
    let items = sqlite_search_threads_unified(db_path, query)?;
    if let Some(since_dt) = since {
        let n = items
            .iter()
            .filter(|item| {
                parse_activity_after(&item.last_activity)
                    .map(|dt| dt > since_dt)
                    .unwrap_or(false)
            })
            .count();
        return Ok(n);
    }
    Ok(items.len())
}

fn parse_activity_after(iso: &str) -> Option<chrono::DateTime<chrono::Utc>> {
    let s = iso.trim();
    if s.is_empty() {
        return None;
    }
    chrono::DateTime::parse_from_rfc3339(s)
        .ok()
        .map(|dt| dt.with_timezone(&chrono::Utc))
        .or_else(|| {
            chrono::NaiveDateTime::parse_from_str(s, "%Y-%m-%dT%H:%M:%fZ")
                .ok()
                .map(|ndt| ndt.and_utc())
        })
}

#[cfg(test)]
mod sender_search_tests {
    use super::*;
    use crate::open_sqlite_migrated;

    #[test]
    fn sender_search_account_wide_finds_other_mailbox() {
        let dir = tempfile::tempdir().expect("tempdir");
        let path = dir.path().join("search.db");
        let conn = open_sqlite_migrated(&path).expect("migrate");
        conn.execute(
            "INSERT INTO accounts (id, display_name, email, imap_host, imap_port, imap_security, smtp_host, smtp_port, smtp_security) VALUES ('a1', 'Me', 'me@x.com', 'h', 993, 'tls', 'h', 587, 'tls')",
            [],
        )
        .expect("account");
        conn.execute(
            "INSERT INTO threads (id, account_id, mailbox, subject, tags) VALUES ('t1', 'a1', 'INBOX', 'in', '')",
            [],
        )
        .expect("thread");
        conn.execute(
            "INSERT INTO threads (id, account_id, mailbox, subject, tags) VALUES ('t2', 'a1', 'Perso/Factures', 'facture', '')",
            [],
        )
        .expect("thread");
        conn.execute(
            "
            INSERT INTO messages (
                id, thread_id, account_id, mailbox, sender_name, sender_email, subject, received_at,
                body, body_plain, position, is_read
            ) VALUES (
                'm1', 't1', 'a1', 'INBOX', 'Bob', 'bob@x.com', 'in', '2024-01-01T00:00:00Z',
                'hi', 'hi', 0, 1
            )
            ",
            [],
        )
        .expect("m1");
        conn.execute(
            "
            INSERT INTO messages (
                id, thread_id, account_id, mailbox, sender_name, sender_email, subject, received_at,
                body, body_plain, to_header, position, is_read
            ) VALUES (
                'm2', 't2', 'a1', 'Perso/Factures', 'Alice', 'alice@x.com', 'facture', '2024-01-02T00:00:00Z',
                'facture', 'facture', 'bob@x.com', 0, 1
            )
            ",
            [],
        )
        .expect("m2");
        drop(conn);

        let like = sql_like_fragment("bob@x.com");
        let conn = open_sqlite_migrated(&path).expect("reopen");
        let ids = thread_ids_for_sender(&conn, "a1", None, &like).expect("search");
        assert!(ids.contains(&"t1".to_string()));
        assert!(
            ids.contains(&"t2".to_string()),
            "contact in To on personal folder must match account-wide @ search"
        );

        let query = SearchQuery {
            text: None,
            tags: vec![],
            sender: Some("bob@x.com".into()),
            senders: vec!["bob@x.com".into()],
            account_id: Some("a1".into()),
            mailbox: None,
            mode: SearchMode::Lexical,
            language: None,
        };
        let hits = sqlite_search_threads_unified(&path, &query).expect("unified");
        assert_eq!(hits.len(), 2, "both threads involving bob@x.com");
    }

    #[test]
    fn tag_only_search_finds_threads_with_source_tag() {
        let dir = tempfile::tempdir().expect("tempdir");
        let path = dir.path().join("tags_search.db");
        let conn = open_sqlite_migrated(&path).expect("migrate");
        conn.execute(
            "INSERT INTO accounts (id, display_name, email, imap_host, imap_port, imap_security, smtp_host, smtp_port, smtp_security) VALUES ('a1', 'Me', 'me@x.com', 'h', 993, 'tls', 'h', 587, 'tls')",
            [],
        )
        .expect("account");
        conn.execute(
            "INSERT INTO threads (id, account_id, mailbox, subject, tags) VALUES ('t1', 'a1', 'INBOX', 'allianz', 'source:imap,source:agents.allianz.com,kind:inbox')",
            [],
        )
        .expect("t1");
        conn.execute(
            "INSERT INTO threads (id, account_id, mailbox, subject, tags) VALUES ('t2', 'a1', 'INBOX', 'other', 'source:imap,source:other.com,kind:inbox')",
            [],
        )
        .expect("t2");
        conn.execute(
            "
            INSERT INTO messages (
                id, thread_id, account_id, mailbox, sender_name, sender_email, subject, received_at,
                body, body_plain, position, is_read
            ) VALUES (
                'm1', 't1', 'a1', 'INBOX', 'A', 'a@agents.allianz.com', 'allianz', '2024-01-01T00:00:00Z',
                'x', 'x', 0, 1
            ),
            (
                'm2', 't2', 'a1', 'INBOX', 'B', 'b@other.com', 'other', '2024-01-02T00:00:00Z',
                'y', 'y', 0, 1
            )
            ",
            [],
        )
        .expect("messages");
        drop(conn);

        let query = SearchQuery {
            text: None,
            tags: vec![Tag::source("agents.allianz.com")],
            sender: None,
            senders: vec![],
            account_id: Some("a1".into()),
            mailbox: None,
            mode: SearchMode::Lexical,
            language: None,
        };
        let hits = sqlite_search_threads_unified(&path, &query).expect("tag search");
        assert_eq!(hits.len(), 1);
        assert_eq!(hits[0].id.0, "t1");

        let query_wild = SearchQuery {
            text: None,
            tags: vec![Tag::source("agents.allianz*")],
            sender: None,
            senders: vec![],
            account_id: Some("a1".into()),
            mailbox: None,
            mode: SearchMode::Lexical,
            language: None,
        };
        let wild = sqlite_search_threads_unified(&path, &query_wild).expect("wildcard");
        assert_eq!(wild.len(), 1);
    }

    #[test]
    fn email_text_query_uses_sender_path_not_all_threads() {
        let dir = tempfile::tempdir().expect("tempdir");
        let path = dir.path().join("email_search.db");
        let conn = open_sqlite_migrated(&path).expect("migrate");
        conn.execute(
            "INSERT INTO accounts (id, display_name, email, imap_host, imap_port, imap_security, smtp_host, smtp_port, smtp_security) VALUES ('a1', 'Me', 'me@x.com', 'h', 993, 'tls', 'h', 587, 'tls')",
            [],
        )
        .expect("account");
        conn.execute(
            "INSERT INTO threads (id, account_id, mailbox, subject, tags) VALUES ('t-ionos', 'a1', 'INBOX', 'ionos', '')",
            [],
        )
        .expect("t-ionos");
        conn.execute(
            "INSERT INTO threads (id, account_id, mailbox, subject, tags) VALUES ('t-other', 'a1', 'INBOX', 'other', '')",
            [],
        )
        .expect("t-other");
        conn.execute(
            "
            INSERT INTO messages (
                id, thread_id, account_id, mailbox, sender_name, sender_email, subject, received_at,
                body, body_plain, position, is_read
            ) VALUES (
                'm-ionos', 't-ionos', 'a1', 'INBOX', 'IONOS', 'noreply@ionos.fr', 'facture', '2024-01-01T00:00:00Z',
                'ionos', 'ionos', 0, 1
            ),
            (
                'm-other', 't-other', 'a1', 'INBOX', 'Bob', 'bob@example.com', 'hello', '2024-01-02T00:00:00Z',
                'hello', 'hello', 0, 1
            )
            ",
            [],
        )
        .expect("messages");
        drop(conn);

        let query = SearchQuery {
            text: Some("noreply@ionos.fr".into()),
            tags: vec![],
            sender: None,
            senders: vec![],
            account_id: Some("a1".into()),
            mailbox: None,
            mode: SearchMode::Hybrid,
            language: None,
        };
        let hits = sqlite_search_threads_unified(&path, &query).expect("email search");
        assert_eq!(hits.len(), 1);
        assert_eq!(hits[0].id.0, "t-ionos");
    }
}
