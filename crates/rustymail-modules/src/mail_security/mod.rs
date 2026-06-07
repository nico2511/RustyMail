//! Heuristiques locales d’aide à la vigilance (messagerie). Aucun jugement définitif sur la fraude.

mod analyze;
pub mod gbnf;
pub mod llm_intent;

pub use analyze::{
    analyze_mail_security, finalize_security_signals, is_hard_security_finding,
    merge_heuristic_and_llm_findings,
};

#[cfg(test)]
mod tests;
