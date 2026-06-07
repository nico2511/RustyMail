use std::collections::HashMap;

use futures::TryStreamExt;
use unicode_normalization::UnicodeNormalization;
use utf7_imap::{decode_utf7_imap, encode_utf7_imap};

use async_imap::types::{Mailbox, NameAttribute, Uid};
use rustymail_domain::Account;

use super::session::{login_session_for_account, map_imap_error, ImapSession};

/// Decode IMAP Modified UTF-7 mailbox names (RFC 3501 §5.1.3) to Unicode for UI, SQLite, and `SELECT` on modern servers.
pub fn decode_imap_mailbox_name(raw: &str) -> String {
    // IMPORTANT: preserve leading/trailing spaces as they can be part of the mailbox name on some servers.
    // (Thunderbird may show paths like `/ DOSSIERS PERSO/Boxproof` where the leading space matters.)
    decode_utf7_imap(raw.to_string())
}

/// Ordered `SELECT` attempts: exact wire from LIST (when different from decoded), decoded Unicode,
/// Modified UTF-7 of decoded, then sidebar / requested spellings.
pub fn mailbox_select_variant_strings(
    raw_from_list: &str,
    display_decoded: &str,
    sidebar_request: Option<&str>,
) -> Vec<String> {
    let mut out: Vec<String> = Vec::new();
    let push = |v: &mut Vec<String>, s: &str| {
        // Keep the string exactly; only treat as empty if it's whitespace-only.
        if s.trim().is_empty() {
            return;
        }
        let t = s.to_string();
        if !v.iter().any(|existing| existing == &t) {
            v.push(t);
        }
    };
    push(&mut out, raw_from_list);
    push(&mut out, display_decoded);
    push(
        &mut out,
        &encode_utf7_imap(display_decoded.to_string()),
    );
    if let Some(sr) = sidebar_request {
        push(&mut out, sr);
        let dsr = decode_imap_mailbox_name(sr);
        push(&mut out, &dsr);
        push(&mut out, &encode_utf7_imap(dsr));
    }
    out
}

/// Variants when we only have a single client-side path (no LIST row), e.g. `sync_inbox` or move.
pub fn mailbox_select_variants_no_list(mailbox: &str) -> Vec<String> {
    let dec = decode_imap_mailbox_name(mailbox);
    mailbox_select_variant_strings(mailbox, &dec, Some(mailbox))
}

/// Déduit le délimiteur hiérarchique dominant côté serveur (LIST), hors dossiers `[Gmail]/…`.
pub fn infer_hierarchy_delimiter_from_list(list: &[String]) -> char {
    let mut slash_count = 0usize;
    let mut dot_count = 0usize;
    for n in list {
        let n = n.trim();
        if n.is_empty() || n.starts_with('[') {
            continue;
        }
        if n.contains('/') {
            slash_count += 1;
        }
        if n.contains('.') {
            dot_count += 1;
        }
    }
    if slash_count > dot_count {
        '/'
    } else {
        '.'
    }
}

/// Adds common fully-qualified prefixes when LIST shows a relative personal path (RFC 2342-ish behavior).
///
/// Thunderbird may show `DOSSIERS PERSO/Boxproof` while LIST returns `INBOX.DOSSIERS PERSO.Boxproof`.
/// On dot-only servers (erreur « must not have '/' »), on n’émet **aucune** variante avec `/`.
fn push_inbox_qualified_variants(out: &mut Vec<String>, body: &str, delim: char) {
    let push_unique = |v: &mut Vec<String>, s: String| {
        if s.trim().is_empty() {
            return;
        }
        if v.iter().any(|existing| existing == &s) {
            return;
        }
        v.push(s);
    };
    let body = body.trim_start();
    if body.is_empty() {
        return;
    }
    let dot_body = body.replace('/', ".");
    let slash_body = body.replace('.', "/");
    match delim {
        '/' => {
            push_unique(out, format!("INBOX/{slash_body}"));
            if dot_body != slash_body {
                push_unique(out, format!("INBOX/{dot_body}"));
            }
        }
        _ => {
            push_unique(out, format!("INBOX.{dot_body}"));
        }
    }
}

pub fn augmented_mailbox_select_variants(seed: &[String], list: Option<&[String]>) -> Vec<String> {
    let delim = list
        .map(infer_hierarchy_delimiter_from_list)
        .unwrap_or('.');
    let mut out: Vec<String> = Vec::new();
    let push_unique = |v: &mut Vec<String>, s: String| {
        if s.trim().is_empty() {
            return;
        }
        let t = s;
        if v.iter().any(|existing| existing == &t) {
            return;
        }
        v.push(t);
    };
    for s in seed {
        push_unique(&mut out, s.to_string());
    }
    let baseline: Vec<String> = out.clone();
    for t in baseline {
        let u = t.trim().to_ascii_uppercase();
        // Virtual / Gmail-style paths already absolute
        if u.starts_with("INBOX") || u.starts_with('[') {
            continue;
        }
        push_inbox_qualified_variants(&mut out, &t, delim);
    }
    if delim == '.' {
        out.retain(|s| {
            let t = s.trim();
            // Gmail (et similaires) : `[Gmail]/Corbeille` — ne pas appliquer la règle dot-only.
            t.starts_with('[') || !s.contains('/')
        });
    }
    out
}

/// Nom boîte aligné sur LIST (chemin logique / NFC), pour SELECT / UID MOVE / CREATE.
pub fn resolve_mailbox_wire_name(requested: &str, list: &[String]) -> String {
    let req = requested.trim();
    if req.is_empty() {
        return requested.to_string();
    }
    if list.iter().any(|n| n == req) {
        return req.to_string();
    }
    let want_log = mailbox_logical_path_key(req);
    if let Some(hit) = list.iter().find(|n| mailbox_logical_path_key(n) == want_log) {
        return hit.clone();
    }
    let want_nfc = mailbox_name_match_key(req);
    if let Some(hit) = list.iter().find(|n| mailbox_name_match_key(n) == want_nfc) {
        return hit.clone();
    }
    requested.to_string()
}

/// Try `SELECT` with each variant until one succeeds. Returns `(mailbox, winning_wire_string)`.
pub async fn imap_session_select_variants(
    session: &mut ImapSession,
    variants: &[String],
    list: Option<&[String]>,
) -> Result<(Mailbox, String), String> {
    let expanded = augmented_mailbox_select_variants(variants, list);
    if expanded.is_empty() {
        return Err("IMAP: aucune variante de boîte".to_string());
    }
    fn shorten(s: &str) -> String {
        let t = s.trim();
        let max = 72usize;
        if t.chars().count() <= max {
            return t.to_string();
        }
        let mut idx = max;
        while !t.is_char_boundary(idx) {
            idx -= 1;
        }
        format!("{}…", &t[..idx])
    }
    let mut last = String::new();
    for s in &expanded {
        if s.trim().is_empty() {
            continue;
        }
        match session.select(s).await {
            Ok(m) => return Ok((m, s.to_string())),
            Err(e) => last = map_imap_error(e),
        }
    }
    let tried = expanded
        .iter()
        .map(|v| shorten(v))
        .collect::<Vec<_>>()
        .join(" · ");
    Err(format!("{last} (essayé: {tried})"))
}

/// `SELECT` using several spellings (UTF-7 wire, decoded, encoded, etc.).
pub async fn imap_session_select_mailbox(
    session: &mut ImapSession,
    mailbox: &str,
) -> Result<Mailbox, String> {
    imap_session_select_mailbox_with_list(session, mailbox, None).await
}

/// `SELECT` en s’alignant d’abord sur LIST (évite variantes `/` sur serveurs dot-only).
pub async fn imap_session_select_mailbox_with_list(
    session: &mut ImapSession,
    mailbox: &str,
    list: Option<&[String]>,
) -> Result<Mailbox, String> {
    let requested = list
        .map(|names| resolve_mailbox_wire_name(mailbox, names))
        .unwrap_or_else(|| mailbox.to_string());
    let mut v = mailbox_select_variants_no_list(&requested);
    if !v.iter().any(|x| x == &requested) {
        v.insert(0, requested.clone());
    }
    imap_session_select_variants(session, &v, list)
        .await
        .map(|(m, _)| m)
}

/// Canonical comparison key so LIST/UI/SELECT mailbox names align despite Unicode quirks
/// (different apostrophe code points, normalization, stray spaces).
pub fn mailbox_name_match_key(name: &str) -> String {
    // Preserve leading spaces: they can be meaningful in mailbox names on some servers.
    name.nfc().collect::<String>()
}

/// Segments du chemin « logique » d’un dossier : même dossier si Thunderbird affiche
/// `DOSSIERS PERSO/Succession` alors que le serveur LIST/SELECT utilise `INBOX.DOSSIERS PERSO.Succession`.
/// - coupe sur `/` et `.` (délimiteurs usuels IMAP)
/// - **`trim()` par segment** : absorbe un espace parasite après un `/` (ex. Thunderbird `…/ DOSSIERS…`)
/// - ignore une étiquette `INBOX` en tête de chemin
/// - compare en minuscules ASCII (casse + espaces de segment sans ambiguïté majeure)
pub fn mailbox_logical_path_key(name: &str) -> Vec<String> {
    let normalized: String = name.nfc().collect();
    let mut out: Vec<String> = Vec::new();
    for part in normalized.split(|c| c == '/' || c == '.') {
        let t = part.trim();
        if t.is_empty() {
            continue;
        }
        out.push(t.to_ascii_lowercase());
    }
    if let Some(first) = out.first() {
        if first == "inbox" {
            out.remove(0);
        }
    }
    out
}

/// Délimiteur pour CREATE / chemins dérivés : LIST prime si le serveur est clairement dot-only.
pub fn hierarchy_delimiter_for_mailbox_ops(anchor: &str, list: &[String]) -> char {
    if infer_hierarchy_delimiter_from_list(list) == '.' {
        return '.';
    }
    hierarchy_delimiter_from_wire_anchor(anchor)
}

/// Délimiteur hiérarchique pour CREATE / chemins dérivés : aligné sur l’ancre LIST (point ou slash).
pub fn hierarchy_delimiter_from_wire_anchor(anchor: &str) -> char {
    let has_dot = anchor.contains('.');
    let has_slash = anchor.contains('/');
    if has_slash && !has_dot {
        return '/';
    }
    if has_dot && !has_slash {
        return '.';
    }
    if has_slash && has_dot {
        let slashes = anchor.matches('/').count();
        let dots = anchor.matches('.').count();
        if slashes >= dots {
            '/'
        } else {
            '.'
        }
    } else {
        '.'
    }
}

/// Convertit un chemin logique (`Archive/2024/05-mai`) en nom LIST/SELECT du serveur (`INBOX.Archive.2024.05-mai`).
pub fn resolve_wire_mailbox_for_logical_path(
    logical_path: &str,
    hierarchy_anchor: &str,
    existing: &[String],
) -> String {
    let want = mailbox_logical_path_key(logical_path);
    if let Some(hit) = existing
        .iter()
        .find(|n| mailbox_logical_path_key(n) == want)
    {
        return hit.clone();
    }

    let delim = hierarchy_delimiter_from_wire_anchor(hierarchy_anchor);
    let logical_segments: Vec<&str> = logical_path
        .split(|c| c == '/' || c == '.')
        .map(|p| p.trim())
        .filter(|p| !p.is_empty())
        .collect();
    let anchor_key = mailbox_logical_path_key(hierarchy_anchor);

    let mut suffix_start = 0usize;
    if logical_segments.len() >= anchor_key.len() {
        let lead: Vec<String> = logical_segments[..anchor_key.len()]
            .iter()
            .map(|s| s.to_ascii_lowercase())
            .collect();
        if lead == anchor_key {
            suffix_start = anchor_key.len();
        }
    }
    if suffix_start == 0 {
        if let (Some(first), Some(last)) = (logical_segments.first(), anchor_key.last()) {
            if first.to_ascii_lowercase() == *last {
                suffix_start = 1;
            }
        }
    }

    let mut wire = hierarchy_anchor.to_string();
    for label in &logical_segments[suffix_start..] {
        if !wire.is_empty() {
            wire.push(delim);
        }
        wire.push_str(label);
    }
    wire
}

/// First LIST mailbox string per normalization key (bytes the server expects for SELECT).
pub fn mailbox_list_canonical_table(names: &[String]) -> HashMap<String, String> {
    let mut map = HashMap::with_capacity(names.len());
    for n in names {
        map.entry(mailbox_name_match_key(n))
            .or_insert_with(|| n.clone());
    }
    map
}

/// One selectable LIST row: wire name from the server plus decoded Unicode for UI / keys.
#[derive(Clone, Debug)]
pub struct MailboxListEntry {
    pub raw_list_name: String,
    pub decoded_name: String,
}

/// First selectable LIST row matching `requested` (decoded, raw, logical path, or NFC key).
pub fn find_mailbox_list_entry<'a>(
    requested: &str,
    entries: &'a [MailboxListEntry],
) -> Option<&'a MailboxListEntry> {
    let req = requested.trim();
    if req.is_empty() {
        return None;
    }
    if let Some(e) = entries
        .iter()
        .find(|e| e.decoded_name == req || e.raw_list_name == req)
    {
        return Some(e);
    }
    let want_log = mailbox_logical_path_key(req);
    if let Some(e) = entries
        .iter()
        .find(|e| mailbox_logical_path_key(&e.decoded_name) == want_log)
    {
        return Some(e);
    }
    let want_nfc = mailbox_name_match_key(req);
    entries
        .iter()
        .find(|e| mailbox_name_match_key(&e.decoded_name) == want_nfc)
}

fn push_unique_mailbox_name(out: &mut Vec<String>, s: &str) {
    if s.trim().is_empty() {
        return;
    }
    let t = s.to_string();
    if !out.iter().any(|existing| existing == &t) {
        out.push(t);
    }
}

/// Garde uniquement les noms qui correspondent à une ligne LIST sélectionnable (évite MOVE/CREATE avec un chemin `/` inventé sur serveur dot-only).
pub fn filter_imap_command_names_on_server(
    names: Vec<String>,
    entries: &[MailboxListEntry],
) -> Vec<String> {
    names
        .into_iter()
        .filter(|name| {
            entries.iter().any(|e| e.raw_list_name == *name || e.decoded_name == *name)
        })
        .collect()
}

/// Names to pass to `UID MOVE` / `UID COPY` (LIST wire bytes first, then decoded spellings).
pub fn resolve_mailbox_imap_command_names(
    requested: &str,
    entries: &[MailboxListEntry],
) -> Vec<String> {
    let mut out: Vec<String> = Vec::new();
    if let Some(entry) = find_mailbox_list_entry(requested, entries) {
        push_unique_mailbox_name(&mut out, &entry.raw_list_name);
        for v in mailbox_select_variant_strings(
            &entry.raw_list_name,
            &entry.decoded_name,
            Some(requested),
        ) {
            push_unique_mailbox_name(&mut out, &v);
        }
        return out;
    }
    let decoded_list: Vec<String> = entries.iter().map(|e| e.decoded_name.clone()).collect();
    let wire = resolve_mailbox_wire_name(requested, &decoded_list);
    if let Some(entry) = find_mailbox_list_entry(&wire, entries) {
        push_unique_mailbox_name(&mut out, &entry.raw_list_name);
        for v in mailbox_select_variant_strings(
            &entry.raw_list_name,
            &entry.decoded_name,
            Some(requested),
        ) {
            push_unique_mailbox_name(&mut out, &v);
        }
        return out;
    }
    for v in mailbox_select_variants_no_list(requested) {
        push_unique_mailbox_name(&mut out, &v);
    }
    if wire != requested {
        push_unique_mailbox_name(&mut out, &wire);
        for v in mailbox_select_variants_no_list(&wire) {
            push_unique_mailbox_name(&mut out, &v);
        }
    }
    out
}

/// First LIST entry per NFC-normalized decoded name (stable key for sidebar ↔ sync).
pub fn mailbox_list_entry_by_match_key(
    entries: &[MailboxListEntry],
) -> HashMap<String, MailboxListEntry> {
    let mut map = HashMap::with_capacity(entries.len());
    for e in entries {
        let k = mailbox_name_match_key(&e.decoded_name);
        map.entry(k).or_insert_with(|| e.clone());
    }
    map
}

/// Build an IMAP UID set string, e.g. `1,2,5:10`.
pub fn format_uid_set(uids: &[Uid]) -> String {
    let mut set = String::new();
    for (index, uid) in uids.iter().enumerate() {
        if index > 0 {
            set.push(',');
        }
        set.push_str(&uid.to_string());
    }
    set
}

fn name_is_selectable(name: &async_imap::types::Name) -> bool {
    !name
        .attributes()
        .iter()
        .any(|a| matches!(a, NameAttribute::NoSelect))
}

/// LIST all mailbox names on an already-authenticated session (shared with batch sync).
pub async fn list_mailbox_names(session: &mut ImapSession) -> Result<Vec<String>, String> {
    let stream = session
        .list(None, Some("*"))
        .await
        .map_err(map_imap_error)?;
    let mut stream = stream;
    let mut names = Vec::new();
    while let Some(item) = stream.try_next().await.map_err(map_imap_error)? {
        let name = decode_imap_mailbox_name(item.name());
        if !names.contains(&name) {
            names.push(name);
        }
    }
    drop(stream);
    names.sort();
    Ok(names)
}

/// Like [`list_mailbox_names`], but omits `\Noselect` parents so `SELECT` is valid for each path.
pub async fn list_selectable_mailbox_entries(
    session: &mut ImapSession,
) -> Result<Vec<MailboxListEntry>, String> {
    let stream = session
        .list(None, Some("*"))
        .await
        .map_err(map_imap_error)?;
    let mut stream = stream;
    let mut entries = Vec::new();
    while let Some(item) = stream.try_next().await.map_err(map_imap_error)? {
        if !name_is_selectable(&item) {
            continue;
        }
        let raw_list_name = item.name().to_string();
        let decoded_name = decode_imap_mailbox_name(&raw_list_name);
        entries.push(MailboxListEntry {
            raw_list_name,
            decoded_name,
        });
    }
    drop(stream);
    entries.sort_by(|a, b| a.decoded_name.cmp(&b.decoded_name));
    Ok(entries)
}

/// Like [`list_mailbox_names`], but omits `\Noselect` parents so `SELECT` is valid for each path.
pub async fn list_selectable_mailbox_names(
    session: &mut ImapSession,
) -> Result<Vec<String>, String> {
    let entries = list_selectable_mailbox_entries(session).await?;
    Ok(entries.into_iter().map(|e| e.decoded_name).collect())
}

/// Ordre de préférence pour le dossier des messages envoyés (noms IMAP fréquents).
const SENT_MAILBOX_CANDIDATES: &[&str] = &[
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

/// Choisit une entrée LIST « sélectionnable » pour `APPEND` vers les éléments envoyés.
pub fn pick_sent_mailbox_entry(entries: &[MailboxListEntry]) -> Option<MailboxListEntry> {
    for needle in SENT_MAILBOX_CANDIDATES {
        for e in entries {
            if e.decoded_name.eq_ignore_ascii_case(needle) {
                return Some(e.clone());
            }
        }
    }
    for e in entries {
        let l = e.decoded_name.to_ascii_lowercase();
        if l.contains("draft")
            || l.contains("trash")
            || l.contains("spam")
            || l.contains("junk")
            || l.contains("deleted")
            || l.contains("corbeille")
        {
            continue;
        }
        if l == "sent" || l.ends_with("/sent") {
            return Some(e.clone());
        }
        if l.contains("envoy") || l.contains("gesendet") || l.contains("postausgang") {
            return Some(e.clone());
        }
    }
    None
}

pub async fn list_mailboxes(account: &Account) -> Result<Vec<String>, String> {
    let mut session = login_session_for_account(account).await?;
    let names = list_mailbox_names(&mut session).await?;
    let _ = session.logout().await;
    Ok(names)
}

/// LIST sans parents `\Noselect` — pour corbeille, archive et `UID MOVE`.
pub async fn list_selectable_mailboxes(account: &Account) -> Result<Vec<String>, String> {
    let mut session = login_session_for_account(account).await?;
    let entries = list_selectable_mailbox_entries(&mut session).await?;
    let _ = session.logout().await;
    Ok(entries.into_iter().map(|e| e.decoded_name).collect())
}

/// Alias historique — voir [`resolve_mailbox_imap_command_names`].
pub fn resolve_mailbox_move_targets(
    requested: &str,
    entries: &[MailboxListEntry],
) -> Vec<String> {
    resolve_mailbox_imap_command_names(requested, entries)
}

/// Run `UID MOVE`; if it fails (e.g. no `MOVE` capability), copy + `\\Deleted` + `EXPUNGE`.
/// Returns the mailbox name accepted by the server (for sync / SQLite keys).
pub async fn uid_move_with_fallback(
    session: &mut ImapSession,
    uid_set: &str,
    target_mailboxes: &[String],
) -> Result<String, String> {
    if target_mailboxes.is_empty() {
        return Err("IMAP: destination vide".to_string());
    }
    let mut last_err = String::new();
    for target in target_mailboxes {
        match session.uid_mv(uid_set, target.as_str()).await {
            Ok(()) => return Ok(target.clone()),
            Err(e) => last_err = map_imap_error(e),
        }
    }
    for target in target_mailboxes {
        match session.uid_copy(uid_set, target.as_str()).await {
            Ok(()) => {
                let stream = session
                    .uid_store(uid_set, "+FLAGS (\\Deleted)")
                    .await
                    .map_err(map_imap_error)?;
                let _: Vec<_> = stream.try_collect().await.map_err(map_imap_error)?;
                let exp = session.expunge().await.map_err(map_imap_error)?;
                let _: Vec<_> = exp.try_collect().await.map_err(map_imap_error)?;
                return Ok(target.clone());
            }
            Err(e) => last_err = map_imap_error(e),
        }
    }
    Err(if last_err.is_empty() {
        "IMAP: déplacement impossible".to_string()
    } else {
        last_err
    })
}

/// Supprime définitivement du serveur les messages déjà marqués `\\Deleted` dans la boîte **sélectionnée**.
pub async fn expunge_after_delete_flags(session: &mut ImapSession) -> Result<(), String> {
    let exp = session.expunge().await.map_err(map_imap_error)?;
    let _: Vec<_> = exp.try_collect().await.map_err(map_imap_error)?;
    Ok(())
}

/// Copy messages by UID to another mailbox (source mailbox must be selected).
pub async fn uid_copy_to_mailbox(
    session: &mut ImapSession,
    uid_set: &str,
    target_mailbox: &str,
) -> Result<(), String> {
    session
        .uid_copy(uid_set, target_mailbox)
        .await
        .map_err(map_imap_error)
}

/// [`UID STORE`](https://www.rfc-editor.org/rfc/rfc3501#section-6.4.8) (e.g. `+FLAGS (\\Seen)`).
pub async fn uid_store(
    session: &mut ImapSession,
    uid_set: &str,
    store_query: &str,
) -> Result<(), String> {
    let stream = session
        .uid_store(uid_set, store_query)
        .await
        .map_err(map_imap_error)?;
    let _: Vec<_> = stream.try_collect().await.map_err(map_imap_error)?;
    Ok(())
}

pub async fn imap_create_mailbox(session: &mut ImapSession, name: &str) -> Result<(), String> {
    session.create(name).await.map_err(map_imap_error)
}

pub async fn imap_delete_mailbox(session: &mut ImapSession, name: &str) -> Result<(), String> {
    session.delete(name).await.map_err(map_imap_error)
}

/// `DELETE` en essayant chaque orthographe (UTF-7 LIST, Unicode, etc.).
pub async fn imap_delete_mailbox_with_fallback(
    session: &mut ImapSession,
    mailbox_names: &[String],
) -> Result<String, String> {
    if mailbox_names.is_empty() {
        return Err("IMAP: nom de dossier vide".to_string());
    }
    let mut last_err = String::new();
    for name in mailbox_names {
        match session.delete(name.as_str()).await {
            Ok(()) => return Ok(name.clone()),
            Err(e) => last_err = map_imap_error(e),
        }
    }
    Err(if last_err.is_empty() {
        "IMAP: suppression du dossier impossible".to_string()
    } else {
        last_err
    })
}

pub async fn imap_rename_mailbox(
    session: &mut ImapSession,
    from: &str,
    to: &str,
) -> Result<(), String> {
    session.rename(from, to).await.map_err(map_imap_error)
}

pub async fn imap_subscribe(session: &mut ImapSession, mailbox: &str) -> Result<(), String> {
    session.subscribe(mailbox).await.map_err(map_imap_error)
}

#[cfg(test)]
mod mailbox_logical_path_tests {
    use super::mailbox_logical_path_key;

    #[test]
    fn inbox_dot_path_matches_slash_thunderbird_style() {
        let a = "INBOX.DOSSIERS PERSO.Succession NICOLE";
        let b = " DOSSIERS PERSO/Succession NICOLE";
        assert_eq!(mailbox_logical_path_key(a), mailbox_logical_path_key(b));
    }

    #[test]
    fn leading_space_preserved_in_segments() {
        let a = " INBOX.X.Y";
        let b = "X/Y";
        assert_eq!(mailbox_logical_path_key(a), mailbox_logical_path_key(b));
    }

    /// Espace entre `/` et le nom du segment (affichage Thunderbird / copier-coller URI).
    #[test]
    fn space_after_slash_same_as_tight_slash() {
        let spaced = "Prefix/ DOSSIERS PERSO/Succession NICOLE";
        let tight = "Prefix/DOSSIERS PERSO/Succession NICOLE";
        assert_eq!(mailbox_logical_path_key(spaced), mailbox_logical_path_key(tight));
    }

    #[test]
    fn move_targets_prefer_raw_list_name() {
        use super::{mailbox_name_match_key, resolve_mailbox_move_targets, MailboxListEntry};
        let entries = vec![MailboxListEntry {
            raw_list_name: "INBOX.Archive".to_string(),
            decoded_name: "INBOX.Archive".to_string(),
        }];
        let targets = resolve_mailbox_move_targets("Archive", &entries);
        assert!(!targets.is_empty());
        assert_eq!(targets[0], "INBOX.Archive");
        let key = mailbox_name_match_key("INBOX.Archive");
        assert!(targets.iter().any(|t| mailbox_name_match_key(t) == key));
    }

    #[test]
    fn wire_archive_path_uses_dot_hierarchy() {
        use super::resolve_wire_mailbox_for_logical_path;
        let list = vec![
            "INBOX".to_string(),
            "INBOX.Archive".to_string(),
            "INBOX.Archive.2024.05-mai".to_string(),
        ];
        let wire = resolve_wire_mailbox_for_logical_path(
            "Archive/2024/05-mai",
            "INBOX.Archive",
            &list,
        );
        assert_eq!(wire, "INBOX.Archive.2024.05-mai");
    }

    #[test]
    fn wire_archive_path_builds_when_missing() {
        use super::resolve_wire_mailbox_for_logical_path;
        let list = vec!["INBOX.Archive".to_string()];
        let wire = resolve_wire_mailbox_for_logical_path(
            "Archive/2024/05-mai",
            "INBOX.Archive",
            &list,
        );
        assert_eq!(wire, "INBOX.Archive.2024.05-mai");
    }

    #[test]
    fn inbox_prefix_without_space_after_dot() {
        let list = vec!["INBOX.DOSSIERS PERSO.Boxproof".to_string()];
        let seed = vec![" DOSSIERS PERSO.Boxproof".to_string()];
        let expanded = super::augmented_mailbox_select_variants(&seed, Some(&list));
        assert!(expanded.iter().any(|s| s == " DOSSIERS PERSO.Boxproof"));
        assert!(expanded.iter().any(|s| s == "INBOX.DOSSIERS PERSO.Boxproof"));
        assert!(!expanded.iter().any(|s| s == "INBOX. DOSSIERS PERSO.Boxproof"));
        assert!(!expanded.iter().any(|s| s.contains('/')));
    }

    #[test]
    fn thunderbird_slash_path_matches_inbox_dot_list() {
        let slash = "DOSSIERS PERSO/Boxproof";
        let dot = "INBOX.DOSSIERS PERSO.Boxproof";
        assert_eq!(
            mailbox_logical_path_key(slash),
            mailbox_logical_path_key(dot)
        );
    }

    #[test]
    fn augmented_dot_only_server_from_dot_body() {
        let list = vec![
            "INBOX".to_string(),
            "INBOX.DOSSIERS PERSO.Boxproof".to_string(),
        ];
        let seed = vec!["DOSSIERS PERSO.Boxproof".to_string()];
        let expanded = super::augmented_mailbox_select_variants(&seed, Some(&list));
        assert!(expanded.iter().any(|s| s == "INBOX.DOSSIERS PERSO.Boxproof"));
        assert!(!expanded.iter().any(|s| s.contains('/')));
    }

    #[test]
    fn augmented_dot_only_server_from_thunderbird_slash() {
        let list = vec!["INBOX.DOSSIERS PERSO.Boxproof".to_string()];
        let seed = vec!["DOSSIERS PERSO/Boxproof".to_string()];
        let expanded = super::augmented_mailbox_select_variants(&seed, Some(&list));
        assert!(expanded.iter().any(|s| s == "INBOX.DOSSIERS PERSO.Boxproof"));
        assert!(!expanded.iter().any(|s| s.contains('/')));
    }

    #[test]
    fn augmented_slash_server_keeps_slash_variants() {
        let list = vec!["DOSSIERS PERSO/Boxproof".to_string()];
        let seed = vec!["DOSSIERS PERSO/Boxproof".to_string()];
        let expanded = super::augmented_mailbox_select_variants(&seed, Some(&list));
        assert!(expanded.iter().any(|s| s == "INBOX/DOSSIERS PERSO/Boxproof"));
    }

    #[test]
    fn augmented_gmail_folders_kept_on_dot_delimiter_list() {
        let list = vec![
            "INBOX".to_string(),
            "INBOX.Labels".to_string(),
            "[Gmail]/Corbeille".to_string(),
            "[Gmail]/Spam".to_string(),
            "[Gmail]/Tous les messages".to_string(),
        ];
        let seed = vec!["[Gmail]/Corbeille".to_string()];
        let expanded = super::augmented_mailbox_select_variants(&seed, Some(&list));
        assert!(
            expanded.iter().any(|s| s == "[Gmail]/Corbeille"),
            "expanded={expanded:?}"
        );
    }

    #[test]
    fn resolve_wire_name_prefers_list_spelling() {
        let list = vec![
            "INBOX".to_string(),
            "INBOX.DOSSIERS PERSO.Boxproof".to_string(),
        ];
        let hit = super::resolve_mailbox_wire_name("DOSSIERS PERSO.Boxproof", &list);
        assert_eq!(hit, "INBOX.DOSSIERS PERSO.Boxproof");
    }

    #[test]
    fn resolve_wire_name_thunderbird_slash_against_dot_list() {
        let list = vec!["INBOX.DOSSIERS PERSO.Boxproof".to_string()];
        let hit = super::resolve_mailbox_wire_name("DOSSIERS PERSO/Boxproof", &list);
        assert_eq!(hit, "INBOX.DOSSIERS PERSO.Boxproof");
    }

    #[test]
    fn hierarchy_delimiter_follows_anchor() {
        assert_eq!(
            super::hierarchy_delimiter_from_wire_anchor("DOSSIERS PERSO/Boxproof"),
            '/'
        );
        assert_eq!(
            super::hierarchy_delimiter_from_wire_anchor("INBOX.Archive"),
            '.'
        );
    }

    #[test]
    fn wire_archive_under_slash_anchor() {
        use super::resolve_wire_mailbox_for_logical_path;
        let list = vec![
            "DOSSIERS PERSO/Boxproof".to_string(),
            "DOSSIERS PERSO/Boxproof/Archive".to_string(),
        ];
        let wire = resolve_wire_mailbox_for_logical_path(
            "DOSSIERS PERSO/Boxproof/Archive/2024/05-mai",
            "DOSSIERS PERSO/Boxproof/Archive",
            &list,
        );
        assert_eq!(wire, "DOSSIERS PERSO/Boxproof/Archive/2024/05-mai");
    }

    #[test]
    fn imap_command_names_prefers_list_raw_wire() {
        use super::{MailboxListEntry, resolve_mailbox_imap_command_names};
        let entries = vec![MailboxListEntry {
            raw_list_name: "INBOX.DOSSIERS PERSO.Boxproof".to_string(),
            decoded_name: "INBOX.DOSSIERS PERSO.Boxproof".to_string(),
        }];
        let names = resolve_mailbox_imap_command_names("DOSSIERS PERSO/Boxproof", &entries);
        assert_eq!(
            names.first().map(String::as_str),
            Some("INBOX.DOSSIERS PERSO.Boxproof")
        );
        assert!(names.iter().any(|s| !s.contains('/')));
    }

    #[test]
    fn imap_command_names_thunderbird_slash_to_dot_list() {
        use super::{MailboxListEntry, resolve_mailbox_imap_command_names};
        let entries = vec![MailboxListEntry {
            raw_list_name: "INBOX.Archive.2025.05-mai".to_string(),
            decoded_name: "INBOX.Archive.2025.05-mai".to_string(),
        }];
        let names = resolve_mailbox_imap_command_names("Archive/2025/05-mai", &entries);
        assert!(
            names
                .first()
                .is_some_and(|s| s == "INBOX.Archive.2025.05-mai")
        );
    }

    #[test]
    fn filter_imap_command_names_drops_invented_slash_on_dot_server() {
        use super::{
            MailboxListEntry, filter_imap_command_names_on_server,
            resolve_mailbox_imap_command_names,
        };
        let entries = vec![MailboxListEntry {
            raw_list_name: "INBOX.Archive".to_string(),
            decoded_name: "INBOX.Archive".to_string(),
        }];
        let raw = resolve_mailbox_imap_command_names("Archive/2025/05-mai", &entries);
        assert!(raw.iter().any(|s| s.contains('/')));
        let filtered = filter_imap_command_names_on_server(raw, &entries);
        assert!(filtered.is_empty());
    }

    #[test]
    fn move_targets_alias_matches_imap_command_names() {
        use super::{
            MailboxListEntry, resolve_mailbox_imap_command_names, resolve_mailbox_move_targets,
        };
        let entries = vec![MailboxListEntry {
            raw_list_name: "INBOX.Trash".to_string(),
            decoded_name: "INBOX.Trash".to_string(),
        }];
        assert_eq!(
            resolve_mailbox_move_targets("Trash", &entries),
            resolve_mailbox_imap_command_names("Trash", &entries)
        );
    }
}
