//! Registre d'idempotence des envois.
//!
//! Mémoire processus + lignes `send_attempts` (TTL 1 h). Un `Done` de même empreinte
//! (compte, destinataires, objet, corps) est rejoué sans SMTP, y compris après redémarrage.
//! Un même `send_id` avec une autre empreinte n'est ni rejoué ni renvoyé.
//!
//! Risque restant : plantage après acceptation SMTP mais avant l'enregistrement `done`
//! (ou un `inflight` de plus de 3 minutes) — un nouvel essai de la même empreinte peut
//! renvoyer. Un renvoi volontaire du même texte dans l'heure est rejoué, pas renvoyé.

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
    pub fn begin_payload(&mut self, id: &str, fingerprint: &str, now: SystemTime) -> SendBegin {
        self.purge(now);
        if !fingerprint.is_empty() {
            if let Some(slot) = self.preferred_slot_for_fingerprint(fingerprint, now) {
                match slot {
                    SendSlot::Done { .. } => {
                        let copy = slot.clone();
                        self.slots.insert(id.to_string(), copy);
                        return SendBegin::Replay;
                    }
                    SendSlot::InFlight { started, .. } => {
                        if now.duration_since(started).unwrap_or_default() <= SEND_INFLIGHT_STALE {
                            return SendBegin::InFlight;
                        }
                    }
                    SendSlot::Failed { .. } => {}
                }
            }
        }
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

    /// `Done` gagne sur un `inflight`. Un `inflight` encore frais gagne sur un `inflight` périmé.
    fn preferred_slot_for_fingerprint(
        &self,
        fingerprint: &str,
        now: SystemTime,
    ) -> Option<SendSlot<T>> {
        let mut fresh_inflight = None;
        let mut stale_inflight = None;
        for slot in self.slots.values() {
            if slot_fingerprint(slot) != fingerprint {
                continue;
            }
            match slot {
                SendSlot::Done { .. } => return Some(slot.clone()),
                SendSlot::InFlight { started, .. } => {
                    let age = now.duration_since(*started).unwrap_or_default();
                    if age <= SEND_INFLIGHT_STALE {
                        fresh_inflight = Some(slot.clone());
                    } else if stale_inflight.is_none() {
                        stale_inflight = Some(slot.clone());
                    }
                }
                SendSlot::Failed { .. } => {}
            }
        }
        fresh_inflight.or(stale_inflight)
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
    let mut hasher = Sha256::new();
    hasher.update(account_id.trim().to_ascii_lowercase().as_bytes());
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
    Ok(())
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
    fn restart_replays_same_fingerprint_without_smtp() {
        let dir = tempfile::tempdir().expect("tempdir");
        let path = dir.path().join("send.db");
        let t0 = SystemTime::UNIX_EPOCH + Duration::from_secs(3_000);
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
            book.begin_payload("id-new", "fp-same", t0),
            SendBegin::Replay
        );
        assert_eq!(book.replay("id-new").as_deref(), Some("notice"));
    }
}
