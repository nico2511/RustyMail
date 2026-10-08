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
//! Risque restant : plantage après acceptation SMTP mais avant l'enregistrement `done`
//! (ou un `inflight` de plus de 3 minutes) — un nouvel essai du même `send_id` peut renvoyer.

use std::collections::HashMap;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use rusqlite::{params, Connection};
use sha2::{Digest, Sha256};

pub const SEND_ATTEMPT_TTL: Duration = Duration::from_secs(60 * 60);
/// Au-delà, un `inflight` vient d'un processus mort : on autorise un nouvel essai.
pub const SEND_INFLIGHT_STALE: Duration = Duration::from_secs(3 * 60);

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum SendSlot<T> {
    InFlight {
        started: SystemTime,
        fingerprint: String,
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
    Replay,
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
        self.purge(now);
        let stale_same = matches!(
            self.slots.get(id),
            Some(SendSlot::InFlight { started, fingerprint: fp, .. })
                if fp == fingerprint && now.duration_since(*started).unwrap_or_default() > SEND_INFLIGHT_STALE
        );
        if stale_same {
            self.slots.insert(
                id.to_string(),
                SendSlot::InFlight {
                    started: now,
                    fingerprint: fingerprint.to_string(),
                },
            );
            return SendBegin::Start;
        }
        match self.slots.get(id) {
            Some(SendSlot::InFlight {
                fingerprint: fp, ..
            }) if fp == fingerprint => SendBegin::InFlight,
            Some(SendSlot::InFlight { .. }) => SendBegin::IdReused,
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
            Some(SendSlot::Done { value, .. }) => Some(value.clone()),
            _ => None,
        }
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
            SendSlot::Done { at, .. } | SendSlot::Failed { at, .. } => *at,
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
                SendSlot::Done { at, .. } | SendSlot::Failed { at, .. } => *at,
            };
            now.duration_since(at).unwrap_or_default() <= SEND_ATTEMPT_TTL
        });
    }
}

fn slot_fingerprint<T>(slot: &SendSlot<T>) -> &str {
    match slot {
        SendSlot::InFlight { fingerprint, .. }
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
        "INSERT INTO send_attempts (send_id, fingerprint, state, imap_notice, error, at_unix)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)
         ON CONFLICT(send_id) DO UPDATE SET
            fingerprint = excluded.fingerprint,
            state = excluded.state,
            imap_notice = excluded.imap_notice,
            error = excluded.error,
            at_unix = excluded.at_unix",
        params![
            row.send_id,
            row.fingerprint,
            row.state,
            row.imap_notice,
            row.error,
            row.at_unix
        ],
    )
    .map_err(|e| e.to_string())?;
    prune_stored_sends(conn, unix_secs(SystemTime::now()))?;
    Ok(())
}

/// Supprime les tentatives plus vieilles que le TTL pour que la table ne grossisse pas sans fin.
pub fn prune_stored_sends(conn: &Connection, now_unix: i64) -> Result<usize, String> {
    let cutoff = now_unix.saturating_sub(SEND_ATTEMPT_TTL.as_secs() as i64);
    conn.execute(
        "DELETE FROM send_attempts WHERE at_unix < ?1",
        params![cutoff],
    )
    .map_err(|e| e.to_string())
}

pub fn load_stored_sends_since(
    conn: &Connection,
    since_unix: i64,
) -> Result<Vec<StoredSendAttempt>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT send_id, fingerprint, state, imap_notice, error, at_unix
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
