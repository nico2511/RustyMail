//! Découpage logique des pièces jointes pour envois SMTP en plusieurs messages chaînés.

use serde::{Deserialize, Serialize};
use std::path::Path;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SplitChunk {
    pub paths: Vec<String>,
    pub total_bytes: u64,
    pub oversized: bool,
    /// Basename pour l’UI (avertissement « fichier trop gros »).
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub display_names: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SplitPlan {
    pub chunks: Vec<SplitChunk>,
    /// Budget brut (octets fichiers) par lot avant encodage MIME.
    pub budget_bytes: u64,
    /// Cible indicative taille message encodé (ex. 25 Mo) — pour affichage UI.
    pub server_target_bytes: u64,
    pub encoded_overhead: f32,
    pub has_oversized: bool,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum SplitError {
    Empty,
}

/// First-fit decreasing : gros fichiers d’abord, puis remplissage des lots.
/// Un fichier > `budget_bytes` occupe seul un chunk avec `oversized = true`.
pub fn plan_split(
    attachments: &[(String, u64)],
    budget_bytes: u64,
) -> Result<SplitPlan, SplitError> {
    if attachments.is_empty() {
        return Err(SplitError::Empty);
    }
    if budget_bytes == 0 {
        return Err(SplitError::Empty);
    }

    let mut items: Vec<(String, u64)> = attachments.to_vec();
    items.sort_by(|a, b| b.1.cmp(&a.1));

    let server_target = (budget_bytes as f64 * 1.4_f64).round() as u64;
    let mut chunks: Vec<SplitChunk> = Vec::new();
    let mut has_oversized = false;

    for (path, size) in items {
        let display_name = Path::new(&path)
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("fichier")
            .to_string();

        if size > budget_bytes {
            has_oversized = true;
            chunks.push(SplitChunk {
                paths: vec![path],
                total_bytes: size,
                oversized: true,
                display_names: vec![display_name],
            });
            continue;
        }

        let mut placed = false;
        for ch in chunks.iter_mut() {
            if ch.oversized {
                continue;
            }
            if ch.total_bytes.saturating_add(size) <= budget_bytes {
                ch.paths.push(path.clone());
                ch.total_bytes += size;
                ch.display_names.push(display_name.clone());
                placed = true;
                break;
            }
        }
        if !placed {
            chunks.push(SplitChunk {
                paths: vec![path],
                total_bytes: size,
                oversized: false,
                display_names: vec![display_name],
            });
        }
    }

    Ok(SplitPlan {
        has_oversized,
        chunks,
        budget_bytes,
        server_target_bytes: server_target,
        encoded_overhead: 1.4,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn p(name: &str, bytes: u64) -> (String, u64) {
        (format!("/tmp/{name}"), bytes)
    }

    #[test]
    fn empty_errors() {
        assert!(matches!(plan_split(&[], 18), Err(SplitError::Empty)));
    }

    #[test]
    fn one_small_file_one_chunk() {
        let plan = plan_split(&[p("a.txt", 100)], 18 * 1024 * 1024).unwrap();
        assert_eq!(plan.chunks.len(), 1);
        assert!(!plan.chunks[0].oversized);
        assert!(!plan.has_oversized);
    }

    #[test]
    fn many_small_fit_one_chunk() {
        let att = vec![p("a", 100), p("b", 200), p("c", 50)];
        let plan = plan_split(&att, 18 * 1024 * 1024).unwrap();
        assert_eq!(plan.chunks.len(), 1);
    }

    #[test]
    fn splits_by_budget() {
        let budget = 10u64;
        let att = vec![p("a", 6), p("b", 6), p("c", 6)];
        let plan = plan_split(&att, budget).unwrap();
        assert!(plan.chunks.len() >= 2);
        let total: u64 = plan.chunks.iter().map(|c| c.total_bytes).sum();
        assert_eq!(total, 18);
        for ch in &plan.chunks {
            if !ch.oversized {
                assert!(ch.total_bytes <= budget);
            }
        }
    }

    #[test]
    fn oversized_solo_chunk() {
        let budget = 10u64;
        let att = vec![p("huge", 50)];
        let plan = plan_split(&att, budget).unwrap();
        assert_eq!(plan.chunks.len(), 1);
        assert!(plan.chunks[0].oversized);
        assert!(plan.has_oversized);
    }

    #[test]
    fn mix_oversized_and_small() {
        let budget = 10u64;
        let att = vec![p("small1", 3), p("small2", 3), p("huge", 50)];
        let plan = plan_split(&att, budget).unwrap();
        let huge_chunk = plan.chunks.iter().find(|c| c.oversized).unwrap();
        assert_eq!(huge_chunk.paths.len(), 1);
        let small_total: u64 = plan
            .chunks
            .iter()
            .filter(|c| !c.oversized)
            .map(|c| c.total_bytes)
            .sum();
        assert_eq!(small_total, 6);
    }
}
