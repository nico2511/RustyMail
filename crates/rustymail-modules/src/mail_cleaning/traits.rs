use super::error::CleanError;
use super::types::{CleaningInput, DetectionConfidence, ProviderId};

pub trait ProviderDetector: Send + Sync {
    fn detect(&self, ctx: &CleaningInput<'_>) -> DetectionConfidence;
}

pub trait ProviderCleaner: Send + Sync {
    fn provider_id(&self) -> ProviderId;

    fn rule_set_version(&self) -> &'static str;

    fn clean(&self, html: &str, ctx: &CleaningInput<'_>) -> Result<String, CleanError>;
}
