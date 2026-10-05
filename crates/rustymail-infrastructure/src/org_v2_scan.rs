//! Scan Organiser V2 — périmètre réduit, mémoire, pas de doublon recherche.

use std::path::Path;

use rustymail_domain::{
    OrgOrientation, OrgProposal, OrgProposalKind, OrgProposalSource, OrgScanLlmStatus,
    OrgV2ScanReport,
};

use crate::open_sqlite_migrated;
use crate::org_memory::filter_proposals_with_memory;
use crate::org_scan::org_scan_account;

/// Types de cartes autorisés en Organize v3 (surface unique, mémoire V2).
const V2_KINDS: &[OrgProposalKind] = &[
    OrgProposalKind::StaleInboxRead,
    OrgProposalKind::UnsubscribeNewsletter,
    OrgProposalKind::TransactionalNotification,
    OrgProposalKind::DuplicateThreadCrossMailbox,
    OrgProposalKind::CustomKeywordCluster,
    OrgProposalKind::EmptyMailbox,
    OrgProposalKind::FlatMailboxTree,
    OrgProposalKind::LlmCluster,
];

const V2_FOCUS_NOTE: &str = "L’écran affiche l’orientation du LLM : diagnostic, recommandations, actions proposées. \
    Les heuristiques préparent seulement le contexte. Sans modèle joignable, aucune orientation n’est inventée. \
    La normalisation des tags reste dans Organiser (v1).";

const HEURISTIC_FALLBACK_NOTE: &str =
    "L’orientation n’a proposé aucune action exploitable : suggestions heuristiques affichées à la place.";

/// Carte heuristique à afficher quand le LLM ne fournit aucune action : non vide et soit
/// applicable, soit informative (arbre de dossiers plat).
fn heuristic_card_useful(p: &OrgProposal) -> bool {
    p.source != OrgProposalSource::Llm
        && p.total_count > 0
        && (p.applicable || p.kind == OrgProposalKind::FlatMailboxTree)
}

fn kind_allowed(kind: OrgProposalKind) -> bool {
    V2_KINDS.contains(&kind)
}

fn filter_v2_kinds(proposals: Vec<OrgProposal>) -> Vec<OrgProposal> {
    proposals
        .into_iter()
        .filter(|p| kind_allowed(p.kind))
        .collect()
}

pub fn org_v2_scan_account(path: &Path, account_id: &str) -> Result<OrgV2ScanReport, String> {
    let base = org_scan_account(path, account_id, false)?;
    let narrowed = filter_v2_kinds(base.proposals);
    let conn = open_sqlite_migrated(path).map_err(|e| e.to_string())?;
    let (proposals, memory) = filter_proposals_with_memory(&conn, account_id, narrowed)?;
    Ok(OrgV2ScanReport {
        proposals,
        stats: base.stats,
        mailbox_structure: base.mailbox_structure,
        memory,
        focus_note: V2_FOCUS_NOTE.into(),
        orientation: None,
        llm_status: OrgScanLlmStatus::default(),
    })
}

/// Remplace les cartes heuristiques par l’orientation LLM.
/// Sans orientation validée, la file affichée est vide (pas de diagnostic inventé).
pub fn org_v2_with_llm_outcome(
    path: &Path,
    account_id: &str,
    mut report: OrgV2ScanReport,
    orientation: Option<OrgOrientation>,
    actions: Vec<OrgProposal>,
    mut llm_status: OrgScanLlmStatus,
) -> Result<OrgV2ScanReport, String> {
    if orientation.is_some() {
        let conn = open_sqlite_migrated(path).map_err(|e| e.to_string())?;
        let (proposals, memory) = filter_proposals_with_memory(&conn, account_id, actions)?;
        if proposals.is_empty() {
            // Orientation valide mais sans action exploitable : on garde les cartes heuristiques
            // utiles (déjà filtrées par la mémoire dans `org_v2_scan_account`) plutôt qu'un écran vide.
            let fallback: Vec<OrgProposal> = std::mem::take(&mut report.proposals)
                .into_iter()
                .filter(heuristic_card_useful)
                .collect();
            if !fallback.is_empty() {
                llm_status.message = Some(HEURISTIC_FALLBACK_NOTE.into());
            }
            report.proposals = fallback;
        } else {
            report.proposals = proposals;
            report.memory = memory;
        }
    } else {
        report.proposals.clear();
    }
    report.orientation = orientation;
    report.llm_status = llm_status;
    report.focus_note = V2_FOCUS_NOTE.into();
    Ok(report)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn v2_includes_core_organize_kinds() {
        assert!(kind_allowed(OrgProposalKind::CustomKeywordCluster));
        assert!(kind_allowed(OrgProposalKind::DuplicateThreadCrossMailbox));
        assert!(kind_allowed(OrgProposalKind::TransactionalNotification));
        assert!(!kind_allowed(OrgProposalKind::StaleTags));
        assert!(kind_allowed(OrgProposalKind::StaleInboxRead));
    }

    #[test]
    fn v2_focus_note_requires_llm_orientation() {
        assert!(V2_FOCUS_NOTE.contains("orientation"));
        assert!(V2_FOCUS_NOTE.contains("inventée"));
    }
}
