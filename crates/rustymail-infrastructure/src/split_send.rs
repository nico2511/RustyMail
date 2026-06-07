//! Stat des PJ + exécution d’envois découpés (SMTP + IMAP + SQLite).

use rustymail_domain::{plan_split, Draft, DraftId, DraftKind, SplitPlan};
use tokio::fs;

use crate::{
    imap_append_sent_copy, send_draft_via_smtp, sqlite_record_sent_message_copy,
    sqlite_record_sent_starting_thread, DraftSendOutcome,
};

/// Budget brut par défaut (~18 Mo fichiers → ~25 Mo MIME avec base64 + marge).
pub const DEFAULT_ATTACHMENT_BUDGET_BYTES: u64 = 18 * 1024 * 1024;

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SplitSendResult {
    pub message_ids: Vec<String>,
    pub imap_notices: Vec<Option<String>>,
    /// Indice 1-based du lot qui a échoué, si échec partiel ou total.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub failed_chunk_index: Option<usize>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error_message: Option<String>,
}

pub async fn stat_attachments(paths: &[String]) -> Result<Vec<(String, u64)>, String> {
    let mut out = Vec::new();
    for raw in paths {
        let trimmed = raw.trim();
        if trimmed.is_empty() {
            continue;
        }
        let meta = fs::metadata(trimmed)
            .await
            .map_err(|e| format!("pièce jointe introuvable ou illisible ({}): {e}", trimmed))?;
        if !meta.is_file() {
            return Err(format!("pièce jointe n’est pas un fichier: {trimmed}"));
        }
        out.push((trimmed.to_string(), meta.len()));
    }
    if out.is_empty() {
        return Err("aucune pièce jointe valide".to_string());
    }
    Ok(out)
}

pub async fn plan_split_draft_attachments(
    attachment_paths: &[String],
    budget_bytes: u64,
) -> Result<SplitPlan, String> {
    let sized = stat_attachments(attachment_paths).await?;
    plan_split(&sized, budget_bytes).map_err(|_| "aucune pièce jointe à découper".to_string())
}

fn reply_subject_for_chunk(original: &str) -> String {
    let t = original.trim();
    if t.is_empty() {
        return String::new();
    }
    let lower = t.to_ascii_lowercase();
    if lower.starts_with("re:") {
        t.to_string()
    } else {
        format!("Re: {t}")
    }
}

fn merge_references(base: &[String], chain: &[String]) -> Vec<String> {
    let mut v: Vec<String> = base
        .iter()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .collect();
    for mid in chain {
        let m = mid.trim();
        if m.is_empty() {
            continue;
        }
        if v.iter().any(|existing| existing.eq_ignore_ascii_case(m)) {
            continue;
        }
        v.push(m.to_string());
    }
    v
}

/// Envoie chaque lot successivement, en chaînant `In-Reply-To` / `References`.
/// Recalcule le plan à partir de `base.attachment_paths` (ne pas faire confiance à un plan client).
pub async fn execute_split_send(
    db_path: &std::path::Path,
    account: &rustymail_domain::Account,
    base: &Draft,
    budget_bytes: u64,
) -> SplitSendResult {
    let plan = match plan_split_draft_attachments(&base.attachment_paths, budget_bytes).await {
        Ok(p) => p,
        Err(e) => {
            return SplitSendResult {
                message_ids: Vec::new(),
                imap_notices: Vec::new(),
                failed_chunk_index: Some(1),
                error_message: Some(e),
            };
        }
    };

    let n = plan.chunks.len();
    if n == 0 {
        return SplitSendResult {
            message_ids: Vec::new(),
            imap_notices: Vec::new(),
            failed_chunk_index: Some(1),
            error_message: Some("plan de découpage vide".to_string()),
        };
    }

    let mut sent_ids: Vec<String> = Vec::new();
    let mut imap_notices: Vec<Option<String>> = Vec::new();
    let mut effective_thread_id = base.thread_id.clone().filter(|s| !s.trim().is_empty());

    for (idx, chunk) in plan.chunks.iter().enumerate() {
        let part = idx + 1;
        let body = if idx == 0 {
            format!("**Mail {part}/{n}**\n\n{}", base.markdown_body.trim_end())
        } else {
            format!("**Mail {part}/{n}**")
        };

        let (in_reply_to, references, subject) = if idx == 0 {
            (
                base.in_reply_to.clone(),
                base.references.clone(),
                base.subject.clone(),
            )
        } else {
            let prev = sent_ids.last().cloned().unwrap_or_default();
            (
                Some(prev.clone()),
                merge_references(&base.references, &sent_ids),
                reply_subject_for_chunk(&base.subject),
            )
        };

        let chunk_draft = Draft {
            id: DraftId(format!(
                "split-{}-{}",
                base.id.0,
                uuid::Uuid::new_v4().simple()
            )),
            kind: if idx == 0 {
                base.kind.clone()
            } else {
                DraftKind::Reply
            },
            to: base.to.clone(),
            cc: base.cc.clone(),
            bcc: base.bcc.clone(),
            subject,
            markdown_body: body,
            send_html: base.send_html,
            in_reply_to,
            references,
            attachment_paths: chunk.paths.clone(),
            thread_id: effective_thread_id.clone(),
        };

        let sent: Result<DraftSendOutcome, String> =
            send_draft_via_smtp(account, &chunk_draft).await;
        let sent = match sent {
            Ok(s) => s,
            Err(e) => {
                return SplitSendResult {
                    message_ids: sent_ids,
                    imap_notices,
                    failed_chunk_index: Some(part),
                    error_message: Some(e),
                };
            }
        };

        let mid = sent.message_id.clone();
        let imap_copy = imap_append_sent_copy(account, &sent.rfc822, sent.message_id.trim()).await;
        imap_notices.push(imap_notice_from_outcome(&imap_copy));

        if let Some(ref tid) = effective_thread_id {
            if let Err(e) = sqlite_record_sent_message_copy(
                db_path,
                &account.id.0,
                tid,
                &chunk_draft,
                mid.trim(),
                account.display_name.trim(),
                account.email.trim(),
            ) {
                eprintln!("[RustyMail] split send: warn sqlite copy: {e}");
            }
        } else if matches!(base.kind, DraftKind::New) {
            match sqlite_record_sent_starting_thread(
                db_path,
                &account.id.0,
                &chunk_draft,
                mid.trim(),
                account.display_name.trim(),
                account.email.trim(),
            ) {
                Ok(tid) if !tid.trim().is_empty() => {
                    effective_thread_id = Some(tid);
                }
                Ok(_) => {}
                Err(e) => eprintln!("[RustyMail] split send: warn sqlite new thread: {e}"),
            }
        }

        sent_ids.push(mid);
    }

    SplitSendResult {
        message_ids: sent_ids,
        imap_notices,
        failed_chunk_index: None,
        error_message: None,
    }
}

fn imap_notice_from_outcome(out: &crate::ImapSentCopyOutcome) -> Option<String> {
    let mut parts = Vec::new();
    if let Some(ref e) = out.append_failed {
        parts.push(format!(
            "La copie dans le dossier « Envoyés » sur le serveur (IMAP) n’a pas pu être enregistrée. {}",
            clip_detail(e, 140)
        ));
    }
    if let Some(ref e) = out.dedupe_failed {
        parts.push(format!(
            "Impossible de fusionner des doubles dans « Envoyés ». {}",
            clip_detail(e, 120)
        ));
    }
    if parts.is_empty() {
        None
    } else {
        Some(parts.join(" "))
    }
}

fn clip_detail(detail: &str, max_chars: usize) -> String {
    let t = detail.trim();
    if t.chars().count() <= max_chars {
        t.to_string()
    } else {
        format!("{}…", t.chars().take(max_chars).collect::<String>())
    }
}
