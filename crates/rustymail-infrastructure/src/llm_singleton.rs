//! État LLM processus (profil hardware rafraîchi à la demande).

use rustymail_llm::hardware::{detect_profile, HardwareModelProfile};
use std::sync::{Mutex, OnceLock};

pub struct LlmSingletonState {
    pub profile: HardwareModelProfile,
}

impl LlmSingletonState {
    pub fn refresh(&mut self) {
        self.profile = detect_profile();
    }
}

pub fn llm_singleton() -> &'static Mutex<LlmSingletonState> {
    static S: OnceLock<Mutex<LlmSingletonState>> = OnceLock::new();
    S.get_or_init(|| {
        Mutex::new(LlmSingletonState {
            profile: detect_profile(),
        })
    })
}
