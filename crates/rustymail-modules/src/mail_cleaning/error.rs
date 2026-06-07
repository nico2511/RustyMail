use thiserror::Error;

#[derive(Debug, Error)]
pub enum CleanError {
    #[error("html parse produced empty document")]
    EmptyTree,
    #[error("structured digest not applicable for this HTML")]
    NoDigest,
}
