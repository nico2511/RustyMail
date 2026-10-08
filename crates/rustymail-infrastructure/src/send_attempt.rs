//! Registre d'idempotence des envois (mémoire processus, TTL 1 h).

use std::collections::HashMap;
use std::time::{Duration, SystemTime};

pub const SEND_ATTEMPT_TTL: Duration = Duration::from_secs(60 * 60);

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum SendSlot<T> {
    InFlight { started: SystemTime },
    Done { at: SystemTime, value: T },
    Failed { at: SystemTime, error: String },
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum SendBegin {
    Start,
    InFlight,
    Replay,
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
        self.purge(now);
        match self.slots.get(id) {
            Some(SendSlot::InFlight { .. }) => SendBegin::InFlight,
            Some(SendSlot::Done { .. }) => SendBegin::Replay,
            Some(SendSlot::Failed { .. }) | None => {
                self.slots
                    .insert(id.to_string(), SendSlot::InFlight { started: now });
                SendBegin::Start
            }
        }
    }

    pub fn replay(&self, id: &str) -> Option<T> {
        match self.slots.get(id) {
            Some(SendSlot::Done { value, .. }) => Some(value.clone()),
            _ => None,
        }
    }

    pub fn complete_ok(&mut self, id: &str, value: T, now: SystemTime) {
        self.slots
            .insert(id.to_string(), SendSlot::Done { at: now, value });
    }

    pub fn complete_err(&mut self, id: &str, error: String, now: SystemTime) {
        self.slots
            .insert(id.to_string(), SendSlot::Failed { at: now, error });
    }

    pub fn get(&self, id: &str, now: SystemTime) -> Option<SendSlot<T>> {
        let slot = self.slots.get(id)?.clone();
        let at = match &slot {
            SendSlot::InFlight { started } => *started,
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
                SendSlot::InFlight { started } => *started,
                SendSlot::Done { at, .. } | SendSlot::Failed { at, .. } => *at,
            };
            now.duration_since(at).unwrap_or_default() <= SEND_ATTEMPT_TTL
        });
    }
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
}
