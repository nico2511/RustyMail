//! Registre d'idempotence des envois.
//!
//! Mémoire processus + lignes `send_attempts` (TTL 1 h, les plus vieilles sont supprimées).
//! Seul le même `send_id` est rejoué sans SMTP : reprise après redémarrage ou nouvel essai
//! de cette tentative exacte. Un autre identifiant démarre toujours SMTP, même si l'empreinte
//! coïncide (autre brouillon, autre pièce jointe, renvoi volontaire).
//! L'empreinte couvre le compte, l'id de brouillon, les destinataires, l'objet, le corps,
//! les pièces jointes, `in_reply_to`, les références et `send_html`.
//! Un même `send_id` avec une autre empreinte n'est ni rejoué ni renvoyé.
//!
//! Un `inflight` de ce lancement n'est jamais repris, même après 3 minutes.
//! Seul un `inflight` d'un lancement précédent, et seulement après ce délai, peut être repris.
//! `smtp_accepted` (SMTP déjà accepté, copie Envoyés pas encore finie) se rejoue sans SMTP.
//!
//! Risque restant : plantage après acceptation SMTP mais avant l'écriture `smtp_accepted`.

use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};
use std::sync::OnceLock;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use rusqlite::{params, Connection};
use sha2::{Digest, Sha256};

pub const SEND_ATTEMPT_TTL: Duration = Duration::from_secs(60 * 60);
/// Au-delà, un `inflight` d'un *autre* lancement peut être repris. Jamais celui du processus courant.
pub const SEND_INFLIGHT_STALE: Duration = Duration::from_secs(3 * 60);

/// Identifiant de ce processus. Stable jusqu'à l'arrêt : un `inflight` qui le porte n'est pas repris.
pub fn current_send_launch_id() -> &'static str {
    static ID: OnceLock<String> = OnceLock::new();
    ID.get_or_init(|| uuid::Uuid::new_v4().to_string()).as_str()
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum SendSlot<T> {
    InFlight {
        started: SystemTime,
        fingerprint: String,
        launch_id: String,
    },
    /// SMTP accepté, copie « Envoyés » pas encore conclue. Pas un second SMTP.
    SmtpAccepted {
        at: SystemTime,
        value: T,
        fingerprint: String,
        launch_id: String,
    },
    Done {
        at: SystemTime,
        value: T,
        fingerprint: String,
    },
    Failed {
        at: SystemTime,
        error: String,
        fingerprint: String,
    },
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum SendBegin {
    Start,
    InFlight,
    /// Même lancement, envoi encore en cours (même après le délai de 3 minutes) : pas de SMTP.
    AlreadyInFlight,
    Replay,
    /// SMTP déjà accepté pour cet id : pas de SMTP. La copie Envoyés peut être retentée à part.
    Accepted,
    /// Même identifiant, autre message : ne pas rejouer l'ancien envoi.
    IdReused,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct StoredSendAttempt {
    pub send_id: String,
    pub fingerprint: String,
    pub state: String,
    pub imap_notice: Option<String>,
    pub error: Option<String>,
    pub at_unix: i64,
    /// Lancement qui a créé l'`inflight` ou le `smtp_accepted`. Vide : lancement inconnu (reprise possible).
    pub launch_id: String,
}

#[derive(Debug)]
pub struct SendAttemptBook<T> {
    slots: HashMap<String, SendSlot<T>>,
}

impl<T> Default for SendAttemptBook<T> {
    fn default() -> Self {
        Self {
            slots: HashMap::new(),
        }
    }
}

impl<T: Clone> SendAttemptBook<T> {
    pub fn begin(&mut self, id: &str, now: SystemTime) -> SendBegin {
        self.begin_payload(id, "", now)
    }

    /// `fingerprint` vide : comparaison par identifiant seulement (tests historiques).
    /// Un autre `send_id` ne rejoue jamais un envoi déjà `Done`, même à empreinte égale.
    pub fn begin_payload(&mut self, id: &str, fingerprint: &str, now: SystemTime) -> SendBegin {
        self.begin_owned(id, fingerprint, now, current_send_launch_id())
    }

    /// `launch_id` est le lancement qui demande l'envoi. Un `inflight` du même lancement
    /// n'est jamais repris. Un autre lancement ne l'est qu'après [`SEND_INFLIGHT_STALE`].
    pub fn begin_owned(
        &mut self,
        id: &str,
        fingerprint: &str,
        now: SystemTime,
        launch_id: &str,
    ) -> SendBegin {
        self.purge(now);
        let owned = self.slots.get(id).cloned();
        if let Some(SendSlot::InFlight {
            started,
            fingerprint: fp,
            launch_id: owner,
        }) = owned
        {
            if fp == fingerprint
                && now.duration_since(started).unwrap_or_default() > SEND_INFLIGHT_STALE
            {
                if owner == launch_id {
                    return SendBegin::AlreadyInFlight;
                }
                self.slots.insert(
                    id.to_string(),
                    SendSlot::InFlight {
                        started: now,
                        fingerprint: fingerprint.to_string(),
                        launch_id: launch_id.to_string(),
                    },
                );
                return SendBegin::Start;
            }
        }
        match self.slots.get(id) {
            Some(SendSlot::InFlight {
                fingerprint: fp, ..
            }) if fp == fingerprint => SendBegin::InFlight,
            Some(SendSlot::InFlight { .. }) => SendBegin::IdReused,
            Some(SendSlot::SmtpAccepted {
                fingerprint: fp, ..
            }) if fp == fingerprint => SendBegin::Accepted,
            Some(SendSlot::SmtpAccepted { .. }) => SendBegin::IdReused,
            Some(SendSlot::Done {
                fingerprint: fp, ..
            }) if fp == fingerprint => SendBegin::Replay,
            Some(SendSlot::Done { .. }) => SendBegin::IdReused,
            Some(SendSlot::Failed { .. }) | None => {
                self.slots.insert(
                    id.to_string(),
                    SendSlot::InFlight {
                        started: now,
                        fingerprint: fingerprint.to_string(),
                        launch_id: launch_id.to_string(),
                    },
                );
                SendBegin::Start
            }
        }
    }

    pub fn absorb_absent(&mut self, id: &str, slot: SendSlot<T>) {
        self.slots.entry(id.to_string()).or_insert(slot);
    }

    pub fn replay(&self, id: &str) -> Option<T> {
        match self.slots.get(id) {
            Some(SendSlot::Done { value, .. } | SendSlot::SmtpAccepted { value, .. }) => {
                Some(value.clone())
            }
            _ => None,
        }
    }

    pub fn launch_of(&self, id: &str) -> Option<String> {
        match self.slots.get(id) {
            Some(
                SendSlot::InFlight { launch_id, .. } | SendSlot::SmtpAccepted { launch_id, .. },
            ) => Some(launch_id.clone()),
            _ => None,
        }
    }

    /// SMTP vient d'accepter. Le créneau ne doit plus jamais relancer SMTP pour cet id.
    pub fn mark_smtp_accepted(&mut self, id: &str, value: T, now: SystemTime) {
        let (fingerprint, launch_id) = match self.slots.get(id) {
            Some(SendSlot::InFlight {
                fingerprint,
                launch_id,
                ..
            }) => (fingerprint.clone(), launch_id.clone()),
            Some(slot) => (slot_fingerprint(slot).to_string(), String::new()),
            None => (String::new(), String::new()),
        };
        self.slots.insert(
            id.to_string(),
            SendSlot::SmtpAccepted {
                at: now,
                value,
                fingerprint,
                launch_id,
            },
        );
    }

    pub fn complete_ok(&mut self, id: &str, value: T, now: SystemTime) {
        let fingerprint = self
            .slots
            .get(id)
            .map(slot_fingerprint)
            .unwrap_or_default()
            .to_string();
        self.slots.insert(
            id.to_string(),
            SendSlot::Done {
                at: now,
                value,
                fingerprint,
            },
        );
    }

    pub fn complete_err(&mut self, id: &str, error: String, now: SystemTime) {
        let fingerprint = self
            .slots
            .get(id)
            .map(slot_fingerprint)
            .unwrap_or_default()
            .to_string();
        self.slots.insert(
            id.to_string(),
            SendSlot::Failed {
                at: now,
                error,
                fingerprint,
            },
        );
    }

    pub fn fingerprint_of(&self, id: &str) -> Option<String> {
        self.slots
            .get(id)
            .map(|slot| slot_fingerprint(slot).to_string())
    }

    pub fn get(&self, id: &str, now: SystemTime) -> Option<SendSlot<T>> {
        let slot = self.slots.get(id)?.clone();
        let at = match &slot {
            SendSlot::InFlight { started, .. } => *started,
            SendSlot::SmtpAccepted { at, .. }
            | SendSlot::Done { at, .. }
            | SendSlot::Failed { at, .. } => *at,
        };
        if now.duration_since(at).unwrap_or_default() > SEND_ATTEMPT_TTL {
            return None;
        }
        Some(slot)
    }

    fn purge(&mut self, now: SystemTime) {
        self.slots.retain(|_, slot| {
            let at = match slot {
                SendSlot::InFlight { started, .. } => *started,
                SendSlot::SmtpAccepted { at, .. }
                | SendSlot::Done { at, .. }
                | SendSlot::Failed { at, .. } => *at,
            };
            now.duration_since(at).unwrap_or_default() <= SEND_ATTEMPT_TTL
        });
    }
}

fn slot_fingerprint<T>(slot: &SendSlot<T>) -> &str {
    match slot {
        SendSlot::InFlight { fingerprint, .. }
        | SendSlot::SmtpAccepted { fingerprint, .. }
        | SendSlot::Done { fingerprint, .. }
        | SendSlot::Failed { fingerprint, .. } => fingerprint,
    }
}

pub fn draft_send_fingerprint(account_id: &str, draft: &rustymail_domain::Draft) -> String {
    let mut to = emails_of(&draft.to);
    let mut cc = emails_of(&draft.cc);
    let mut bcc = emails_of(&draft.bcc);
    to.sort();
    cc.sort();
    bcc.sort();
    let mut refs: Vec<&str> = draft
        .references
        .iter()
        .map(|item| item.trim())
        .filter(|item| !item.is_empty())
        .collect();
    refs.sort();
    let attachments = attachment_tokens(&draft.attachment_paths);
    let mut hasher = Sha256::new();
    hasher.update(account_id.trim().to_ascii_lowercase().as_bytes());
    hasher.update(b"\n--\n");
    hasher.update(draft.id.0.trim().as_bytes());
    hasher.update(b"\n--\n");
    hasher.update(to.join("\n").as_bytes());
    hasher.update(b"\n--\n");
    hasher.update(cc.join("\n").as_bytes());
    hasher.update(b"\n--\n");
    hasher.update(bcc.join("\n").as_bytes());
    hasher.update(b"\n--\n");
    hasher.update(draft.subject.trim().as_bytes());
    hasher.update(b"\n--\n");
    hasher.update(draft.markdown_body.as_bytes());
    hasher.update(b"\n--\n");
    hasher.update(attachments.join("\n").as_bytes());
    hasher.update(b"\n--\n");
    hasher.update(draft.in_reply_to.as_deref().unwrap_or("").trim().as_bytes());
    hasher.update(b"\n--\n");
    hasher.update(refs.join("\n").as_bytes());
    hasher.update(b"\n--\n");
    hasher.update([u8::from(draft.send_html)]);
    hex::encode(hasher.finalize())
}

fn attachment_tokens(paths: &[String]) -> Vec<String> {
    let mut tokens: Vec<String> = paths
        .iter()
        .map(|path| path.trim())
        .filter(|path| !path.is_empty())
        .map(attachment_token)
        .collect();
    tokens.sort();
    tokens
}

/// Empreinte du chemin, plus taille et mtime si le fichier est lisible.
fn attachment_token(path: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(path.as_bytes());
    if let Ok(meta) = std::fs::metadata(path) {
        hasher.update(meta.len().to_le_bytes());
        let secs = meta
            .modified()
            .ok()
            .and_then(|modified| modified.duration_since(UNIX_EPOCH).ok())
            .map(|age| age.as_secs())
            .unwrap_or(0);
        hasher.update(secs.to_le_bytes());
    }
    hex::encode(hasher.finalize())
}

fn emails_of(list: &[rustymail_domain::EmailAddress]) -> Vec<String> {
    list.iter()
        .map(|addr| addr.email.trim().to_ascii_lowercase())
        .filter(|email| !email.is_empty())
        .collect()
}

pub fn upsert_stored_send(conn: &Connection, row: &StoredSendAttempt) -> Result<(), String> {
    conn.execute(
        "INSERT INTO send_attempts (send_id, fingerprint, state, imap_notice, error, at_unix, launch_id)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
         ON CONFLICT(send_id) DO UPDATE SET
            fingerprint = excluded.fingerprint,
            state = excluded.state,
            imap_notice = excluded.imap_notice,
            error = excluded.error,
            at_unix = excluded.at_unix,
            launch_id = excluded.launch_id",
        params![
            row.send_id,
            row.fingerprint,
            row.state,
            row.imap_notice,
            row.error,
            row.at_unix,
            row.launch_id
        ],
    )
    .map_err(|e| e.to_string())?;
    prune_stored_sends(conn, unix_secs(SystemTime::now()))?;
    Ok(())
}

/// Supprime les tentatives plus vieilles que le TTL, puis les fichiers `send-spool` trop vieux
/// ou dont la ligne n'existe plus.
pub fn prune_stored_sends(conn: &Connection, now_unix: i64) -> Result<usize, String> {
    let cutoff = now_unix.saturating_sub(SEND_ATTEMPT_TTL.as_secs() as i64);
    let n = conn
        .execute(
            "DELETE FROM send_attempts WHERE at_unix < ?1",
            params![cutoff],
        )
        .map_err(|e| e.to_string())?;
    match cleanup_send_spool(conn, now_unix) {
        Ok(files) if files > 0 => log::info!("send-spool : {files} fichier(s) supprimé(s)"),
        Ok(_) => {}
        Err(e) => log::warn!("send-spool : {e}"),
    }
    Ok(n)
}

fn send_spool_dir(conn: &Connection) -> Result<Option<PathBuf>, String> {
    let path: String = conn
        .query_row(
            "SELECT file FROM pragma_database_list WHERE name = 'main'",
            [],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;
    if path.is_empty() {
        return Ok(None);
    }
    Ok(Path::new(&path).parent().map(|dir| dir.join("send-spool")))
}

fn spool_send_id(file_name: &str) -> Option<&str> {
    let id = file_name
        .strip_suffix(".rfc822")
        .or_else(|| file_name.strip_suffix(".mid"))?;
    if id.is_empty() || !id.chars().all(|c| c.is_ascii_hexdigit() || c == '-') {
        return None;
    }
    Some(id)
}

fn live_send_ids(conn: &Connection) -> Result<HashSet<String>, String> {
    let mut stmt = conn
        .prepare("SELECT send_id FROM send_attempts")
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |row| row.get::<_, String>(0))
        .map_err(|e| e.to_string())?;
    rows.collect::<Result<HashSet<_>, _>>()
        .map_err(|e| e.to_string())
}

/// Efface les fichiers `send-spool/<id>.rfc822` et `.mid` de plus d'une heure,
/// et ceux dont l'identifiant n'a plus de ligne `send_attempts`.
pub fn cleanup_send_spool(conn: &Connection, now_unix: i64) -> Result<usize, String> {
    let Some(dir) = send_spool_dir(conn)? else {
        return Ok(0);
    };
    let Ok(entries) = std::fs::read_dir(&dir) else {
        return Ok(0);
    };
    let live = live_send_ids(conn)?;
    let cutoff = now_unix.saturating_sub(SEND_ATTEMPT_TTL.as_secs() as i64);
    let mut removed = 0usize;
    for entry in entries {
        let entry = match entry {
            Ok(entry) => entry,
            Err(_) => continue,
        };
        let path = entry.path();
        if !path.is_file() {
            continue;
        }
        let Some(name) = path.file_name().and_then(|n| n.to_str()) else {
            continue;
        };
        let Some(send_id) = spool_send_id(name) else {
            continue;
        };
        let aged = entry
            .metadata()
            .ok()
            .and_then(|meta| meta.modified().ok())
            .and_then(|modified| modified.duration_since(UNIX_EPOCH).ok())
            .map(|age| (age.as_secs() as i64) < cutoff)
            .unwrap_or(false);
        let orphan = !live.contains(send_id);
        if !aged && !orphan {
            continue;
        }
        if std::fs::remove_file(&path).is_ok() {
            removed += 1;
        }
    }
    Ok(removed)
}

pub fn load_stored_sends_since(
    conn: &Connection,
    since_unix: i64,
) -> Result<Vec<StoredSendAttempt>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT send_id, fingerprint, state, imap_notice, error, at_unix, launch_id
             FROM send_attempts WHERE at_unix >= ?1",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params![since_unix], |row| {
            Ok(StoredSendAttempt {
                send_id: row.get(0)?,
                fingerprint: row.get(1)?,
                state: row.get(2)?,
                imap_notice: row.get(3)?,
                error: row.get(4)?,
                at_unix: row.get(5)?,
                launch_id: row.get(6)?,
            })
        })
        .map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())
}

pub fn unix_secs(now: SystemTime) -> i64 {
    now.duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn registry_transitions_do_not_resend_a_done_id() {
        let mut book = SendAttemptBook::<&'static str>::default();
        let t0 = SystemTime::UNIX_EPOCH + Duration::from_secs(1_000);
        assert_eq!(book.begin("s1", t0), SendBegin::Start);
        assert_eq!(book.begin("s1", t0), SendBegin::InFlight);
        book.complete_ok("s1", "ok", t0);
        assert_eq!(book.begin("s1", t0), SendBegin::Replay);
        assert_eq!(book.replay("s1"), Some("ok"));
        book.complete_err("s2", "smtp".into(), t0);
        assert_eq!(
            book.begin("s2", t0 + Duration::from_secs(1)),
            SendBegin::Start
        );
        let expired = t0 + SEND_ATTEMPT_TTL + Duration::from_secs(1);
        assert!(book.get("s1", expired).is_none());
        assert_eq!(book.begin("s1", expired), SendBegin::Start);
    }

    #[test]
    fn second_payload_does_not_replay_a_done_id() {
        let mut book = SendAttemptBook::<&'static str>::default();
        let t0 = SystemTime::UNIX_EPOCH + Duration::from_secs(2_000);
        assert_eq!(book.begin_payload("s1", "fp-a", t0), SendBegin::Start);
        book.complete_ok("s1", "old", t0);
        assert_eq!(book.begin_payload("s1", "fp-b", t0), SendBegin::IdReused);
        assert_eq!(book.replay("s1"), Some("old"));
        assert_eq!(book.begin_payload("s2", "fp-b", t0), SendBegin::Start);
    }

    #[test]
    fn different_id_same_fingerprint_does_not_silent_replay() {
        let mut book = SendAttemptBook::<&'static str>::default();
        let t0 = SystemTime::UNIX_EPOCH + Duration::from_secs(4_000);
        assert_eq!(book.begin_payload("id-a", "fp-same", t0), SendBegin::Start);
        assert_eq!(
            book.begin_payload("id-b", "fp-same", t0),
            SendBegin::Start,
            "un autre id ne doit pas hériter d'un envoi encore en vol"
        );
        book.complete_ok("id-a", "sent", t0);
        assert_eq!(
            book.begin_payload("id-c", "fp-same", t0),
            SendBegin::Start,
            "un renvoi volontaire dans l'heure ne doit pas être avalé"
        );
        assert!(book.replay("id-c").is_none());
        assert_eq!(book.replay("id-a"), Some("sent"));
        assert_eq!(book.begin_payload("id-a", "fp-same", t0), SendBegin::Replay);
    }

    #[test]
    fn different_attachments_change_fingerprint_and_both_send() {
        let t0 = SystemTime::UNIX_EPOCH + Duration::from_secs(5_000);
        let with_a = sample_draft("draft-a", &["/tmp/a.pdf"], None, true);
        let with_b = sample_draft("draft-b", &["/tmp/b.pdf"], None, true);
        let fp_a = draft_send_fingerprint("acc", &with_a);
        let fp_b = draft_send_fingerprint("acc", &with_b);
        assert_ne!(
            fp_a, fp_b,
            "a.pdf et b.pdf ne doivent pas entrer en collision"
        );

        let mut other_reply = with_a.clone();
        other_reply.in_reply_to = Some("<msg-1@example>".into());
        assert_ne!(fp_a, draft_send_fingerprint("acc", &other_reply));

        let mut html_off = with_a.clone();
        html_off.send_html = false;
        assert_ne!(fp_a, draft_send_fingerprint("acc", &html_off));

        let mut other_id = with_a.clone();
        other_id.id = rustymail_domain::DraftId("draft-other".into());
        assert_ne!(fp_a, draft_send_fingerprint("acc", &other_id));

        let mut book = SendAttemptBook::<&'static str>::default();
        assert_eq!(book.begin_payload("send-a", &fp_a, t0), SendBegin::Start);
        book.complete_ok("send-a", "sent-a", t0);
        assert_eq!(
            book.begin_payload("send-b", &fp_b, t0),
            SendBegin::Start,
            "le second brouillon doit partir, pas rejouer le premier"
        );
        assert_eq!(
            book.begin_payload("send-a", &fp_b, t0),
            SendBegin::IdReused,
            "le même id ne rejoue pas un autre message"
        );
        assert_eq!(book.replay("send-a"), Some("sent-a"));
    }

    #[test]
    fn prune_drops_rows_older_than_ttl() {
        let dir = tempfile::tempdir().expect("tempdir");
        let conn = crate::open_sqlite_migrated(&dir.path().join("send.db")).expect("db");
        let now = unix_secs(SystemTime::now());
        let old = now - SEND_ATTEMPT_TTL.as_secs() as i64 - 5;
        conn.execute(
            "INSERT INTO send_attempts (send_id, fingerprint, state, imap_notice, error, at_unix)
             VALUES ('old', 'fp', 'done', NULL, NULL, ?1)",
            params![old],
        )
        .expect("old");
        conn.execute(
            "INSERT INTO send_attempts (send_id, fingerprint, state, imap_notice, error, at_unix)
             VALUES ('fresh', 'fp', 'done', NULL, NULL, ?1)",
            params![now],
        )
        .expect("fresh");
        assert_eq!(prune_stored_sends(&conn, now).expect("prune"), 1);
        let left = load_stored_sends_since(&conn, 0).expect("load");
        assert_eq!(left.len(), 1);
        assert_eq!(left[0].send_id, "fresh");

        conn.execute(
            "INSERT INTO send_attempts (send_id, fingerprint, state, imap_notice, error, at_unix)
             VALUES ('older', 'fp', 'done', NULL, NULL, ?1)",
            params![old],
        )
        .expect("older");
        upsert_stored_send(
            &conn,
            &StoredSendAttempt {
                send_id: "newer".into(),
                fingerprint: "fp".into(),
                state: "done".into(),
                imap_notice: None,
                error: None,
                at_unix: unix_secs(SystemTime::now()),
                launch_id: String::new(),
            },
        )
        .expect("upsert");
        let left = load_stored_sends_since(&conn, 0).expect("load after upsert");
        assert!(left.iter().all(|row| row.send_id != "older"));
        assert!(left.iter().any(|row| row.send_id == "newer"));
    }

    #[test]
    fn restart_replays_same_send_id_without_smtp() {
        let dir = tempfile::tempdir().expect("tempdir");
        let path = dir.path().join("send.db");
        let t0 = SystemTime::now();
        {
            let conn = crate::open_sqlite_migrated(&path).expect("db");
            let mut book = SendAttemptBook::<String>::default();
            assert_eq!(
                book.begin_payload("id-old", "fp-same", t0),
                SendBegin::Start
            );
            book.complete_ok("id-old", "notice".into(), t0);
            upsert_stored_send(
                &conn,
                &StoredSendAttempt {
                    send_id: "id-old".into(),
                    fingerprint: "fp-same".into(),
                    state: "done".into(),
                    imap_notice: Some("notice".into()),
                    error: None,
                    at_unix: unix_secs(t0),
                    launch_id: "launch-old".into(),
                },
            )
            .expect("store");
        }
        let conn = crate::open_sqlite_migrated(&path).expect("reopen");
        let rows = load_stored_sends_since(&conn, unix_secs(t0) - 10).expect("load");
        let mut book = SendAttemptBook::<String>::default();
        for row in rows {
            if row.state == "done" {
                book.absorb_absent(
                    &row.send_id,
                    SendSlot::Done {
                        at: t0,
                        value: row.imap_notice.unwrap_or_default(),
                        fingerprint: row.fingerprint,
                    },
                );
            }
        }
        assert_eq!(
            book.begin_payload("id-old", "fp-same", t0),
            SendBegin::Replay
        );
        assert_eq!(book.replay("id-old").as_deref(), Some("notice"));
        assert_eq!(
            book.begin_payload("id-new", "fp-same", t0),
            SendBegin::Start,
            "un nouvel id, même empreinte, part vraiment"
        );
        assert!(book.replay("id-new").is_none());
    }

    #[test]
    fn same_launch_stale_inflight_does_not_start_smtp() {
        let mut book = SendAttemptBook::<&'static str>::default();
        let t0 = SystemTime::UNIX_EPOCH + Duration::from_secs(10_000);
        assert_eq!(
            book.begin_owned("id", "fp", t0, "launch-a"),
            SendBegin::Start
        );
        let later = t0 + Duration::from_secs(262);
        assert!(later.duration_since(t0).unwrap() > SEND_INFLIGHT_STALE);
        assert_eq!(
            book.begin_owned("id", "fp", later, "launch-a"),
            SendBegin::AlreadyInFlight
        );
        match book.get("id", later) {
            Some(SendSlot::InFlight { started, .. }) => assert_eq!(started, t0),
            other => panic!("créneau inattendu: {other:?}"),
        }
    }

    #[test]
    fn previous_launch_stale_inflight_may_be_taken_over() {
        let mut book = SendAttemptBook::<&'static str>::default();
        let t0 = SystemTime::UNIX_EPOCH + Duration::from_secs(20_000);
        assert_eq!(
            book.begin_owned("id", "fp", t0, "launch-a"),
            SendBegin::Start
        );
        assert_eq!(
            book.begin_owned("id", "fp", t0 + Duration::from_secs(60), "launch-b"),
            SendBegin::InFlight,
            "un autre lancement encore frais ne reprend pas l'envoi"
        );
        let later = t0 + SEND_INFLIGHT_STALE + Duration::from_secs(1);
        assert_eq!(
            book.begin_owned("id", "fp", later, "launch-b"),
            SendBegin::Start
        );
        match book.get("id", later) {
            Some(SendSlot::InFlight {
                started, launch_id, ..
            }) => {
                assert_eq!(started, later);
                assert_eq!(launch_id, "launch-b");
            }
            other => panic!("créneau inattendu: {other:?}"),
        }
    }

    #[test]
    fn smtp_accepted_retry_does_not_start_smtp() {
        let mut book = SendAttemptBook::<&'static str>::default();
        let t0 = SystemTime::UNIX_EPOCH + Duration::from_secs(30_000);
        assert_eq!(
            book.begin_owned("id", "fp", t0, "launch-a"),
            SendBegin::Start
        );
        book.mark_smtp_accepted("id", "accepted", t0);
        assert_eq!(
            book.begin_owned("id", "fp", t0 + Duration::from_secs(262), "launch-a"),
            SendBegin::Accepted
        );
        assert_eq!(
            book.begin_owned("id", "fp", t0 + Duration::from_secs(262), "launch-b"),
            SendBegin::Accepted
        );
        assert_eq!(book.replay("id"), Some("accepted"));
        assert_ne!(
            book.begin_owned("id", "fp", t0 + Duration::from_secs(262), "launch-b"),
            SendBegin::Start
        );
    }

    #[test]
    fn smtp_accepted_launch_id_roundtrips() {
        let dir = tempfile::tempdir().expect("tempdir");
        let conn = crate::open_sqlite_migrated(&dir.path().join("send.db")).expect("db");
        let now = unix_secs(SystemTime::now());
        upsert_stored_send(
            &conn,
            &StoredSendAttempt {
                send_id: "id".into(),
                fingerprint: "fp".into(),
                state: "smtp_accepted".into(),
                imap_notice: Some("accepted".into()),
                error: None,
                at_unix: now,
                launch_id: "launch-a".into(),
            },
        )
        .expect("store");
        let rows = load_stored_sends_since(&conn, now - 10).expect("load");
        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0].state, "smtp_accepted");
        assert_eq!(rows[0].launch_id, "launch-a");
        let mut book = SendAttemptBook::<String>::default();
        book.absorb_absent(
            &rows[0].send_id,
            SendSlot::SmtpAccepted {
                at: SystemTime::now(),
                value: rows[0].imap_notice.clone().unwrap_or_default(),
                fingerprint: rows[0].fingerprint.clone(),
                launch_id: rows[0].launch_id.clone(),
            },
        );
        assert_eq!(
            book.begin_owned("id", "fp", SystemTime::now(), "launch-b"),
            SendBegin::Accepted
        );
    }

    #[test]
    fn prune_deletes_old_and_orphan_spool_files() {
        let dir = tempfile::tempdir().expect("tempdir");
        let db_path = dir.path().join("mail.db");
        let conn = crate::open_sqlite_migrated(&db_path).expect("db");
        let now = unix_secs(SystemTime::now());
        let keep = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
        let old = "11111111-2222-4333-8444-555555555555";
        let orphan = "99999999-8888-4777-8666-555555555555";
        let aged_kept_row = "22222222-3333-4444-8555-666666666666";
        for id in [keep, old, aged_kept_row] {
            let at = if id == old {
                now - SEND_ATTEMPT_TTL.as_secs() as i64 - 30
            } else {
                now
            };
            conn.execute(
                "INSERT INTO send_attempts (send_id, fingerprint, state, imap_notice, error, at_unix, launch_id)
                 VALUES (?1, 'fp', 'smtp_accepted', NULL, NULL, ?2, 'launch')",
                params![id, at],
            )
            .expect("row");
        }
        let spool = dir.path().join("send-spool");
        std::fs::create_dir(&spool).expect("spool");
        let write = |id: &str, aged: bool| {
            for suffix in [".rfc822", ".mid"] {
                let path = spool.join(format!("{id}{suffix}"));
                std::fs::write(&path, b"secret").expect("write");
                if aged {
                    let file = std::fs::File::options()
                        .write(true)
                        .open(&path)
                        .expect("open");
                    let stamp = SystemTime::now() - SEND_ATTEMPT_TTL - Duration::from_secs(120);
                    file.set_modified(stamp).expect("mtime");
                }
            }
        };
        write(keep, false);
        write(old, true);
        write(orphan, false);
        write(aged_kept_row, true);
        std::fs::write(spool.join("notes.txt"), b"leave").expect("notes");

        let removed_rows = prune_stored_sends(&conn, now).expect("prune");
        assert_eq!(removed_rows, 1);
        assert!(spool.join(format!("{keep}.rfc822")).is_file());
        assert!(spool.join(format!("{keep}.mid")).is_file());
        assert!(!spool.join(format!("{old}.rfc822")).exists());
        assert!(!spool.join(format!("{old}.mid")).exists());
        assert!(!spool.join(format!("{orphan}.rfc822")).exists());
        assert!(!spool.join(format!("{orphan}.mid")).exists());
        assert!(
            !spool.join(format!("{aged_kept_row}.rfc822")).exists(),
            "un fichier de plus d'une heure part même si la ligne est encore là"
        );
        assert!(!spool.join(format!("{aged_kept_row}.mid")).exists());
        assert!(spool.join("notes.txt").is_file());
        let left: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM send_attempts WHERE send_id = ?1",
                params![aged_kept_row],
                |row| row.get(0),
            )
            .expect("count");
        assert_eq!(left, 1);
    }

    fn sample_draft(
        id: &str,
        attachments: &[&str],
        in_reply_to: Option<&str>,
        send_html: bool,
    ) -> rustymail_domain::Draft {
        rustymail_domain::Draft {
            id: rustymail_domain::DraftId(id.into()),
            kind: rustymail_domain::DraftKind::New,
            to: vec![rustymail_domain::EmailAddress {
                name: None,
                email: "bob@example.com".into(),
            }],
            cc: Vec::new(),
            bcc: Vec::new(),
            subject: "Hello".into(),
            markdown_body: "Same text".into(),
            send_html,
            in_reply_to: in_reply_to.map(str::to_string),
            references: Vec::new(),
            attachment_paths: attachments.iter().map(|path| (*path).to_string()).collect(),
            thread_id: None,
        }
    }
}
