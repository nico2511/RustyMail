use std::path::Path;

use rusqlite::params;

use rustymail_domain::Account;

use crate::account_imap_lock::acquire_account_imap_lock;
use crate::app_prefs::{load_app_prefs, prefs_path_from_db_dir};
use crate::archive_layout::{parse_archive_layout, resolve_archive_target};
use crate::imap::ops::{
    decode_imap_mailbox_name, expunge_after_delete_flags, filter_imap_command_names_on_server,
    format_uid_set, hierarchy_delimiter_for_mailbox_ops, imap_create_mailbox,
    imap_session_select_mailbox, imap_session_select_mailbox_with_list,
    list_selectable_mailbox_entries, list_selectable_mailboxes, resolve_mailbox_imap_command_names,
    resolve_mailbox_wire_name, resolve_wire_mailbox_for_logical_path, uid_move_with_fallback,
    uid_store, MailboxListEntry,
};
use crate::imap_tombstones::record_imap_uid_tombstones;
use crate::login_session_for_account;
use crate::mailbox_local_cache::register_mailbox_local_cache;
use crate::open_sqlite_migrated;
use crate::ImapSession;

/// Ordre de préférence pour la corbeille (noms IMAP fréquents).
const TRASH_CANDIDATES: &[&str] = &[
    "[Gmail]/Trash",
    "INBOX/Trash",
    "Trash",
    "Deleted Messages",
    "Deleted",
    "Bin",
    "Poubelle",
];

/// Ordre de préférence pour l’archivage (Gmail: All Mail, sinon Archive).
const ARCHIVE_CANDIDATES: &[&str] = &[
    "[Gmail]/All Mail",
    "Archive",
    "[Gmail]/Archive",
    "Tous les messages",
];

/// Heuristique : le nom de dossier ressemble-t-il à une corbeille ?
/// Mêmes signaux que `pick_trash_folder` (alias FR/EN + suffixes Gmail).
pub fn is_trash_like_mailbox(name: &str) -> bool {
    let n = name.trim();
    if n.is_empty() {
        return false;
    }
    if TRASH_CANDIDATES
        .iter()
        .any(|needle| n.eq_ignore_ascii_case(needle))
    {
        return true;
    }
    let l = n.to_ascii_lowercase();
    if l.contains("trash") || l.contains("poubelle") || l.contains("corbeille") {
        return true;
    }
    if l.contains("deleted") {
        return true;
    }
    l == "bin" || l.ends_with("/bin")
}

/// Heuristique : le nom de dossier ressemble-t-il à « Envoyés » ?
/// Aligné sur `crate::imap::ops::pick_sent_mailbox_entry` (Gmail, FR/EN/DE).
pub fn is_sent_like_mailbox(name: &str) -> bool {
    let n = name.trim();
    if n.is_empty() {
        return false;
    }
    let sent_aliases: &[&str] = &[
        "[Gmail]/Sent",
        "[Google Mail]/Sent",
        "INBOX/Sent",
        "Sent Messages",
        "Sent",
        "Envoyés",
        "Éléments envoyés",
        "Courrier envoyé",
        "Postausgang",
        "Gesendet",
    ];
    if sent_aliases
        .iter()
        .any(|needle| n.eq_ignore_ascii_case(needle))
    {
        return true;
    }
    let l = n.to_ascii_lowercase();
    if l == "sent" || l.ends_with("/sent") {
        return true;
    }
    l.contains("envoy") || l.contains("gesendet") || l.contains("postausgang")
}

/// Choisit un dossier corbeille présent dans `list`.
pub fn pick_trash_folder(list: &[String]) -> Option<String> {
    for needle in TRASH_CANDIDATES {
        for name in list {
            if name.eq_ignore_ascii_case(needle) {
                return Some(name.clone());
            }
        }
    }
    for name in list {
        let l = name.to_ascii_lowercase();
        if l.contains("trash") {
            return Some(name.clone());
        }
        if l.contains("bin") && !l.contains("inbox") {
            return Some(name.clone());
        }
    }
    None
}

/// Choisit un dossier d’archivage présent dans `list` (Gmail: All Mail, sinon un dossier nommé « Archive »).
pub fn pick_archive_folder(list: &[String]) -> Option<String> {
    use crate::imap::ops::{infer_hierarchy_delimiter_from_list, mailbox_logical_path_key};

    let mut hits: Vec<String> = Vec::new();
    let mut push_hit = |name: &String| {
        if !hits.iter().any(|h| h == name) {
            hits.push(name.clone());
        }
    };
    for needle in ARCHIVE_CANDIDATES {
        for name in list {
            if name.eq_ignore_ascii_case(needle) {
                push_hit(name);
            }
        }
    }
    for name in list {
        let l = name.to_ascii_lowercase();
        if name.eq_ignore_ascii_case("Archive")
            || l.ends_with("/archive")
            || l.ends_with(".archive")
        {
            push_hit(name);
        }
    }
    if hits.is_empty() {
        return None;
    }

    // Serveurs dot-only : préférer `INBOX.Archive` (Thunderbird) plutôt qu’un `Archive` racine parallèle.
    // `mailbox_logical_path_key` strippe le segment `inbox`, donc on teste le préfixe wire.
    if infer_hierarchy_delimiter_from_list(&hits) == '.' {
        let mut inbox_archive: Vec<String> = hits
            .iter()
            .filter(|n| {
                let lower = n.to_ascii_lowercase();
                let under_inbox = lower.starts_with("inbox.") || lower.starts_with("inbox/");
                under_inbox && mailbox_logical_path_key(n).iter().any(|s| s == "archive")
            })
            .cloned()
            .collect();
        if !inbox_archive.is_empty() {
            inbox_archive.sort_by_key(|n| mailbox_logical_path_key(n).len());
            return Some(inbox_archive.remove(0));
        }
    }

    hits.into_iter().next()
}

/// Ancre hiérarchique pour archivage : dossier Archive classique ou `archive_root` des prefs s’il existe sur le serveur.
fn pick_archive_anchor(list: &[String], archive_root: &str) -> Option<String> {
    if let Some(f) = pick_archive_folder(list) {
        return Some(f);
    }
    let root = archive_root.trim();
    if root.is_empty() {
        return None;
    }
    let wire = resolve_mailbox_wire_name(root, list);
    if list.iter().any(|n| n == &wire) {
        return Some(wire);
    }
    let want = crate::imap::ops::mailbox_logical_path_key(root);
    list.iter()
        .find(|n| crate::imap::ops::mailbox_logical_path_key(n) == want)
        .cloned()
}

/// Cible d’archivage résolue (prefs + LIST + date du fil).
#[derive(Debug, Clone)]
pub struct ArchiveDestination {
    pub logical_path: String,
    pub hierarchy_anchor: String,
    /// Nom LIST/SELECT du dossier d’archive (ex. `INBOX.Archive.2025.05-mai`).
    pub wire_mailbox: String,
}

/// Résultat d’un déplacement IMAP (message utilisateur + dossier cible réel sur le serveur).
#[derive(Debug, Clone)]
pub struct ArchiveMoveResult {
    pub message: String,
    pub dest_mailbox: String,
}

/// Alias sémantique pour trash / move-to-mailbox (même forme qu’archive).
pub type ThreadMailboxMoveResult = ArchiveMoveResult;

#[derive(Clone)]
struct ThreadImapRow {
    message_id: String,
    imap_uid: u32,
}

struct ThreadMoveSource {
    effective_mailbox: String,
    imap_rows: Vec<ThreadImapRow>,
    stub_ids: Vec<String>,
}

fn thread_root_message_id(
    path: &Path,
    account_id: &str,
    thread_id: &str,
) -> Result<Option<String>, String> {
    let conn = crate::open_sqlite_migrated(path).map_err(|e| e.to_string())?;
    conn.query_row(
        "SELECT thread_root_message_id FROM threads WHERE id = ?1 AND account_id = ?2",
        params![thread_id, account_id],
        |r| r.get::<_, Option<String>>(0),
    )
    .map_err(|e| e.to_string())
}

fn load_thread_imap_rows_for_root_in_mailbox(
    path: &Path,
    account_id: &str,
    thread_id: &str,
    mailbox: &str,
) -> Result<Vec<ThreadImapRow>, String> {
    let root = thread_root_message_id(path, account_id, thread_id)?;
    let Some(root) = root.filter(|r| !r.trim().is_empty()) else {
        return Ok(Vec::new());
    };
    let resolved_mailbox = crate::resolve_scoped_mailbox_from_path(path, account_id, mailbox)?;
    let conn = crate::open_sqlite_migrated(path).map_err(|e| e.to_string())?;
    let mut s = conn
        .prepare(
            "
        SELECT m.id, m.imap_uid
        FROM messages m
        INNER JOIN threads t ON t.id = m.thread_id AND t.account_id = m.account_id
        WHERE m.account_id = ?1
          AND lower(trim(m.mailbox)) = lower(trim(?2))
          AND COALESCE(t.thread_root_message_id, '') = ?3
          AND m.imap_uid IS NOT NULL
        ORDER BY m.received_at ASC, m.position ASC, m.id ASC
        ",
        )
        .map_err(|e| e.to_string())?;
    let rows = s
        .query_map(params![account_id, resolved_mailbox, root], |row| {
            let uid: i64 = row.get(1)?;
            Ok(ThreadImapRow {
                message_id: row.get(0)?,
                imap_uid: uid.max(0) as u32,
            })
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok());
    let mut v: Vec<ThreadImapRow> = rows.collect();
    v.retain(|r| r.imap_uid > 0);
    Ok(v)
}

fn load_thread_stub_ids_for_root_in_mailbox(
    path: &Path,
    account_id: &str,
    thread_id: &str,
    mailbox: &str,
) -> Result<Vec<String>, String> {
    let root = thread_root_message_id(path, account_id, thread_id)?;
    let Some(root) = root.filter(|r| !r.trim().is_empty()) else {
        return Ok(Vec::new());
    };
    let resolved_mailbox = crate::resolve_scoped_mailbox_from_path(path, account_id, mailbox)?;
    let conn = crate::open_sqlite_migrated(path).map_err(|e| e.to_string())?;
    let mut s = conn
        .prepare(
            "
        SELECT m.id
        FROM messages m
        INNER JOIN threads t ON t.id = m.thread_id AND t.account_id = m.account_id
        WHERE m.account_id = ?1
          AND lower(trim(m.mailbox)) = lower(trim(?2))
          AND COALESCE(t.thread_root_message_id, '') = ?3
          AND m.imap_uid IS NULL
        ORDER BY m.received_at ASC, m.position ASC, m.id ASC
        ",
        )
        .map_err(|e| e.to_string())?;
    let rows = s
        .query_map(params![account_id, resolved_mailbox, root], |row| {
            Ok(row.get::<_, String>(0)?)
        })
        .map_err(|e| e.to_string())?;
    Ok(rows.filter_map(|r| r.ok()).collect())
}

fn load_thread_imap_rows_by_thread_id(
    path: &Path,
    account_id: &str,
    thread_id: &str,
) -> Result<Vec<(String, Vec<ThreadImapRow>)>, String> {
    let conn = crate::open_sqlite_migrated(path).map_err(|e| e.to_string())?;
    let mut s = conn
        .prepare(
            "
        SELECT mailbox, id, imap_uid
        FROM messages
        WHERE thread_id = ?1 AND account_id = ?2 AND imap_uid IS NOT NULL
        ORDER BY mailbox, received_at ASC, position ASC, id ASC
        ",
        )
        .map_err(|e| e.to_string())?;
    let mut by_mailbox: std::collections::BTreeMap<String, Vec<ThreadImapRow>> =
        std::collections::BTreeMap::new();
    for row in s
        .query_map(params![thread_id, account_id], |row| {
            let uid: i64 = row.get(2)?;
            Ok((
                row.get::<_, String>(0)?,
                ThreadImapRow {
                    message_id: row.get(1)?,
                    imap_uid: uid.max(0) as u32,
                },
            ))
        })
        .map_err(|e| e.to_string())?
        .flatten()
    {
        if row.1.imap_uid == 0 {
            continue;
        }
        by_mailbox.entry(row.0).or_default().push(row.1);
    }
    Ok(by_mailbox.into_iter().collect())
}

fn mailbox_hint_matches(candidate: &str, hint: &str) -> bool {
    use crate::imap::ops::mailbox_logical_path_key;
    mailbox_logical_path_key(candidate) == mailbox_logical_path_key(hint)
}

fn resolve_thread_move_source(
    path: &Path,
    account_id: &str,
    thread_id: &str,
    mailbox_hint: &str,
) -> Result<ThreadMoveSource, String> {
    let hint_resolved = crate::resolve_scoped_mailbox_from_path(path, account_id, mailbox_hint)?;
    let mut imap_rows = load_thread_imap_rows(path, account_id, mailbox_hint, thread_id)?;
    let mut stub_ids =
        load_thread_local_stub_message_ids(path, account_id, mailbox_hint, thread_id)?;
    let mut effective = hint_resolved.clone();

    if imap_rows.is_empty() && stub_ids.is_empty() {
        imap_rows =
            load_thread_imap_rows_for_root_in_mailbox(path, account_id, thread_id, mailbox_hint)?;
        stub_ids =
            load_thread_stub_ids_for_root_in_mailbox(path, account_id, thread_id, mailbox_hint)?;
    }

    if imap_rows.is_empty() && stub_ids.is_empty() {
        let groups = load_thread_imap_rows_by_thread_id(path, account_id, thread_id)?;
        let pick = groups
            .iter()
            .find(|(mb, r)| !r.is_empty() && mailbox_hint_matches(mb, mailbox_hint))
            .or_else(|| groups.iter().find(|(_, r)| !r.is_empty()));
        if let Some((mb, rows)) = pick {
            imap_rows = rows.clone();
            effective = crate::resolve_scoped_mailbox_from_path(path, account_id, mb)?;
        }
    }

    Ok(ThreadMoveSource {
        effective_mailbox: effective,
        imap_rows,
        stub_ids,
    })
}

fn load_thread_imap_rows(
    path: &Path,
    account_id: &str,
    source_mailbox: &str,
    thread_id: &str,
) -> Result<Vec<ThreadImapRow>, String> {
    let resolved_mailbox =
        crate::resolve_scoped_mailbox_from_path(path, account_id, source_mailbox)?;
    let conn = crate::open_sqlite_migrated(path).map_err(|e| e.to_string())?;
    let mut s = conn
        .prepare(
            "
        SELECT id, imap_uid
        FROM messages
        WHERE thread_id = ?1
          AND account_id = ?2
          AND lower(trim(mailbox)) = lower(trim(?3))
          AND imap_uid IS NOT NULL
        ORDER BY received_at ASC, position ASC, id ASC
        ",
        )
        .map_err(|e| e.to_string())?;
    let rows = s
        .query_map(params![thread_id, account_id, resolved_mailbox], |row| {
            let uid: i64 = row.get(1)?;
            Ok(ThreadImapRow {
                message_id: row.get(0)?,
                imap_uid: uid.max(0) as u32,
            })
        })
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok());
    let mut v: Vec<ThreadImapRow> = rows.collect();
    v.retain(|r| r.imap_uid > 0);
    Ok(v)
}

/// Messages créés uniquement en local (`m-local-sent-*`, stubs avant sync IMAP) : pas d’UID, rien à déplacer côté serveur.
fn load_thread_local_stub_message_ids(
    path: &Path,
    account_id: &str,
    source_mailbox: &str,
    thread_id: &str,
) -> Result<Vec<String>, String> {
    let resolved_mailbox =
        crate::resolve_scoped_mailbox_from_path(path, account_id, source_mailbox)?;
    let conn = crate::open_sqlite_migrated(path).map_err(|e| e.to_string())?;
    let mut s = conn
        .prepare(
            "
        SELECT id
        FROM messages
        WHERE thread_id = ?1
          AND account_id = ?2
          AND lower(trim(mailbox)) = lower(trim(?3))
          AND imap_uid IS NULL
        ORDER BY received_at ASC, position ASC, id ASC
        ",
        )
        .map_err(|e| e.to_string())?;
    let rows = s
        .query_map(params![thread_id, account_id, resolved_mailbox], |row| {
            Ok(row.get::<_, String>(0)?)
        })
        .map_err(|e| e.to_string())?;
    Ok(rows.filter_map(|r| r.ok()).collect())
}

/// Met à jour le dossier SQLite pour un fil constitué uniquement de messages sans UID (sans appel IMAP).
fn relocate_local_stub_thread(
    path: &Path,
    account_id: &str,
    source_mailbox: &str,
    thread_id: &str,
    dest_mailbox: &str,
) -> Result<usize, String> {
    let dest = crate::resolve_scoped_mailbox_from_path(path, account_id, dest_mailbox.trim())?;
    if dest.trim().is_empty() {
        return Err("Dossier cible vide".to_string());
    }
    let src = resolve_thread_move_source(path, account_id, thread_id, source_mailbox)?;
    if src.stub_ids.is_empty() {
        return Ok(0);
    }
    let stub_ids = src.stub_ids;

    let mut conn = crate::open_sqlite_migrated(path).map_err(|e| e.to_string())?;
    let tx = conn.transaction().map_err(|e| e.to_string())?;
    let mut n_msgs = 0usize;
    for id in &stub_ids {
        n_msgs += tx
            .execute(
                "UPDATE messages SET mailbox = ?1 WHERE id = ?2 AND account_id = ?3 AND imap_uid IS NULL",
                params![dest.as_str(), id, account_id.trim()],
            )
            .map_err(|e| e.to_string())?;
    }
    tx.execute(
        "UPDATE threads SET mailbox = ?1 WHERE id = ?2 AND account_id = ?3",
        params![dest.as_str(), thread_id.trim(), account_id.trim()],
    )
    .map_err(|e| e.to_string())?;
    tx.commit().map_err(|e| e.to_string())?;
    Ok(n_msgs)
}

/// Efface tout le fil s’il n’existe qu’en local pour ce dossier (aucune ligne avec UID dans ce dossier).
fn trash_local_stub_thread_only(
    path: &Path,
    account_id: &str,
    source_mailbox: &str,
    thread_id: &str,
) -> Result<usize, String> {
    let stubs = load_thread_local_stub_message_ids(path, account_id, source_mailbox, thread_id)?;
    if stubs.is_empty() {
        return Ok(0);
    }
    delete_local_after_move(path, &stubs)?;
    Ok(stubs.len())
}

/// Retire le fil du cache SQLite (tous dossiers) quand il n’y a plus d’UID IMAP exploitables.
fn trash_thread_local_cache_only(
    path: &Path,
    account_id: &str,
    thread_id: &str,
) -> Result<usize, String> {
    let conn = crate::open_sqlite_migrated(path).map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare("SELECT id FROM messages WHERE thread_id = ?1 AND account_id = ?2")
        .map_err(|e| e.to_string())?;
    let ids: Vec<String> = stmt
        .query_map(params![thread_id, account_id], |r| r.get(0))
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();
    if ids.is_empty() {
        conn.execute(
            "DELETE FROM threads WHERE id = ?1 AND account_id = ?2",
            params![thread_id, account_id],
        )
        .map_err(|e| e.to_string())?;
        return Ok(0);
    }
    delete_local_after_move(path, &ids)?;
    Ok(ids.len())
}

/// Supprime en local les messages déplacés, puis les fils vides.
fn delete_local_after_move(path: &Path, message_ids: &[String]) -> Result<(), String> {
    if message_ids.is_empty() {
        return Ok(());
    }
    let mut conn = crate::open_sqlite_migrated(path).map_err(|e| e.to_string())?;
    let tx = conn.transaction().map_err(|e| e.to_string())?;
    let mut thread_ids: std::collections::HashSet<String> = std::collections::HashSet::new();
    for id in message_ids {
        let tid: Option<String> = tx
            .query_row(
                "SELECT thread_id FROM messages WHERE id = ?1",
                params![id],
                |row| row.get(0),
            )
            .ok();
        tx.execute("DELETE FROM messages WHERE id = ?1", params![id])
            .map_err(|e| e.to_string())?;
        if let Some(t) = tid {
            thread_ids.insert(t);
        }
    }
    for tid in thread_ids {
        let c: i64 = tx
            .query_row(
                "SELECT COUNT(*) FROM messages WHERE thread_id = ?1",
                params![tid],
                |row| row.get(0),
            )
            .map_err(|e| e.to_string())?;
        if c == 0 {
            tx.execute("DELETE FROM threads WHERE id = ?1", params![tid])
                .map_err(|e| e.to_string())?;
        }
    }
    tx.commit().map_err(|e| e.to_string())?;
    Ok(())
}

/// MOVE IMAP sur une session déjà authentifiée (évite un 2ᵉ LOGIN + LIST).
async fn imap_move_thread_on_session(
    path: &Path,
    account_id: &str,
    thread_id: &str,
    session: &mut ImapSession,
    entries: &[MailboxListEntry],
    src: &ThreadMoveSource,
    dest_mailbox: &str,
) -> Result<(usize, String), String> {
    let uids: Vec<async_imap::types::Uid> = src.imap_rows.iter().map(|r| r.imap_uid).collect();
    let uid_nums: Vec<u32> = src.imap_rows.iter().map(|r| r.imap_uid).collect();
    let list: Vec<String> = entries.iter().map(|e| e.decoded_name.clone()).collect();
    let src_wire = resolve_mailbox_wire_name(&src.effective_mailbox, &list);
    let dest_targets = resolve_mailbox_imap_command_names(dest_mailbox, entries);
    imap_session_select_mailbox_with_list(session, &src_wire, Some(&list)).await?;
    let set = format_uid_set(&uids);
    let accepted = uid_move_with_fallback(session, &set, &dest_targets).await?;
    let dest_for_sync = decode_imap_mailbox_name(&accepted);
    // Tombstones AVANT le DELETE local : une sync concurrente ne doit pas réécrire ces UIDs.
    let _ = record_imap_uid_tombstones(
        path,
        account_id,
        &src.effective_mailbox,
        &uid_nums,
        Some(thread_id),
    );
    let ids: Vec<String> = src.imap_rows.iter().map(|r| r.message_id.clone()).collect();
    let moved = ids.len();
    delete_local_after_move(path, &ids)?;
    Ok((moved, dest_for_sync))
}

/// Vide la corbeille : marque `\\Deleted` + `EXPUNGE` côté IMAP pour les messages avec UID,
/// supprime en local tous les messages de ce dossier (y compris les stubs sans UID).
pub async fn empty_trash_mailbox(
    path: &Path,
    account: &Account,
    mailbox: &str,
) -> Result<String, String> {
    if !is_trash_like_mailbox(mailbox) {
        return Err(
            "Seuls les dossiers « corbeille » (Trash, Corbeille, etc.) peuvent être vidés ainsi."
                .to_string(),
        );
    }
    let _lock = acquire_account_imap_lock(&account.id.0).await;
    let resolved = crate::resolve_scoped_mailbox_from_path(path, &account.id.0, mailbox.trim())?;
    if resolved.trim().is_empty() {
        return Err("Dossier vide".to_string());
    }

    let (all_ids, imap_uids) = {
        let conn = crate::open_sqlite_migrated(path).map_err(|e| e.to_string())?;
        let mut stmt = conn
            .prepare(
                "
        SELECT id, imap_uid
        FROM messages
        WHERE account_id = ?1
          AND lower(trim(mailbox)) = lower(trim(?2))
        ",
            )
            .map_err(|e| e.to_string())?;
        let rows: Vec<(String, Option<i64>)> = stmt
            .query_map(params![account.id.0.trim(), resolved.as_str()], |row| {
                Ok((row.get(0)?, row.get(1)?))
            })
            .map_err(|e| e.to_string())?
            .filter_map(|r| r.ok())
            .collect();

        if rows.is_empty() {
            return Ok("La corbeille est déjà vide.".to_string());
        }

        let mut all_ids: Vec<String> = Vec::with_capacity(rows.len());
        let mut imap_uids: Vec<u32> = Vec::new();
        for (id, uid_opt) in rows {
            all_ids.push(id);
            if let Some(u) = uid_opt {
                if u > 0 {
                    imap_uids.push(u as u32);
                }
            }
        }
        imap_uids.sort_unstable();
        imap_uids.dedup();
        (all_ids, imap_uids)
    };

    if !imap_uids.is_empty() {
        let _ =
            record_imap_uid_tombstones(path, &account.id.0, resolved.as_str(), &imap_uids, None);
        let uids: Vec<async_imap::types::Uid> =
            imap_uids.iter().copied().map(|u| u.into()).collect();
        let mut session = login_session_for_account(account).await?;
        imap_session_select_mailbox(&mut session, resolved.as_str()).await?;
        const CHUNK: usize = 500;
        for chunk in uids.chunks(CHUNK) {
            let set = format_uid_set(chunk);
            uid_store(&mut session, &set, "+FLAGS (\\Deleted)").await?;
        }
        expunge_after_delete_flags(&mut session).await?;
        let _ = session.logout().await;
    }

    delete_local_after_move(path, &all_ids)?;
    let n = all_ids.len();
    Ok(format!(
        "{n} message(s) définitivement supprimé(s) de la corbeille."
    ))
}

/// Résout la corbeille, déplace. Erreur si aucun dossier corbeille et pas de repli sûr.
pub async fn move_thread_to_trash(
    path: &Path,
    account: &Account,
    source_mailbox: &str,
    thread_id: &str,
) -> Result<ThreadMailboxMoveResult, String> {
    let _lock = acquire_account_imap_lock(&account.id.0).await;
    let src = resolve_thread_move_source(path, &account.id.0, thread_id, source_mailbox)?;

    if src.imap_rows.is_empty() {
        let n_stub = trash_local_stub_thread_only(path, &account.id.0, source_mailbox, thread_id)?;
        if n_stub > 0 {
            return Ok(ThreadMailboxMoveResult {
                message: format!(
                    "{n_stub} message(s) retiré(s) du cache local (sans UID IMAP dans ce dossier)."
                ),
                dest_mailbox: source_mailbox.trim().to_string(),
            });
        }
        let n_all = trash_thread_local_cache_only(path, &account.id.0, thread_id)?;
        if n_all > 0 {
            return Ok(ThreadMailboxMoveResult {
                message: format!(
                    "{n_all} message(s) retiré(s) du cache local (fil déjà déplacé côté serveur)."
                ),
                dest_mailbox: source_mailbox.trim().to_string(),
            });
        }
        return Err(
            "Aucun message pour ce fil. Synchronisez la boîte ou ouvrez le dossier où se trouve le mail."
                .to_string(),
        );
    }

    let mut session = login_session_for_account(account).await?;
    let entries = list_selectable_mailbox_entries(&mut session).await?;
    let list: Vec<String> = entries.iter().map(|e| e.decoded_name.clone()).collect();
    let target = pick_trash_folder(&list).ok_or_else(|| {
        "Aucun dossier corbeille trouvé (Trash, [Gmail]/Trash, etc.). Vérifiez LIST côté serveur."
            .to_string()
    })?;
    let (n, dest) = imap_move_thread_on_session(
        path,
        &account.id.0,
        thread_id,
        &mut session,
        &entries,
        &src,
        &target,
    )
    .await?;
    let _ = session.logout().await;
    if !src.stub_ids.is_empty() {
        relocate_local_stub_thread(path, &account.id.0, source_mailbox, thread_id, &dest)?;
    }
    Ok(ThreadMailboxMoveResult {
        message: format!("{n} message(s) déplacé(s) vers {dest}."),
        dest_mailbox: dest,
    })
}

/// Calcule la cible d’archivage (chemin logique + nom boîte serveur).
pub async fn resolve_archive_destination(
    path: &Path,
    account: &Account,
    thread_id: &str,
) -> Result<ArchiveDestination, String> {
    let list = list_selectable_mailboxes(account).await?;
    let prefs_path = prefs_path_from_db_dir(path.parent().unwrap_or(path));
    let prefs = load_app_prefs(&prefs_path);
    let anchor = pick_archive_anchor(&list, &prefs.general.archive_root).ok_or_else(|| {
        "Aucun dossier d’archivage trouvé (Archive, [Gmail]/All Mail, ou racine d’archivage des paramètres présente sur le serveur)."
            .to_string()
    })?;
    let layout = parse_archive_layout(&prefs.general.archive_layout);
    let received_at = latest_thread_received_at(path, thread_id)?;
    let logical_path = resolve_archive_target(
        layout,
        &prefs.general.archive_root,
        &prefs.general.mother_language,
        &received_at,
        &anchor,
    );
    let wire = resolve_wire_mailbox_for_logical_path(&logical_path, &anchor, &list);
    let wire_mailbox = resolve_mailbox_wire_name(&wire, &list);
    Ok(ArchiveDestination {
        logical_path,
        hierarchy_anchor: anchor,
        wire_mailbox,
    })
}

/// Résout l’archive, déplace.
pub async fn move_thread_to_archive(
    path: &Path,
    account: &Account,
    source_mailbox: &str,
    thread_id: &str,
) -> Result<ArchiveMoveResult, String> {
    let _lock = acquire_account_imap_lock(&account.id.0).await;
    let src = resolve_thread_move_source(path, &account.id.0, thread_id, source_mailbox)?;

    if src.imap_rows.is_empty() && src.stub_ids.is_empty() {
        return Err(
            "Aucun message dans ce dossier pour ce fil. Synchronisez la boîte ou ouvrez le bon dossier."
                .to_string(),
        );
    }

    let mut dest = resolve_archive_destination(path, account, thread_id).await?;
    let mut target = dest.wire_mailbox.clone();

    if src.imap_rows.is_empty() {
        let n =
            relocate_local_stub_thread(path, &account.id.0, source_mailbox, thread_id, &target)?;
        return Ok(ArchiveMoveResult {
            message: format!("{n} message(s) classé(s) localement sous « {target} »."),
            dest_mailbox: target,
        });
    }

    let mut session = login_session_for_account(account).await?;
    let (entries, dest_targets) = prepare_move_destination_mailboxes(
        &mut session,
        &dest.wire_mailbox,
        &dest.hierarchy_anchor,
    )
    .await?;
    for wire in &dest_targets {
        let _ = register_mailbox_local_cache(path, &account.id.0, wire);
    }
    target = dest_targets
        .first()
        .cloned()
        .map(|w| decode_imap_mailbox_name(&w))
        .unwrap_or_else(|| dest.wire_mailbox.clone());
    dest.wire_mailbox = target.clone();
    let (n, dest_actual) = imap_move_thread_on_session(
        path,
        &account.id.0,
        thread_id,
        &mut session,
        &entries,
        &src,
        &target,
    )
    .await?;
    let _ = session.logout().await;
    if !src.stub_ids.is_empty() {
        relocate_local_stub_thread(path, &account.id.0, source_mailbox, thread_id, &dest_actual)?;
    }
    let loc = dest.logical_path.trim();
    let message = if !loc.is_empty()
        && !loc.eq_ignore_ascii_case(dest_actual.trim())
        && crate::imap::ops::mailbox_logical_path_key(loc)
            != crate::imap::ops::mailbox_logical_path_key(&dest_actual)
    {
        format!("{n} message(s) archivé(s) dans « {dest_actual} » (chemin {loc}).")
    } else {
        format!("{n} message(s) archivé(s) dans « {dest_actual} ».")
    };
    Ok(ArchiveMoveResult {
        message,
        dest_mailbox: dest_actual,
    })
}

fn latest_thread_received_at(path: &Path, thread_id: &str) -> Result<String, String> {
    let conn = open_sqlite_migrated(path).map_err(|e| e.to_string())?;
    conn.query_row(
        "SELECT COALESCE(MAX(received_at), datetime('now')) FROM messages WHERE thread_id = ?1",
        [thread_id],
        |r| r.get(0),
    )
    .map_err(|e| e.to_string())
}

fn pick_move_hierarchy_anchor(list: &[String]) -> String {
    use crate::imap::ops::mailbox_logical_path_key;
    if let Some(inbox) = list.iter().find(|n| {
        let k = mailbox_logical_path_key(n);
        k.len() == 1 && k[0] == "inbox"
    }) {
        return inbox.clone();
    }
    list.first().cloned().unwrap_or_else(|| "INBOX".to_string())
}

/// Crée la hiérarchie IMAP manquante sur la session courante (sans second LOGIN).
async fn ensure_mailbox_path_on_session(
    session: &mut ImapSession,
    logical_path: &str,
    hierarchy_anchor: &str,
    existing: &[String],
) -> Result<(), String> {
    let wire = resolve_mailbox_wire_name(
        &resolve_wire_mailbox_for_logical_path(logical_path, hierarchy_anchor, existing),
        existing,
    );
    if existing.iter().any(|m| m == &wire) {
        return Ok(());
    }
    if existing.iter().any(|m| {
        crate::imap::ops::mailbox_logical_path_key(m)
            == crate::imap::ops::mailbox_logical_path_key(&wire)
    }) {
        return Ok(());
    }
    let delim = hierarchy_delimiter_for_mailbox_ops(hierarchy_anchor, existing);
    let delim_s = delim.to_string();
    let parts: Vec<String> = wire.split(delim).map(|s| s.to_string()).collect();
    let anchor_parts = hierarchy_anchor.split(delim).count();
    if parts.len() <= anchor_parts {
        if !existing.iter().any(|m| m == &wire) {
            imap_create_mailbox(session, &wire).await?;
        }
        return Ok(());
    }
    for i in anchor_parts..parts.len() {
        let built = parts[0..=i].join(&delim_s);
        if !existing.iter().any(|m| m == &built) {
            imap_create_mailbox(session, &built).await?;
        }
    }
    Ok(())
}

/// Vérifie que la destination existe (CREATE si besoin), relit LIST, retourne noms IMAP MOVE.
async fn prepare_move_destination_mailboxes(
    session: &mut ImapSession,
    dest_path: &str,
    hierarchy_anchor: &str,
) -> Result<(Vec<MailboxListEntry>, Vec<String>), String> {
    let dest_path = dest_path.trim();
    if dest_path.is_empty() {
        return Err("Mailbox cible vide".to_string());
    }
    let anchor = hierarchy_anchor.trim();
    let mut entries = list_selectable_mailbox_entries(session).await?;
    let mut targets = filter_imap_command_names_on_server(
        resolve_mailbox_imap_command_names(dest_path, &entries),
        &entries,
    );
    if !targets.is_empty() {
        return Ok((entries, targets));
    }
    let list: Vec<String> = entries.iter().map(|e| e.decoded_name.clone()).collect();
    let anchor = if anchor.is_empty() {
        pick_move_hierarchy_anchor(&list)
    } else {
        anchor.to_string()
    };
    ensure_mailbox_path_on_session(session, dest_path, &anchor, &list).await?;
    entries = list_selectable_mailbox_entries(session).await?;
    targets = filter_imap_command_names_on_server(
        resolve_mailbox_imap_command_names(dest_path, &entries),
        &entries,
    );
    if targets.is_empty() {
        return Err(format!(
            "Le dossier « {dest_path} » est introuvable sur le serveur après création — resynchronisez la liste des dossiers puis réessayez."
        ));
    }
    Ok((entries, targets))
}

pub async fn move_thread_to_mailbox(
    path: &Path,
    account: &Account,
    source_mailbox: &str,
    thread_id: &str,
    dest_mailbox: &str,
) -> Result<ThreadMailboxMoveResult, String> {
    let dest = dest_mailbox.trim();
    if dest.is_empty() {
        return Err("Mailbox cible vide".to_string());
    }
    if dest.eq_ignore_ascii_case(source_mailbox.trim()) {
        return Ok(ThreadMailboxMoveResult {
            message: "Déjà dans ce dossier".to_string(),
            dest_mailbox: dest.to_string(),
        });
    }
    if is_trash_like_mailbox(dest) {
        return Err(
            "Destination interdite : utilisez le bouton « Corbeille » pour déplacer un fil ici."
                .to_string(),
        );
    }
    if is_sent_like_mailbox(dest) {
        return Err(
            "Destination interdite : le dossier des messages envoyés est réservé à l’envoi."
                .to_string(),
        );
    }
    let _lock = acquire_account_imap_lock(&account.id.0).await;
    let src = resolve_thread_move_source(path, &account.id.0, thread_id, source_mailbox)?;
    if src.imap_rows.is_empty() && src.stub_ids.is_empty() {
        return Err(
            "Aucun message dans ce dossier pour ce fil. Synchronisez la boîte ou ouvrez le bon dossier."
                .to_string(),
        );
    }
    if src.imap_rows.is_empty() {
        let n = relocate_local_stub_thread(path, &account.id.0, source_mailbox, thread_id, dest)?;
        return Ok(ThreadMailboxMoveResult {
            message: format!("{n} message(s) déplacé(s) localement → {dest}."),
            dest_mailbox: dest.to_string(),
        });
    }

    let mut session = login_session_for_account(account).await?;
    let (entries, dest_targets) =
        prepare_move_destination_mailboxes(&mut session, dest, "").await?;
    for wire in &dest_targets {
        let _ = register_mailbox_local_cache(path, &account.id.0, wire);
    }
    let (n, dest_actual) = imap_move_thread_on_session(
        path,
        &account.id.0,
        thread_id,
        &mut session,
        &entries,
        &src,
        dest,
    )
    .await?;
    let _ = session.logout().await;

    if !src.stub_ids.is_empty() {
        relocate_local_stub_thread(path, &account.id.0, source_mailbox, thread_id, &dest_actual)?;
    }

    Ok(ThreadMailboxMoveResult {
        message: format!("{n} message(s) déplacé(s) → {dest_actual}."),
        dest_mailbox: dest_actual,
    })
}

fn update_local_is_read(path: &Path, message_ids: &[String], is_read: bool) -> Result<(), String> {
    if message_ids.is_empty() {
        return Ok(());
    }
    let mut conn = crate::open_sqlite_migrated(path).map_err(|e| e.to_string())?;
    let tx = conn.transaction().map_err(|e| e.to_string())?;
    for id in message_ids {
        tx.execute(
            "UPDATE messages SET is_read = ?2 WHERE id = ?1",
            params![id, i64::from(is_read)],
        )
        .map_err(|e| e.to_string())?;
    }
    tx.commit().map_err(|e| e.to_string())?;
    Ok(())
}

pub async fn set_thread_seen(
    path: &Path,
    account: &Account,
    source_mailbox: &str,
    thread_id: &str,
    seen: bool,
) -> Result<String, String> {
    let rows = load_thread_imap_rows(path, &account.id.0, source_mailbox, thread_id)?;
    let stubs = load_thread_local_stub_message_ids(path, &account.id.0, source_mailbox, thread_id)?;

    if rows.is_empty() && stubs.is_empty() {
        return Err(
            "Aucun message dans ce dossier pour ce fil. Synchronisez la boîte ou ouvrez le bon dossier."
                .to_string(),
        );
    }

    if !rows.is_empty() {
        let uids: Vec<async_imap::types::Uid> = rows.iter().map(|r| r.imap_uid).collect();
        let uid_set = format_uid_set(&uids);

        let mut session = login_session_for_account(account).await?;
        imap_session_select_mailbox(&mut session, source_mailbox).await?;

        // RFC 3501 UID STORE: mark read/unread.
        // Use .SILENT to avoid large responses on some servers.
        let query = if seen {
            "+FLAGS.SILENT (\\Seen)"
        } else {
            "-FLAGS.SILENT (\\Seen)"
        };
        uid_store(&mut session, &uid_set, query).await?;
        let _ = session.logout().await;

        let ids: Vec<String> = rows.iter().map(|r| r.message_id.clone()).collect();
        update_local_is_read(path, &ids, seen)?;
    }

    if !stubs.is_empty() {
        update_local_is_read(path, &stubs, seen)?;
    }

    let n = rows.len() + stubs.len();
    if seen {
        Ok(format!("Marqué comme lu ({})", n))
    } else {
        Ok(format!("Marqué comme non lu ({})", n))
    }
}

#[cfg(test)]
mod archive_pick_tests {
    use super::pick_archive_folder;

    #[test]
    fn prefers_inbox_archive_on_dot_server() {
        let list = vec!["Archive".to_string(), "INBOX.Archive".to_string()];
        assert_eq!(pick_archive_folder(&list).as_deref(), Some("INBOX.Archive"));
    }
}
