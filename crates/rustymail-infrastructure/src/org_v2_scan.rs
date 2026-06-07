//! Scan Organiser V2 — périmètre réduit, mémoire, pas de doublon recherche.

use std::path::Path;

use rustymail_domain::{OrgProposal, OrgProposalKind, OrgV2ScanReport};

use crate::org_memory::filter_proposals_with_memory;
use crate::org_scan::org_scan_account;
use crate::open_sqlite_migrated;

/// Types de cartes autorisés en V2 (productivité boîte, pas recherche ni tags).
const V2_KINDS: &[OrgProposalKind] = &[
    OrgProposalKind::StaleInboxRead,
    OrgProposalKind::UnsubscribeNewsletter,
    OrgProposalKind::EmptyMailbox,
    OrgProposalKind::FlatMailboxTree,
];

const V2_FOCUS_NOTE: &str = "Structure de la boîte, inbox ancienne à archiver, newsletters désinscriptibles, dossiers vides. \
Les regroupements par expéditeur ou mots-clés relèvent de la recherche. Les tags se mettent à jour au déplacement IMAP.";

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
    let (proposals, memory) =
        filter_proposals_with_memory(&conn, account_id, narrowed)?;
    Ok(OrgV2ScanReport {
        proposals,
        stats: base.stats,
        mailbox_structure: base.mailbox_structure,
        memory,
        focus_note: V2_FOCUS_NOTE.into(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn v2_excludes_keyword_and_tag_kinds() {
        assert!(!kind_allowed(OrgProposalKind::CustomKeywordCluster));
        assert!(!kind_allowed(OrgProposalKind::StaleTags));
        assert!(kind_allowed(OrgProposalKind::StaleInboxRead));
    }
}
