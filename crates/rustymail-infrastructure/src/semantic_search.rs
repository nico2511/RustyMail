//! SQLite-backed lexical + optional MiniLM semantic search, and embedding index.

use std::collections::{HashMap, HashSet};
use std::path::PathBuf;
use std::sync::{Mutex, OnceLock};

use rusqlite::{params, Connection, OptionalExtension};
use rustymail_domain::{
    absorb_search_operators, lexical_search_terms, EntityKind, SearchMode, SearchQuery, Tag,
    ThreadListItem,
};

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
    let resolved = resolve_scoped_mailbox_for_account(&conn, account_id, mailbox)
        .map_err(|e| e.to_string())?;

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
    let resolved = resolve_scoped_mailbox_for_account(&conn, account_id, mailbox)
        .map_err(|e| e.to_string())?;
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

/// Indexe uniquement les messages du compte sans embedding pour le modèle courant.
pub fn reindex_semantic_missing(
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
            SELECT m.id, m.subject, COALESCE(m.body_plain, m.body) AS bp
            FROM messages m
            WHERE m.account_id = ?1
              AND NOT EXISTS (
                SELECT 1 FROM message_embeddings e
                WHERE e.message_id = m.id AND e.model_id = ?2
              )
            ORDER BY m.received_at DESC
            LIMIT 500
            ",
        )
        .map_err(|e| e.to_string())?;
    let rows: Vec<(String, String, String)> = stmt
        .query_map(params![account_id, EMBEDDING_MODEL_ID], |row| {
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
    if m.sender
        .name
        .as_deref()
        .is_some_and(|n| n.to_ascii_lowercase().contains(needle_lc))
    {
        return true;
    }
    if m.recipients
        .iter()
        .any(|r| r.email.to_ascii_lowercase().contains(needle_lc))
    {
        return true;
    }
    if m.reply_to
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
    mailbox_prefix: Option<&str>,
    like_pat: &str,
) -> Result<Vec<String>, String> {
    let mut sql = String::from(
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
    );
    let mut idx = 3i32;
    if scope_mailbox.is_some() {
        sql.push_str(&format!(" AND lower(trim(mailbox)) = lower(trim(?{idx}))"));
        idx += 1;
    }
    if mailbox_prefix.is_some() {
        sql.push_str(&format!(
            " AND (lower(trim(mailbox)) = lower(trim(?{idx}))
               OR lower(mailbox) LIKE lower(trim(?{idx})) || '/%'
               OR lower(mailbox) LIKE lower(trim(?{idx})) || '.%')"
        ));
    }
    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
    let rows = match (scope_mailbox, mailbox_prefix) {
        (Some(mbox), Some(prefix)) => stmt
            .query_map(params![account_id, like_pat, mbox, prefix], |row| {
                row.get(0)
            })
            .map_err(|e| e.to_string())?
            .collect::<Result<Vec<String>, _>>(),
        (Some(mbox), None) => stmt
            .query_map(params![account_id, like_pat, mbox], |row| row.get(0))
            .map_err(|e| e.to_string())?
            .collect::<Result<Vec<String>, _>>(),
        (None, Some(prefix)) => stmt
            .query_map(params![account_id, like_pat, prefix], |row| row.get(0))
            .map_err(|e| e.to_string())?
            .collect::<Result<Vec<String>, _>>(),
        (None, None) => stmt
            .query_map(params![account_id, like_pat], |row| row.get(0))
            .map_err(|e| e.to_string())?
            .collect::<Result<Vec<String>, _>>(),
    };
    rows.map_err(|e| e.to_string())
}

fn fts_quote(term: &str) -> String {
    format!("\"{}\"", term.replace('"', "\"\""))
}

/// Requête FTS5 : termes (ET), préfixe `"mot"*`, phrase, sujet, destinataire, exclusion.
///
/// Chaque terme utilisateur est quoté. Un préfixe `jean-pierre*` devient `"jean-pierre"*` :
/// sans guillemets FTS5 lit le trait d'union comme un nom de colonne (`no such column: pierre`).
fn fts_match_expr(
    needle: &str,
    subject: Option<&str>,
    phrases: &[String],
    recipients: &[String],
    exclude: &[String],
) -> Option<String> {
    let mut positive: Vec<String> = Vec::new();
    for phrase in phrases {
        let folded = fold_search_text(phrase);
        if folded.is_empty() {
            continue;
        }
        positive.push(fts_quote(&folded));
    }
    if let Some(subject) = subject.map(str::trim).filter(|s| !s.is_empty()) {
        let folded = fold_search_text(subject);
        if !folded.is_empty() {
            positive.push(format!("subject : {}", fts_quote(&folded)));
        }
    }
    for recipient in recipients {
        let folded = fold_search_text(recipient);
        if folded.is_empty() {
            continue;
        }
        positive.push(format!("recipients : {}", fts_quote(&folded)));
    }
    for term in lexical_search_terms(&fold_search_text(needle)) {
        if let Some(prefix) = term.strip_suffix('*') {
            let prefix = prefix.trim();
            if prefix.chars().count() >= 2 {
                positive.push(format!("{}*", fts_quote(prefix)));
                continue;
            }
        }
        positive.push(fts_quote(&term));
    }
    if positive.is_empty() {
        return None;
    }
    let mut query = positive.join(" AND ");
    for term in exclude {
        let folded = fold_search_text(term);
        if folded.is_empty() {
            continue;
        }
        query.push_str(" NOT ");
        query.push_str(&fts_quote(&folded));
    }
    Some(query)
}

fn fold_search_text(value: &str) -> String {
    let mut out = String::with_capacity(value.len());
    for ch in value.chars() {
        match ch {
            'à' | 'á' | 'â' | 'ä' | 'ã' | 'å' | 'À' | 'Á' | 'Â' | 'Ä' | 'Ã' | 'Å' => {
                out.push('a')
            }
            'è' | 'é' | 'ê' | 'ë' | 'È' | 'É' | 'Ê' | 'Ë' => out.push('e'),
            'ì' | 'í' | 'î' | 'ï' | 'Ì' | 'Í' | 'Î' | 'Ï' => out.push('i'),
            'ò' | 'ó' | 'ô' | 'ö' | 'õ' | 'Ò' | 'Ó' | 'Ô' | 'Ö' | 'Õ' => out.push('o'),
            'ù' | 'ú' | 'û' | 'ü' | 'Ù' | 'Ú' | 'Û' | 'Ü' => out.push('u'),
            'ý' | 'ÿ' | 'Ý' | 'Ÿ' => out.push('y'),
            'ç' | 'Ç' => out.push('c'),
            'ñ' | 'Ñ' => out.push('n'),
            'œ' | 'Œ' => out.push_str("oe"),
            'æ' | 'Æ' => out.push_str("ae"),
            other => out.push(other.to_ascii_lowercase()),
        }
    }
    out.split_whitespace().collect::<Vec<_>>().join(" ")
}

/// Lexical via FTS5 (bm25). LIKE seulement si la table FTS est absente — jamais si elle renvoie 0.
/// Retourne (thread_ids ordonnés, scores normalisés 0–1 par thread).
fn lexical_thread_ids_with_scores(
    conn: &Connection,
    account_id: &str,
    scope_mailbox: Option<&str>,
    mailbox_prefix: Option<&str>,
    needle: &str,
    subject: Option<&str>,
    phrases: &[String],
    recipients: &[String],
    exclude: &[String],
) -> Result<(Vec<String>, HashMap<String, f32>), String> {
    let fts_query = fts_match_expr(needle, subject, phrases, recipients, exclude);
    let tokens = like_tokens(needle, subject, phrases, recipients);

    let fts_table = conn
        .query_row(
            "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='messages_fts'",
            [],
            |r| r.get::<_, i64>(0),
        )
        .map(|n| n > 0)
        .unwrap_or(false);
    let fts_ok = fts_table && crate::messages_fts_index_ready(conn);

    if fts_ok {
        let Some(fts_query) = fts_query else {
            if exclude.iter().any(|t| !fold_search_text(t).is_empty()) {
                return exclusion_only_thread_ids(
                    conn,
                    account_id,
                    scope_mailbox,
                    mailbox_prefix,
                    exclude,
                );
            }
            return Ok((Vec::new(), HashMap::new()));
        };
        let mut sql = String::from(
            "
            SELECT m.thread_id, bm25(messages_fts) AS score
            FROM messages_fts
            INNER JOIN messages m ON m.rowid = messages_fts.rowid
            WHERE messages_fts MATCH ?1 AND m.account_id = ?2
            ",
        );
        let mut bind_idx = 3i32;
        if scope_mailbox.is_some() {
            sql.push_str(&format!(
                " AND lower(trim(m.mailbox)) = lower(trim(?{bind_idx}))"
            ));
            bind_idx += 1;
        }
        if mailbox_prefix.is_some() {
            sql.push_str(&format!(
                " AND (lower(trim(m.mailbox)) = lower(trim(?{bind_idx}))
                   OR lower(m.mailbox) LIKE lower(trim(?{bind_idx})) || '/%'
                   OR lower(m.mailbox) LIKE lower(trim(?{bind_idx})) || '.%')"
            ));
        }
        sql.push_str(" ORDER BY score ASC");

        let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;

        let mut pairs: Vec<(String, f64)> = Vec::new();
        let map_ok = if let (Some(mbox), Some(prefix)) = (scope_mailbox, mailbox_prefix) {
            let mapped = stmt.query_map(params![fts_query, account_id, mbox, prefix], |row| {
                Ok((row.get::<_, String>(0)?, row.get::<_, f64>(1)?))
            });
            match mapped {
                Ok(rows) => {
                    for r in rows {
                        pairs.push(r.map_err(|e| format!("fts row: {e}"))?);
                    }
                    true
                }
                Err(e) => return Err(format!("recherche FTS : {e}")),
            }
        } else if let Some(mbox) = scope_mailbox {
            let mapped = stmt.query_map(params![fts_query, account_id, mbox], |row| {
                Ok((row.get::<_, String>(0)?, row.get::<_, f64>(1)?))
            });
            match mapped {
                Ok(rows) => {
                    for r in rows {
                        pairs.push(r.map_err(|e| format!("fts row: {e}"))?);
                    }
                    true
                }
                Err(e) => return Err(format!("recherche FTS : {e}")),
            }
        } else if let Some(prefix) = mailbox_prefix {
            let mapped = stmt.query_map(params![fts_query, account_id, prefix], |row| {
                Ok((row.get::<_, String>(0)?, row.get::<_, f64>(1)?))
            });
            match mapped {
                Ok(rows) => {
                    for r in rows {
                        pairs.push(r.map_err(|e| format!("fts row: {e}"))?);
                    }
                    true
                }
                Err(e) => return Err(format!("recherche FTS : {e}")),
            }
        } else {
            let mapped = stmt.query_map(params![fts_query, account_id], |row| {
                Ok((row.get::<_, String>(0)?, row.get::<_, f64>(1)?))
            });
            match mapped {
                Ok(rows) => {
                    for r in rows {
                        pairs.push(r.map_err(|e| format!("fts row: {e}"))?);
                    }
                    true
                }
                Err(e) => return Err(format!("recherche FTS : {e}")),
            }
        };

        if !map_ok {
            return Err("recherche FTS : la requête MATCH a été refusée".into());
        }
        if pairs.is_empty() {
            return Ok((Vec::new(), HashMap::new()));
        }
        let mut best: HashMap<String, f64> = HashMap::new();
        for (tid, score) in pairs {
            best.entry(tid)
                .and_modify(|prev| {
                    if score < *prev {
                        *prev = score;
                    }
                })
                .or_insert(score);
        }
        let pairs: Vec<(String, f64)> = best.into_iter().collect();
        let min_s = pairs.iter().map(|(_, s)| *s).fold(f64::INFINITY, f64::min);
        let max_s = pairs
            .iter()
            .map(|(_, s)| *s)
            .fold(f64::NEG_INFINITY, f64::max);
        let span = (max_s - min_s).abs().max(1e-6);
        let mut scores = HashMap::new();
        let mut ids = Vec::new();
        for (tid, s) in pairs {
            let norm: f32 = 1.0 - ((s - min_s) / span) as f32;
            scores.insert(tid.clone(), norm.clamp(0.0, 1.0));
            ids.push(tid);
        }
        return Ok((ids, scores));
    }

    if tokens.is_empty() {
        if exclude.iter().any(|t| !fold_search_text(t).is_empty()) {
            return exclusion_only_thread_ids(
                conn,
                account_id,
                scope_mailbox,
                mailbox_prefix,
                exclude,
            );
        }
        return Ok((Vec::new(), HashMap::new()));
    }
    let (mut ids, mut scores) =
        lexical_fallback_intersect(conn, account_id, scope_mailbox, mailbox_prefix, &tokens)?;
    if exclude.iter().any(|t| !fold_search_text(t).is_empty()) {
        let blocked =
            threads_matching_exclude(conn, account_id, scope_mailbox, mailbox_prefix, exclude)?;
        ids.retain(|id| !blocked.contains(id));
        scores.retain(|id, _| ids.iter().any(|kept| kept == id));
    }
    Ok((ids, scores))
}

fn like_tokens(
    needle: &str,
    subject: Option<&str>,
    phrases: &[String],
    recipients: &[String],
) -> Vec<String> {
    let mut tokens = Vec::new();
    for term in lexical_search_terms(&fold_search_text(needle)) {
        let bare = term.trim_end_matches('*').trim();
        if bare.chars().count() >= 2 {
            tokens.push(bare.to_string());
        }
    }
    if let Some(subject) = subject {
        for term in lexical_search_terms(&fold_search_text(subject)) {
            if term.chars().count() >= 2 {
                tokens.push(term);
            }
        }
    }
    for phrase in phrases {
        for term in lexical_search_terms(&fold_search_text(phrase)) {
            if term.chars().count() >= 2 {
                tokens.push(term);
            }
        }
    }
    for recipient in recipients {
        let folded = fold_search_text(recipient);
        if folded.chars().count() >= 2 {
            tokens.push(folded);
        }
    }
    tokens
}

fn exclusion_only_thread_ids(
    conn: &Connection,
    account_id: &str,
    scope_mailbox: Option<&str>,
    mailbox_prefix: Option<&str>,
    exclude: &[String],
) -> Result<(Vec<String>, HashMap<String, f32>), String> {
    let patterns: Vec<String> = exclude
        .iter()
        .map(|t| fold_search_text(t))
        .filter(|t| !t.is_empty())
        .map(|t| sql_like_fragment(&t))
        .collect();
    if patterns.is_empty() {
        return Ok((Vec::new(), HashMap::new()));
    }
    let mut sql = String::from(
        "
        SELECT t.id FROM threads t
        WHERE t.account_id = ?1
          AND EXISTS (
            SELECT 1 FROM messages m
            WHERE m.thread_id = t.id AND m.account_id = ?1
        ",
    );
    append_message_scope(&mut sql, scope_mailbox, mailbox_prefix, 2);
    sql.push_str(
        "
          )
          AND NOT EXISTS (
            SELECT 1 FROM messages m
            WHERE m.thread_id = t.id AND m.account_id = ?1
        ",
    );
    append_message_scope(&mut sql, scope_mailbox, mailbox_prefix, 2);
    sql.push_str(" AND (");
    for (i, _) in patterns.iter().enumerate() {
        if i > 0 {
            sql.push_str(" OR ");
        }
        let p =
            i + 2 + usize::from(scope_mailbox.is_some()) + usize::from(mailbox_prefix.is_some());
        sql.push_str(&format!(
            "lower(COALESCE(m.subject, '')) LIKE ?{p} ESCAPE '\\'
             OR lower(COALESCE(m.body_plain, m.body, '')) LIKE ?{p} ESCAPE '\\'
             OR lower(COALESCE(m.sender_email, '')) LIKE ?{p} ESCAPE '\\'
             OR lower(COALESCE(m.sender_name, '')) LIKE ?{p} ESCAPE '\\'"
        ));
    }
    sql.push_str(")) ORDER BY t.id");

    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
    let bind = sql_bind_owned(account_id, scope_mailbox, mailbox_prefix, &patterns);
    let bind_refs: Vec<&dyn rusqlite::types::ToSql> = bind.iter().map(|v| v.as_ref()).collect();
    let ids = stmt
        .query_map(rusqlite::params_from_iter(bind_refs.iter()), |row| {
            row.get(0)
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<String>, _>>()
        .map_err(|e| e.to_string())?;
    let n = ids.len().max(1) as f32;
    let scores = ids
        .iter()
        .enumerate()
        .map(|(i, id)| (id.clone(), 1.0 - (i as f32 / n)))
        .collect();
    Ok((ids, scores))
}

fn append_message_scope(
    sql: &mut String,
    scope_mailbox: Option<&str>,
    mailbox_prefix: Option<&str>,
    start_idx: i32,
) {
    let mut idx = start_idx;
    if scope_mailbox.is_some() {
        sql.push_str(&format!(
            " AND lower(trim(m.mailbox)) = lower(trim(?{idx}))"
        ));
        idx += 1;
    }
    if mailbox_prefix.is_some() {
        sql.push_str(&format!(
            " AND (lower(trim(m.mailbox)) = lower(trim(?{idx}))
               OR lower(m.mailbox) LIKE lower(trim(?{idx})) || '/%'
               OR lower(m.mailbox) LIKE lower(trim(?{idx})) || '.%')"
        ));
    }
}

fn threads_matching_exclude(
    conn: &Connection,
    account_id: &str,
    scope_mailbox: Option<&str>,
    mailbox_prefix: Option<&str>,
    exclude: &[String],
) -> Result<HashSet<String>, String> {
    let patterns: Vec<String> = exclude
        .iter()
        .map(|t| fold_search_text(t))
        .filter(|t| !t.is_empty())
        .map(|t| sql_like_fragment(&t))
        .collect();
    if patterns.is_empty() {
        return Ok(HashSet::new());
    }
    let mut sql = String::from(
        "
        SELECT DISTINCT m.thread_id FROM messages m
        WHERE m.account_id = ?1
        ",
    );
    append_message_scope(&mut sql, scope_mailbox, mailbox_prefix, 2);
    sql.push_str(" AND (");
    for (i, _) in patterns.iter().enumerate() {
        if i > 0 {
            sql.push_str(" OR ");
        }
        let p =
            i + 2 + usize::from(scope_mailbox.is_some()) + usize::from(mailbox_prefix.is_some());
        sql.push_str(&format!(
            "lower(COALESCE(m.subject, '')) LIKE ?{p} ESCAPE '\\'
             OR lower(COALESCE(m.body_plain, m.body, '')) LIKE ?{p} ESCAPE '\\'
             OR lower(COALESCE(m.sender_email, '')) LIKE ?{p} ESCAPE '\\'
             OR lower(COALESCE(m.sender_name, '')) LIKE ?{p} ESCAPE '\\'"
        ));
    }
    sql.push(')');
    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
    let bind = sql_bind_owned(account_id, scope_mailbox, mailbox_prefix, &patterns);
    let bind_refs: Vec<&dyn rusqlite::types::ToSql> = bind.iter().map(|v| v.as_ref()).collect();
    let ids = stmt
        .query_map(rusqlite::params_from_iter(bind_refs.iter()), |row| {
            row.get(0)
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<HashSet<String>, _>>()
        .map_err(|e| e.to_string())?;
    Ok(ids)
}

fn sql_bind_owned(
    account_id: &str,
    scope_mailbox: Option<&str>,
    mailbox_prefix: Option<&str>,
    patterns: &[String],
) -> Vec<Box<dyn rusqlite::types::ToSql>> {
    let mut bind: Vec<Box<dyn rusqlite::types::ToSql>> = vec![Box::new(account_id.to_string())];
    if let Some(mbox) = scope_mailbox {
        bind.push(Box::new(mbox.to_string()));
    }
    if let Some(prefix) = mailbox_prefix {
        bind.push(Box::new(prefix.to_string()));
    }
    for pat in patterns {
        bind.push(Box::new(pat.clone()));
    }
    bind
}

fn lexical_fallback_intersect(
    conn: &Connection,
    account_id: &str,
    scope_mailbox: Option<&str>,
    mailbox_prefix: Option<&str>,
    tokens: &[String],
) -> Result<(Vec<String>, HashMap<String, f32>), String> {
    let like0 = sql_like_fragment(tokens[0].as_str());
    let mut ids =
        lexical_thread_ids_for_like(conn, account_id, scope_mailbox, mailbox_prefix, &like0)?;
    for tok in tokens.iter().skip(1) {
        let liken = sql_like_fragment(tok.as_str());
        let next_ids =
            lexical_thread_ids_for_like(conn, account_id, scope_mailbox, mailbox_prefix, &liken)?;
        let allowed: HashSet<String> = next_ids.into_iter().collect();
        ids.retain(|id| allowed.contains(id));
        if ids.is_empty() {
            break;
        }
    }
    let n = ids.len().max(1) as f32;
    let scores: HashMap<String, f32> = ids
        .iter()
        .enumerate()
        .map(|(i, id)| (id.clone(), 1.0 - (i as f32 / n)))
        .collect();
    Ok((ids, scores))
}

/// Correspondance exacte, préfixe `*`, ou hiérarchie parent (`facture` ⊂ `facture/gas`).
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
    if thread_tag.value.eq_ignore_ascii_case(qv) {
        return true;
    }
    // Hiérarchie : query `parent` matche `parent/child`
    let tv = thread_tag.value.to_ascii_lowercase();
    let ql = qv.to_ascii_lowercase();
    tv.starts_with(&format!("{ql}/"))
}

fn thread_satisfies_tag(thread: &rustymail_domain::Thread, query_tag: &Tag) -> bool {
    thread.tags.iter().any(|t| tag_matches_query(t, query_tag))
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

    if let Some(want_att) = query.has_attachment {
        let has = thread.messages.iter().any(|m| {
            !m.attachments.is_empty()
                || m.tags.iter().any(|t| {
                    matches!(t.family, rustymail_domain::TagFamily::State)
                        && t.value.eq_ignore_ascii_case("attachment")
                })
        }) || thread.tags.iter().any(|t| {
            matches!(t.family, rustymail_domain::TagFamily::State)
                && t.value.eq_ignore_ascii_case("attachment")
        });
        if has != want_att {
            return false;
        }
    }

    if !query
        .tags
        .iter()
        .all(|tag| thread_satisfies_tag(thread, tag))
    {
        return false;
    }

    true
}

fn thread_matches_date_and_security(
    item: &ThreadListItem,
    query: &SearchQuery,
    security_score: Option<f32>,
) -> bool {
    if let Some(min_sec) = query.min_security_score {
        match security_score {
            Some(s) if s >= 0.0 => {
                if s < min_sec {
                    return false;
                }
            }
            _ => return false,
        }
    }

    let activity = parse_activity_after(&item.last_activity);
    if let Some(days) = query.relative_days.filter(|d| *d > 0) {
        let cutoff = chrono::Utc::now() - chrono::Duration::days(days);
        match activity {
            Some(dt) if dt >= cutoff => {}
            _ => return false,
        }
    }
    if let Some(from) = query.date_from.as_deref().and_then(parse_activity_after) {
        match activity {
            Some(dt) if dt >= from => {}
            _ => return false,
        }
    }
    if let Some(to) = query.date_to.as_deref().and_then(parse_activity_after) {
        match activity {
            Some(dt) if dt <= to => {}
            _ => return false,
        }
    }
    true
}

fn mailbox_matches_prefix(mailbox: &str, prefix: &str) -> bool {
    let mb = mailbox.trim().to_ascii_lowercase();
    let p = prefix.trim().to_ascii_lowercase();
    if p.is_empty() {
        return true;
    }
    mb == p || mb.starts_with(&format!("{p}/")) || mb.starts_with(&format!("{p}."))
}

pub fn sqlite_search_threads_unified(
    db_path: &std::path::Path,
    query: &SearchQuery,
) -> Result<Vec<ThreadListItem>, String> {
    let mut query_owned = query.clone();
    absorb_search_operators(&mut query_owned)?;
    let query = &query_owned;
    let Some(account_id) = query
        .account_id
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
    else {
        return Err("account_id requis pour la recherche SQLite".to_string());
    };
    let raw_mailbox = query.mailbox.as_deref().filter(|s| !s.trim().is_empty());
    let mailbox_prefix = query
        .mailbox_prefix
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty());

    let conn = open_sqlite_migrated(db_path).map_err(|e| e.to_string())?;

    let scope_resolved: Option<String> = if let Some(mb) = raw_mailbox {
        Some(resolve_scoped_mailbox_for_account(&conn, account_id, mb).map_err(|e| e.to_string())?)
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
    let has_lexical = text_lc.is_some()
        || query
            .subject
            .as_deref()
            .is_some_and(|s| !s.trim().is_empty())
        || !query.phrases.is_empty()
        || !query.recipients.is_empty()
        || !query.exclude_terms.is_empty();

    let mut lexical_scores: HashMap<String, f32> = HashMap::new();
    let mut lexical_thread_ids: Vec<String> = Vec::new();
    if has_lexical {
        let (ids, scores) = lexical_thread_ids_with_scores(
            &conn,
            account_id,
            scope_mailbox,
            mailbox_prefix,
            text_lc.as_deref().unwrap_or(""),
            query.subject.as_deref(),
            &query.phrases,
            &query.recipients,
            &query.exclude_terms,
        )?;
        lexical_thread_ids = ids;
        lexical_scores = scores;
    }

    let senders = effective_senders(query);
    if !senders.is_empty() {
        let sender_ids = thread_ids_for_senders(&conn, account_id, scope_mailbox, &senders)?;
        if has_lexical {
            let allowed: HashSet<String> = sender_ids.into_iter().collect();
            lexical_thread_ids.retain(|id| allowed.contains(id));
            lexical_scores.retain(|id, _| allowed.contains(id));
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
                        SELECT m.thread_id, e.vector, e.dim, m.mailbox
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
                                row.get::<_, String>(3)?,
                            ))
                        })
                        .map_err(|e| e.to_string())?;
                    for r in rows {
                        let (thread_id, blob, dim, mb) = r.map_err(|e| e.to_string())?;
                        if let Some(prefix) = mailbox_prefix {
                            if !mailbox_matches_prefix(&mb, prefix) {
                                continue;
                            }
                        }
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

    let hybrid_alpha = query.hybrid_lexical_weight.unwrap_or(0.55).clamp(0.0, 1.0);

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
            // Fusion α·lexical + (1−α)·semantic ; candidats = union des deux.
            let mut all: HashSet<String> = HashSet::new();
            all.extend(lexical_thread_ids.iter().cloned());
            for (tid, s) in &semantic_scores {
                if *s > 0.12 {
                    all.insert(tid.clone());
                }
            }
            if all.is_empty() {
                lexical_thread_ids
            } else {
                let mut scored: Vec<(String, f32)> = all
                    .into_iter()
                    .map(|tid| {
                        let lex = lexical_scores.get(&tid).copied().unwrap_or(0.0);
                        let sem = semantic_scores.get(&tid).copied().unwrap_or(0.0);
                        let fused = hybrid_alpha * lex + (1.0 - hybrid_alpha) * sem;
                        (tid, fused)
                    })
                    .collect();
                scored.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal));
                scored.into_iter().map(|(id, _)| id).collect()
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
    let facets_only = text_lc.is_none()
        && senders_empty
        && query.tags.is_empty()
        && query
            .language
            .as_ref()
            .map_or(true, |s| s.trim().is_empty())
        && (query.has_attachment.is_some()
            || query.min_security_score.is_some()
            || query.relative_days.is_some()
            || query.date_from.is_some()
            || query.date_to.is_some()
            || mailbox_prefix.is_some());
    let browse_empty = text_lc.is_none()
        && senders_empty
        && query.tags.is_empty()
        && query
            .language
            .as_ref()
            .map_or(true, |s| s.trim().is_empty())
        && query.has_attachment.is_none()
        && query.min_security_score.is_none()
        && query.relative_days.is_none()
        && query.date_from.is_none()
        && query.date_to.is_none()
        && mailbox_prefix.is_none();

    if thread_ids.is_empty()
        && matches!(query.mode, SearchMode::Lexical | SearchMode::Hybrid)
        && (browse_empty || tags_only || lang_only || facets_only)
    {
        thread_ids = load_thread_ids_in_scope(&conn, account_id, scope_mailbox)?;
    }

    let unlimited = query.limit == Some(u32::MAX);
    let page_offset = if unlimited {
        0
    } else {
        query.offset.unwrap_or(0) as usize
    };
    let page_limit = if unlimited {
        usize::MAX
    } else {
        query.limit.unwrap_or(200).clamp(1, 500) as usize
    };
    let mut out: Vec<ThreadListItem> = Vec::new();
    for tid in thread_ids {
        // Ne pas re-filtrer sur `threads.mailbox` : les candidats viennent déjà des
        // `messages` du dossier (un fil peut avoir `threads.mailbox` différent si
        // des messages existent encore dans le dossier demandé).
        let row: Option<(String, String, String, String, bool, f32)> = conn
            .query_row(
                "SELECT id, subject, tags, mailbox, COALESCE(is_followed, 0),
                        COALESCE(security_score, -1)
                 FROM threads WHERE id = ?1 AND account_id = ?2",
                params![tid, account_id],
                |r| {
                    Ok((
                        r.get(0)?,
                        r.get(1)?,
                        r.get(2)?,
                        r.get(3)?,
                        r.get::<_, i64>(4)? != 0,
                        r.get::<_, f64>(5)? as f32,
                    ))
                },
            )
            .optional()
            .map_err(|e| e.to_string())?;
        let Some((id, subject, tags, mailbox, followed, sec_score)) = row else {
            continue;
        };
        if let Some(prefix) = mailbox_prefix {
            if !thread_has_message_in_prefix(&conn, &id, account_id, prefix)? {
                continue;
            }
        }
        let thread =
            build_thread_from_row(&conn, id, subject, tags, followed).map_err(|e| e.to_string())?;
        if !matches_thread_filters(&thread, query) {
            continue;
        }
        let mut item = thread.list_item(mailbox.trim().to_string());
        item.is_newsletter_thread =
            thread_blocks_reply(&thread, &account_emails, &newsletter_rules);
        let sec = if sec_score >= 0.0 {
            Some(sec_score)
        } else {
            None
        };
        if !thread_matches_date_and_security(&item, query, sec) {
            continue;
        }
        out.push(item);
        if out.len() >= page_offset.saturating_add(page_limit) {
            break;
        }
    }

    Ok(out.into_iter().skip(page_offset).take(page_limit).collect())
}

fn thread_has_message_in_prefix(
    conn: &Connection,
    thread_id: &str,
    account_id: &str,
    prefix: &str,
) -> Result<bool, String> {
    let n: i64 = conn
        .query_row(
            "
            SELECT COUNT(*) FROM messages
            WHERE thread_id = ?1 AND account_id = ?2
              AND (lower(trim(mailbox)) = lower(trim(?3))
                OR lower(mailbox) LIKE lower(trim(?3)) || '/%'
                OR lower(mailbox) LIKE lower(trim(?3)) || '.%')
            ",
            params![thread_id, account_id, prefix],
            |r| r.get(0),
        )
        .map_err(|e| e.to_string())?;
    Ok(n > 0)
}

/// Compte les fils correspondant à une requête ; si `since` est défini, seulement l’activité postérieure.
pub fn count_threads_matching_query(
    db_path: &std::path::Path,
    query: &SearchQuery,
    since: Option<chrono::DateTime<chrono::Utc>>,
) -> Result<usize, String> {
    let mut counted = query.clone();
    counted.limit = Some(u32::MAX);
    counted.offset = Some(0);
    let items = sqlite_search_threads_unified(db_path, &counted)?;
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
            sender: Some("bob@x.com".into()),
            senders: vec!["bob@x.com".into()],
            account_id: Some("a1".into()),
            mode: SearchMode::Lexical,
            ..Default::default()
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
            tags: vec![Tag::source("agents.allianz.com")],
            account_id: Some("a1".into()),
            mode: SearchMode::Lexical,
            ..Default::default()
        };
        let hits = sqlite_search_threads_unified(&path, &query).expect("tag search");
        assert_eq!(hits.len(), 1);
        assert_eq!(hits[0].id.0, "t1");

        let query_wild = SearchQuery {
            tags: vec![Tag::source("agents.allianz*")],
            account_id: Some("a1".into()),
            mode: SearchMode::Lexical,
            ..Default::default()
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
            account_id: Some("a1".into()),
            mode: SearchMode::Hybrid,
            ..Default::default()
        };
        let hits = sqlite_search_threads_unified(&path, &query).expect("email search");
        assert_eq!(hits.len(), 1);
        assert_eq!(hits[0].id.0, "t-ionos");
    }

    fn seed_account(conn: &Connection) {
        conn.execute(
            "INSERT INTO accounts (id, display_name, email, imap_host, imap_port, imap_security, smtp_host, smtp_port, smtp_security) VALUES ('a1', 'Me', 'me@x.com', 'h', 993, 'tls', 'h', 587, 'tls')",
            [],
        )
        .expect("account");
    }

    fn insert_mail(
        conn: &Connection,
        id: &str,
        thread: &str,
        mailbox: &str,
        subject: &str,
        body: &str,
    ) {
        conn.execute(
            "INSERT INTO threads (id, account_id, mailbox, subject, tags) VALUES (?1, 'a1', ?2, ?3, '')",
            params![thread, mailbox, subject],
        )
        .ok();
        conn.execute(
            "
            INSERT INTO messages (
                id, thread_id, account_id, mailbox, sender_name, sender_email, subject, received_at,
                body, body_plain, position, is_read
            ) VALUES (?1, ?2, 'a1', ?3, 'Ada', 'ada@ex.fr', ?4, '2024-06-01T00:00:00Z', ?5, ?5, 0, 1)
            ",
            params![id, thread, mailbox, subject, body],
        )
        .expect("message");
    }

    #[test]
    fn fts_tracks_insert_and_delete_and_does_not_like_fallback_on_zero() {
        let dir = tempfile::tempdir().expect("tempdir");
        let path = dir.path().join("fts.db");
        let conn = open_sqlite_migrated(&path).expect("migrate");
        seed_account(&conn);
        insert_mail(
            &conn,
            "m-old",
            "t-old",
            "INBOX",
            "ancien",
            "zebre historique",
        );
        drop(conn);

        let conn = open_sqlite_migrated(&path).expect("reopen");
        insert_mail(
            &conn,
            "m-new",
            "t-new",
            "Archive/2024",
            "nouveau",
            "zebre tout frais",
        );
        let indexed: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM messages_fts WHERE rowid = (SELECT rowid FROM messages WHERE id = 'm-new')",
                [],
                |r| r.get(0),
            )
            .expect("count fts");
        assert_eq!(indexed, 1, "le mail synchronisé est dans l'index");
        let old_rowid: i64 = conn
            .query_row("SELECT rowid FROM messages WHERE id = 'm-old'", [], |r| {
                r.get(0)
            })
            .expect("rowid");
        conn.execute("DELETE FROM messages WHERE id = 'm-old'", [])
            .expect("delete");
        let gone: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM messages_fts WHERE rowid = ?1",
                [old_rowid],
                |r| r.get(0),
            )
            .expect("count deleted");
        assert_eq!(gone, 0, "le mail supprimé quitte l'index");
        drop(conn);

        let fresh = sqlite_search_threads_unified(
            &path,
            &SearchQuery {
                text: Some("zebre".into()),
                account_id: Some("a1".into()),
                mode: SearchMode::Lexical,
                ..Default::default()
            },
        )
        .expect("search");
        assert_eq!(fresh.len(), 1);
        assert_eq!(fresh[0].id.0, "t-new");

        let none = sqlite_search_threads_unified(
            &path,
            &SearchQuery {
                text: Some("introuvablexyz".into()),
                account_id: Some("a1".into()),
                mode: SearchMode::Lexical,
                ..Default::default()
            },
        )
        .expect("empty fts");
        assert!(
            none.is_empty(),
            "0 résultat FTS ne doit pas retomber sur un parcours LIKE"
        );

        let scoped = sqlite_search_threads_unified(
            &path,
            &SearchQuery {
                text: Some("zebre".into()),
                account_id: Some("a1".into()),
                mailbox_prefix: Some("Archive".into()),
                mode: SearchMode::Lexical,
                ..Default::default()
            },
        )
        .expect("prefix");
        assert_eq!(scoped.len(), 1);
        assert_eq!(scoped[0].id.0, "t-new");

        let inbox = sqlite_search_threads_unified(
            &path,
            &SearchQuery {
                text: Some("zebre".into()),
                account_id: Some("a1".into()),
                mailbox: Some("INBOX".into()),
                mode: SearchMode::Lexical,
                ..Default::default()
            },
        )
        .expect("inbox");
        assert!(inbox.is_empty());
    }

    #[test]
    fn search_operators_subject_phrase_exclude_and_prefix() {
        let dir = tempfile::tempdir().expect("tempdir");
        let path = dir.path().join("ops.db");
        let conn = open_sqlite_migrated(&path).expect("migrate");
        seed_account(&conn);
        insert_mail(
            &conn,
            "m1",
            "t1",
            "INBOX",
            "Commande 12",
            "bon de commande du matériel",
        );
        insert_mail(
            &conn,
            "m2",
            "t2",
            "INBOX",
            "Pub",
            "bon de commande et publicité",
        );
        conn.execute(
            "UPDATE messages SET to_header = 'bob@ex.fr' WHERE id = 'm1'",
            [],
        )
        .expect("to");
        drop(conn);

        let hits = sqlite_search_threads_unified(
            &path,
            &SearchQuery {
                text: Some(
                    "command* subject:commande \"bon de commande\" -publicité to:bob@ex.fr".into(),
                ),
                account_id: Some("a1".into()),
                mode: SearchMode::Lexical,
                ..Default::default()
            },
        )
        .expect("ops");
        assert_eq!(
            hits.len(),
            1,
            "{:?}",
            hits.iter().map(|h| &h.id.0).collect::<Vec<_>>()
        );
        assert_eq!(hits[0].id.0, "t1");
    }

    #[test]
    fn hyphenated_prefix_is_quoted_and_matches() {
        let expr = fts_match_expr("jean-pierre*", None, &[], &[], &[]).expect("expr");
        assert!(
            expr.contains("\"jean-pierre\"*"),
            "préfixe quoté, pas une colonne : {expr}"
        );
        assert!(!expr.contains(" jean-pierre*") && !expr.starts_with("jean-pierre*"));
        let mail = fts_match_expr("e-mail*", None, &[], &[], &[]).expect("mail");
        assert!(mail.contains("\"e-mail\"*"), "{mail}");
        let quoted = fts_match_expr("AND OR NEAR", None, &[], &[], &[]).expect("ops");
        assert!(quoted.contains("\"and\""));
        assert!(quoted.contains("\"or\""));
        assert!(quoted.contains("\"near\""));
        assert!(!quoted
            .split(" AND ")
            .any(|p| p == "and" || p == "or" || p == "near"));

        let dir = tempfile::tempdir().expect("tempdir");
        let path = dir.path().join("hyphen.db");
        let conn = open_sqlite_migrated(&path).expect("migrate");
        seed_account(&conn);
        insert_mail(
            &conn,
            "m1",
            "t1",
            "INBOX",
            "Note",
            "jean-pierre a écrit un e-mail",
        );
        drop(conn);
        let hits = sqlite_search_threads_unified(
            &path,
            &SearchQuery {
                text: Some("jean-pierre*".into()),
                account_id: Some("a1".into()),
                mode: SearchMode::Lexical,
                ..Default::default()
            },
        )
        .expect("hyphen search");
        assert_eq!(hits.len(), 1);
        assert_eq!(hits[0].id.0, "t1");
    }

    #[test]
    fn exclusion_only_query_returns_threads_without_the_term() {
        let dir = tempfile::tempdir().expect("tempdir");
        let path = dir.path().join("excl.db");
        let conn = open_sqlite_migrated(&path).expect("migrate");
        seed_account(&conn);
        insert_mail(&conn, "m1", "t1", "INBOX", "Facture", "montant 12");
        insert_mail(&conn, "m2", "t2", "INBOX", "Pub", "offre pub du mois");
        drop(conn);
        let hits = sqlite_search_threads_unified(
            &path,
            &SearchQuery {
                text: Some("-pub".into()),
                account_id: Some("a1".into()),
                mode: SearchMode::Lexical,
                ..Default::default()
            },
        )
        .expect("exclude");
        let ids: Vec<_> = hits.iter().map(|h| h.id.0.as_str()).collect();
        assert_eq!(ids, vec!["t1"]);
    }

    #[test]
    fn subject_phrase_matches_several_words() {
        let expr = fts_match_expr("", Some("bon de commande"), &[], &[], &[]).expect("expr");
        assert!(expr.contains("subject : \"bon de commande\""), "{expr}");
        let dir = tempfile::tempdir().expect("tempdir");
        let path = dir.path().join("subj.db");
        let conn = open_sqlite_migrated(&path).expect("migrate");
        seed_account(&conn);
        insert_mail(&conn, "m1", "t1", "INBOX", "Bon de commande 4", "détail");
        insert_mail(
            &conn,
            "m2",
            "t2",
            "INBOX",
            "Autre",
            "bon de commande ailleurs",
        );
        drop(conn);
        let hits = sqlite_search_threads_unified(
            &path,
            &SearchQuery {
                text: Some("subject:\"bon de commande\"".into()),
                account_id: Some("a1".into()),
                mode: SearchMode::Lexical,
                ..Default::default()
            },
        )
        .expect("subject phrase");
        assert_eq!(hits.len(), 1);
        assert_eq!(hits[0].id.0, "t1");
    }

    #[test]
    fn invalid_search_date_is_an_error() {
        let err = sqlite_search_threads_unified(
            std::path::Path::new("unused.db"),
            &SearchQuery {
                text: Some("before:pas-une-date".into()),
                account_id: Some("a1".into()),
                mode: SearchMode::Lexical,
                ..Default::default()
            },
        )
        .expect_err("date");
        assert!(err.contains("date invalide"), "{err}");
    }

    #[test]
    fn mark_read_does_not_rewrite_fts() {
        let dir = tempfile::tempdir().expect("tempdir");
        let path = dir.path().join("read.db");
        let conn = open_sqlite_migrated(&path).expect("migrate");
        seed_account(&conn);
        let trigger: String = conn
            .query_row(
                "SELECT sql FROM sqlite_master WHERE type = 'trigger' AND name = 'messages_au_fts'",
                [],
                |r| r.get(0),
            )
            .expect("trigger");
        let trigger_l = trigger.to_ascii_lowercase();
        assert!(
            trigger_l.contains("update of"),
            "le déclencheur doit lister les colonnes : {trigger}"
        );
        assert!(!trigger_l.contains("is_read"), "{trigger}");
        assert!(trigger_l.contains("rowid = old.rowid"), "{trigger}");
        for i in 0..240 {
            insert_mail(
                &conn,
                &format!("m{i}"),
                &format!("t{i}"),
                "INBOX",
                "sujet",
                "corps unique-zebre-lecture",
            );
        }
        let before: i64 = conn
            .query_row("SELECT total_changes()", [], |r| r.get(0))
            .expect("changes");
        let started = std::time::Instant::now();
        for i in 0..200 {
            conn.execute(
                "UPDATE messages SET is_read = 0 WHERE id = ?1",
                [format!("m{i}")],
            )
            .expect("mark");
        }
        let elapsed = started.elapsed();
        let after: i64 = conn
            .query_row("SELECT total_changes()", [], |r| r.get(0))
            .expect("changes");
        assert_eq!(
            after - before,
            200,
            "chaque is_read ne doit toucher que la ligne message, pas l'index FTS"
        );
        assert!(
            elapsed.as_millis() < 1500,
            "200 marquages lus trop lents : {elapsed:?}"
        );
        drop(conn);
        let hits = sqlite_search_threads_unified(
            &path,
            &SearchQuery {
                text: Some("unique-zebre-lecture".into()),
                account_id: Some("a1".into()),
                mode: SearchMode::Lexical,
                limit: Some(500),
                ..Default::default()
            },
        )
        .expect("still indexed");
        assert_eq!(hits.len(), 240);
    }
}
