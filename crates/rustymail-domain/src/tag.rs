use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub enum TagFamily {
    /// JSON Tauri → front : `Entity`. JSON LLM (recherche NL) : souvent `entity` en minuscules.
    #[serde(alias = "source", alias = "SOURCE")]
    Source,
    #[serde(alias = "kind", alias = "KIND")]
    Kind,
    #[serde(alias = "entity", alias = "ENTITY")]
    Entity,
    #[serde(alias = "state", alias = "STATE")]
    State,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct Tag {
    pub family: TagFamily,
    pub value: String,
}

impl Tag {
    pub fn source(value: impl Into<String>) -> Self {
        Self {
            family: TagFamily::Source,
            value: value.into(),
        }
    }

    pub fn kind(value: impl Into<String>) -> Self {
        Self {
            family: TagFamily::Kind,
            value: value.into(),
        }
    }

    pub fn entity(value: impl Into<String>) -> Self {
        Self {
            family: TagFamily::Entity,
            value: value.into(),
        }
    }

    pub fn state(value: impl Into<String>) -> Self {
        Self {
            family: TagFamily::State,
            value: value.into(),
        }
    }

    pub fn as_filter(&self) -> String {
        let prefix = match self.family {
            TagFamily::Source => "source",
            TagFamily::Kind => "kind",
            TagFamily::Entity => "entity",
            TagFamily::State => "state",
        };
        format!("{prefix}:{}", self.value)
    }
}
