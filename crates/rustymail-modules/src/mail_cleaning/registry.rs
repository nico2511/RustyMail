use super::providers::amazon::{AmazonCleaner, AmazonDetector};
use super::providers::deblock::{DeblockCleaner, DeblockDetector};
use super::providers::github::{GitHubCleaner, GitHubDetector};
use super::traits::{ProviderCleaner, ProviderDetector};
use super::types::{CleaningInput, DetectionConfidence, ProviderId};

pub struct RegisteredProvider {
    pub id: ProviderId,
    pub detector: Box<dyn ProviderDetector>,
    pub cleaner: Option<Box<dyn ProviderCleaner>>,
}

pub struct ProviderRegistry {
    providers: Vec<RegisteredProvider>,
}

impl ProviderRegistry {
    pub fn new(providers: Vec<RegisteredProvider>) -> Self {
        Self { providers }
    }

    pub fn builtin() -> Self {
        Self::new(vec![
            RegisteredProvider {
                id: ProviderId::Amazon,
                detector: Box::new(AmazonDetector),
                cleaner: Some(Box::new(AmazonCleaner)),
            },
            RegisteredProvider {
                id: ProviderId::Deblock,
                detector: Box::new(DeblockDetector),
                cleaner: Some(Box::new(DeblockCleaner)),
            },
            RegisteredProvider {
                id: ProviderId::GitHub,
                detector: Box::new(GitHubDetector),
                cleaner: Some(Box::new(GitHubCleaner)),
            },
        ])
    }

    pub fn resolve_provider(&self, ctx: &CleaningInput<'_>) -> ProviderId {
        for p in &self.providers {
            if matches!(p.detector.detect(ctx), DetectionConfidence::Strong) {
                return p.id;
            }
        }
        for p in &self.providers {
            if matches!(p.detector.detect(ctx), DetectionConfidence::Weak) {
                return p.id;
            }
        }
        ProviderId::Generic
    }

    pub fn cleaner_for(&self, id: ProviderId) -> Option<&dyn ProviderCleaner> {
        if id == ProviderId::Generic {
            return None;
        }
        for p in &self.providers {
            if p.id != id {
                continue;
            }
            if let Some(ref c) = p.cleaner {
                return Some(c.as_ref());
            }
        }
        None
    }
}
