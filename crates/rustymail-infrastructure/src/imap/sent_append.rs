//! Copie du message sortant sur le serveur via IMAP `APPEND` (dossier Envoyés).

use std::time::Duration;

use futures::TryStreamExt;
use rustymail_domain::Account;

use super::ops::{
    list_selectable_mailbox_entries, mailbox_select_variant_strings, pick_sent_mailbox_entry,
};
use super::session::{login_session_for_account, map_imap_error, ImapSession};

fn normalize_message_id_for_search(raw: &str) -> String {
    let t = raw.trim().replace(['\r', '\n', '\t'], "");
    if t.is_empty() {
        return String::new();
    }
    if t.starts_with('<') && t.ends_with('>') {
        t
    } else {
        format!("<{}>", t.trim_matches('<').trim_matches('>').trim())
    }
}

fn imap_quoted(mut s: &str) -> String {
    s = s.trim();
    let mut out = String::with_capacity(s.len().saturating_add(2));
    out.push('"');
    for ch in s.chars() {
        if ch == '\\' || ch == '"' {
            out.push('\\');
        }
        out.push(ch);
    }
    out.push('"');
    out
}

/// `UID SEARCH` pour ce Message-ID puis, s’il y a plusieurs UID, conserve le plus petit
/// (`\\Deleted` + `EXPUNGE` sur les autres). Quelques tentatives permettent d’attraper une copie
/// serveur (SMTP→Envoyés) apparue un peu après notre APPEND.
async fn dedupe_sent_mailbox_same_message_id(
    session: &mut ImapSession,
    mailbox: &str,
    message_id_header: &str,
) -> Result<(), String> {
    let mid = normalize_message_id_for_search(message_id_header);
    if mid.is_empty() {
        return Ok(());
    }
    let query = format!("HEADER Message-ID {}", imap_quoted(&mid));

    let mut duplicate_uids: Vec<u32> = Vec::new();
    let mut kept: Option<u32> = None;

    for attempt in 0..3u8 {
        session.select(mailbox).await.map_err(map_imap_error)?;
        let found = session.uid_search(&query).await.map_err(map_imap_error)?;
        let mut uids: Vec<u32> = found.into_iter().collect();
        uids.sort_unstable();
        if uids.len() >= 2 {
            kept = Some(uids[0]);
            duplicate_uids = uids[1..].to_vec();
            break;
        }
        if attempt < 2 {
            tokio::time::sleep(Duration::from_millis(260)).await;
        }
    }

    if duplicate_uids.is_empty() {
        return Ok(());
    }

    let uid_set = duplicate_uids
        .iter()
        .map(|u| u.to_string())
        .collect::<Vec<_>>()
        .join(",");

    let stream = session
        .uid_store(&uid_set, "+FLAGS (\\Deleted)")
        .await
        .map_err(map_imap_error)?;
    let _: Vec<_> = stream.try_collect().await.map_err(map_imap_error)?;

    let exp = session.expunge().await.map_err(map_imap_error)?;
    let _: Vec<_> = exp.try_collect().await.map_err(map_imap_error)?;

    if let Some(k) = kept {
        eprintln!(
            "[RustyMail] IMAP Envoyés: doublons Message-ID → {} UID supprimés, conservé UID {}",
            duplicate_uids.len(),
            k
        );
    }
    Ok(())
}

/// Résultat de la copie IMAP dans « Envoyés » : l’envoi SMTP a déjà réussi quand on appelle ça.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct ImapSentCopyOutcome {
    pub append_failed: Option<String>,
    pub dedupe_failed: Option<String>,
}

/// Après un envoi SMTP réussi, enregistre une copie RFC 822 dans le dossier Envoyés du serveur.
/// Puis recherche plusieurs copies du même `Message-ID` (append client + dépôt automatique serveur),
/// enlève les doublons en gardant **le plus petit UID**.
///
/// Les erreurs sont dans [`ImapSentCopyOutcome`] : l’appelant peut les afficher à titre informatif.
pub async fn imap_append_sent_copy(
    account: &Account,
    rfc822: &[u8],
    message_id_header: &str,
) -> ImapSentCopyOutcome {
    let mut out = ImapSentCopyOutcome::default();
    if rfc822.is_empty() {
        out.append_failed = Some("message RFC 822 vide".to_string());
        return out;
    }
    let mut session = match login_session_for_account(account).await {
        Ok(s) => s,
        Err(e) => {
            out.append_failed = Some(e);
            return out;
        }
    };

    let entries = match list_selectable_mailbox_entries(&mut session).await {
        Ok(e) => e,
        Err(e) => {
            out.append_failed = Some(e);
            let _ = session.logout().await;
            return out;
        }
    };

    let Some(sent_entry) = pick_sent_mailbox_entry(&entries) else {
        out.append_failed = Some("aucun dossier Envoyés trouvé sur le serveur".to_string());
        let _ = session.logout().await;
        return out;
    };
    let variants = mailbox_select_variant_strings(
        &sent_entry.raw_list_name,
        &sent_entry.decoded_name,
        Some(&sent_entry.decoded_name),
    );
    let mut last = String::new();
    let mut appended_mailbox: Option<String> = None;
    for wire in variants {
        let t = wire.trim();
        if t.is_empty() {
            continue;
        }
        match session.append(t, Some(r"(\Seen)"), None, rfc822).await {
            Ok(()) => {
                eprintln!("[RustyMail] IMAP APPEND Envoyés OK → {t}");
                appended_mailbox = Some(t.to_string());
                break;
            }
            Err(e) => {
                last = map_imap_error(e);
                eprintln!("[RustyMail] IMAP APPEND tentative échouée ({t}): {last}");
            }
        }
    }
    let Some(mailbox) = appended_mailbox else {
        out.append_failed = Some(if last.is_empty() {
            "APPEND vers Envoyés impossible".to_string()
        } else {
            last
        });
        let _ = session.logout().await;
        return out;
    };

    if let Err(e) =
        dedupe_sent_mailbox_same_message_id(&mut session, &mailbox, message_id_header).await
    {
        eprintln!("[RustyMail] avertissement: dédoublonnage Envoyés (Message-ID) ignoré: {e}");
        out.dedupe_failed = Some(e);
    }

    let _ = session.logout().await;
    out
}
