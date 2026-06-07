//! Petit rate-limit par clé pour commandes IPC coûteuses (protection simple face à scripts / UI glitch).

use std::collections::HashMap;
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, Instant};

fn gate_lock() -> &'static Mutex<HashMap<String, Instant>> {
    static GATE: OnceLock<Mutex<HashMap<String, Instant>>> = OnceLock::new();
    GATE.get_or_init(|| Mutex::new(HashMap::new()))
}

pub fn cooldown(key: impl Into<String>, min_interval: Duration) -> Result<(), String> {
    let key = key.into();
    let now = Instant::now();
    let mut map = match gate_lock().lock() {
        Ok(g) => g,
        Err(p) => p.into_inner(),
    };
    if let Some(last) = map.get(&key) {
        let elapsed = now.saturating_duration_since(*last);
        if elapsed < min_interval {
            return Err(format!(
                "Merci de patienter {} ms avant de relancer cette opération.",
                (min_interval - elapsed).as_millis()
            ));
        }
    }
    map.insert(key, now);
    Ok(())
}
