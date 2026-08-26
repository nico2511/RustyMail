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

    /// Chemin hiérarchique (`parent/child/…`) stocké dans `value`.
    pub fn hierarchy_segments(&self) -> Vec<&str> {
        self.value
            .split('/')
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .collect()
    }

    /// Parent hiérarchique (`facture/gas` → `facture`), ou None si feuille plate.
    pub fn hierarchy_parent(&self) -> Option<&str> {
        let segs = self.hierarchy_segments();
        if segs.len() < 2 {
            return None;
        }
        // value avant le dernier segment
        let last = segs.last()?;
        let cut = self.value.trim_end_matches(last).trim_end_matches('/');
        if cut.is_empty() {
            None
        } else {
            Some(cut)
        }
    }

    /// Construit un tag hiérarchique `family:parent/child`.
    pub fn hierarchical(family: TagFamily, path: impl AsRef<str>) -> Self {
        let value = path
            .as_ref()
            .split('/')
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .collect::<Vec<_>>()
            .join("/");
        Self { family, value }
    }
}
