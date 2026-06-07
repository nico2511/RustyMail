//! Compte **playground** local : conversations pro fictives pour tester le Brief d'action sans IMAP réel.
//!
//! L’IMAP pointe vers `127.0.0.1:19999` (connexion refusée attendue) : les données vivent uniquement en SQLite.
//! Un mot de passe factice est stocké dans le trousseau pour satisfaire la validation « compte existant ».

use std::path::Path;

use rusqlite::params;

use rustymail_application::message;
use rustymail_domain::{
    Account, AccountId, MailAuthKind, SecurityMode, ServerSettings, Tag, Thread, ThreadId,
};

use crate::merge_thread_tag_csv;
use crate::threading::thread_id_for_root;

/// Identifiant compte (= e-mail SQLite), valide pour `ipc_guard::validate_account_id`.
pub const DEMO_PLAYGROUND_ACCOUNT_ID: &str = "playground@demo.rustymail.app";

fn demo_account_row() -> Account {
    Account {
        id: AccountId(DEMO_PLAYGROUND_ACCOUNT_ID.to_string()),
        display_name: "Démo pro (local)".to_string(),
        email: DEMO_PLAYGROUND_ACCOUNT_ID.to_string(),
        imap: ServerSettings {
            host: "127.0.0.1".to_string(),
            port: 19_999,
            security: SecurityMode::Tls,
            allow_invalid_tls: false,
        },
        smtp: ServerSettings {
            host: "127.0.0.1".to_string(),
            port: 19_998,
            security: SecurityMode::Tls,
            allow_invalid_tls: false,
        },
        auth_kind: MailAuthKind::Password,
    }
}

fn mk_thread(account: &str, mailbox: &str, root_key: &str, subject: &str, messages: Vec<rustymail_domain::Message>) -> Thread {
    let id = thread_id_for_root(account, mailbox, root_key);
    Thread {
        id: ThreadId(id),
        subject: subject.to_string(),
        tags: vec![Tag::source("demo.rustymail.app"), Tag::kind("demo")],
        entities: Vec::new(),
        followed: false,
        messages,
    }
}

/// Fils et messages réalistes (FR) pour stresser priorités, SLA, finance, RH, etc.
fn professional_demo_threads(account: &str, mailbox: &str) -> Vec<Thread> {
    vec![
        mk_thread(
            account,
            mailbox,
            "demo-root-globex-sla",
            "RE: SLA livraison module paiements — Globex",
            vec![
                message(
                    "m-d-globex-0",
                    "Service compta Globex",
                    "compta@globex-industrie.fr",
                    "SLA livraison module paiements — Globex",
                    "2026-05-18T16:40:00Z",
                    "Rappel : la livraison était attendue le 20/05. Merci de nous indiquer où en est l’intégration.",
                    true,
                ),
                message(
                    "m-d-globex-1",
                    "Marc Legrand",
                    "m.legrand@globex-industrie.fr",
                    "RE: SLA livraison module paiements — Globex",
                    "2026-05-19T07:10:00Z",
                    "Bonjour,\n\nSans réponse écrite de votre part avant le 21/05 18h, nous activerons la clause pénalités (0,15 % / jour de retard) du contrat cadre #2024-118.\n\nMerci de confirmer la date de livraison finale ou une fenêtre de 48h.\n\nCordialement,\nMarc",
                    false,
                ),
            ],
        ),
        mk_thread(
            account,
            mailbox,
            "demo-root-devis-t4",
            "TR: Devis T4 — validation CFO",
            vec![
                message(
                    "m-d-fin-1",
                    "Finance",
                    "finance@acme-interne.fr",
                    "Devis T4 — brouillon",
                    "2026-05-17T14:20:00Z",
                    "Voici le devis consolidé T4 pour relecture.",
                    true,
                ),
                message(
                    "m-d-fin-2",
                    "Camille Rousseau",
                    "c.rousseau@acme-interne.fr",
                    "TR: Devis T4 — validation CFO",
                    "2026-05-19T06:55:00Z",
                    "La version PDF jointe (Annexe B) est celle validée par le CFO hier soir. Tu peux l’envoyer au client dès que Juridique a coché la case NDA page 4.\n\nBloqué côté client : campagne e-mail prévue jeudi matin.",
                    false,
                ),
            ],
        ),
        mk_thread(
            account,
            mailbox,
            "demo-root-atelier-produit",
            "Atelier produit — arbitrage roadmap v2.3",
            vec![
                message(
                    "m-d-prod-1",
                    "Julien Petit",
                    "j.petit@acme-interne.fr",
                    "Atelier produit — arbitrage roadmap v2.3",
                    "2026-05-18T11:00:00Z",
                    "Jeudi 10h : 2 PM absents (congés). On maintient ou on reporte ? La release v2.3 est annoncée aux beta testeurs pour lundi.\n\nOrdre du jour : scope réduit vs date fixe.",
                    false,
                ),
            ],
        ),
        mk_thread(
            account,
            mailbox,
            "demo-root-rh-conges",
            "Demande congés — chevauchement équipe support",
            vec![
                message(
                    "m-d-rh-1",
                    "RH",
                    "rh@acme-interne.fr",
                    "Demande congés — chevauchement équipe support",
                    "2026-05-17T09:00:00Z",
                    "Les demandes de Léa et Karim se chevauchent sur la semaine 23. Merci d’arbitrer : un seul slot peut être validé selon la charte support N1.",
                    false,
                ),
            ],
        ),
        mk_thread(
            account,
            mailbox,
            "demo-root-it-incident",
            "[URGENT] VPN partenaires — dégradation",
            vec![
                message(
                    "m-d-it-1",
                    "SOC Interne",
                    "soc@acme-interne.fr",
                    "[URGENT] VPN partenaires — dégradation",
                    "2026-05-19T07:45:00Z",
                    "Ticket P1-7782 : latence >800ms sur profil « partenaires » depuis 06h30 UTC. Escalade possible vers le CTO si pas de contournement avant 10h.",
                    false,
                ),
            ],
        ),
        mk_thread(
            account,
            mailbox,
            "demo-root-juridique",
            "Clause NDA — revue fournisseur NovaTech",
            vec![
                message(
                    "m-d-jur-1",
                    "Juridique",
                    "legal@acme-interne.fr",
                    "Clause NDA — revue fournisseur NovaTech",
                    "2026-05-16T15:30:00Z",
                    "La clause 8.2 (sous-traitance) est non conforme à notre politique groupe. Proposition de contre-projet sous 48h ou suspension des achats >50k€.",
                    false,
                ),
            ],
        ),
        mk_thread(
            account,
            mailbox,
            "demo-root-supplier",
            "Commande matériel — délai fournisseur",
            vec![
                message(
                    "m-d-sup-1",
                    "Achats",
                    "achats@acme-interne.fr",
                    "Commande matériel — délai fournisseur",
                    "2026-05-18T08:15:00Z",
                    "Le fournisseur annonce +10 jours sur le lot serveurs. Impact atelier infra du 22/05. Besoin d’une décision : accepter délai vs sourcer ailleurs (+15 % coût).",
                    false,
                ),
            ],
        ),
        mk_thread(
            account,
            mailbox,
            "demo-root-standup",
            "Compte-rendu standup — actions",
            vec![
                message(
                    "m-d-std-0",
                    "David Park",
                    "david@meridianpr.com",
                    "Standup notes",
                    "2026-05-19T07:45:00Z",
                    "Notes rapides standup.",
                    true,
                ),
                message(
                    "m-d-std-1",
                    "Sarah Chen",
                    "sarah@meridianpr.com",
                    "Compte-rendu standup — actions",
                    "2026-05-19T08:00:00Z",
                    "Actions : @toi relance Globex avant midi ; @Camille envoie devis T4 après NDA ; @Julien tranche sur l’atelier jeudi.",
                    false,
                ),
            ],
        ),
        mk_thread(
            account,
            mailbox,
            "demo-root-newsletter",
            "Partner News — Mai 2026",
            vec![
                message(
                    "m-d-nl-1",
                    "Newsletter",
                    "noreply@partner-news.io",
                    "Partner News — Mai 2026",
                    "2026-05-19T05:00:00Z",
                    "Découvrez les nouveautés produits de nos partenaires… (contenu marketing)",
                    true,
                ),
            ],
        ),
        mk_thread(
            account,
            mailbox,
            "demo-root-facture",
            "Facture hébergement — Mars 2026",
            vec![
                message(
                    "m-d-fac-1",
                    "Billing OVH",
                    "billing@example-cloud.fr",
                    "Facture hébergement — Mars 2026",
                    "2026-05-10T12:00:00Z",
                    "Votre facture F-2026-0312 est disponible. Montant 842,10 € TTC. Date d’échéance : 25/05.",
                    true,
                ),
            ],
        ),
        mk_thread(
            account,
            mailbox,
            "demo-root-client-nl",
            "Votre commande #44921 a été expédiée",
            vec![
                message(
                    "m-d-shop-1",
                    "Boutique Auto",
                    "commandes@boutique-auto.fr",
                    "Votre commande #44921 a été expédiée",
                    "2026-05-18T19:00:00Z",
                    "Bonjour, votre colis a quitté nos locaux. Suivi : …",
                    true,
                ),
            ],
        ),
    ]
}

fn insert_demo_dataset(tx: &rusqlite::Transaction<'_>, account_id: &str, mailbox: &str) -> Result<usize, rusqlite::Error> {
    let threads = professional_demo_threads(account_id, mailbox);
    let mut n = 0usize;
    let mut imap_uid: i64 = 900_000;

    for thread in threads {
        let tags_csv = merge_thread_tag_csv(None, &thread.tags);
        let thread_root = thread
            .messages
            .first()
            .and_then(|m| m.references.message_id_header.clone());

        tx.execute(
            "INSERT INTO threads (id, account_id, mailbox, thread_root_message_id, subject, tags) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params![
                thread.id.0,
                account_id,
                mailbox,
                thread_root,
                thread.subject,
                tags_csv
            ],
        )?;

        for (position, msg) in thread.messages.iter().enumerate() {
            imap_uid += 1;
            tx.execute(
                "
                INSERT INTO messages (
                    id, thread_id, account_id, mailbox, imap_uid,
                    sender_name, sender_email, subject, received_at,
                    body, body_plain, body_html,
                    message_id_header, in_reply_to, references_header,
                    to_header, cc_header, reply_to_header,
                    is_read, position
                ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20)
                ",
                params![
                    msg.id.0,
                    thread.id.0,
                    account_id,
                    mailbox,
                    imap_uid,
                    msg.sender.name.clone().unwrap_or_default(),
                    msg.sender.email,
                    msg.subject,
                    msg.received_at,
                    msg.plain_body,
                    msg.plain_body,
                    msg.html_body.clone(),
                    msg.references.message_id_header.clone(),
                    msg.references.in_reply_to.clone(),
                    msg.references.references.join(" "),
                    Option::<String>::None,
                    Option::<String>::None,
                    Option::<String>::None,
                    i64::from(msg.is_read),
                    position as i64
                ],
            )?;
            n += 1;
        }
    }
    Ok(n)
}

fn purge_account_mail(tx: &rusqlite::Transaction<'_>, account_id: &str) -> Result<(), rusqlite::Error> {
    tx.execute(
        "DELETE FROM message_embeddings WHERE message_id IN (SELECT id FROM messages WHERE account_id = ?1)",
        [account_id],
    )?;
    tx.execute(
        "DELETE FROM message_attachments WHERE message_id IN (SELECT id FROM messages WHERE account_id = ?1)",
        [account_id],
    )?;
    tx.execute("DELETE FROM messages WHERE account_id = ?1", [account_id])?;
    tx.execute("DELETE FROM threads WHERE account_id = ?1", [account_id])?;
    tx.execute("DELETE FROM imap_state WHERE account_id = ?1", [account_id])?;
    Ok(())
}

/// Réinsère compte + fils fictifs pro. Idempotent : écrase les données mail du compte démo uniquement.
pub fn sqlite_reset_demo_playground(db_path: &Path) -> Result<String, String> {
    let account = demo_account_row();
    account.validate().map_err(|e| format!("compte démo invalide: {e:?}"))?;

    let mut connection = crate::open_sqlite_migrated(db_path).map_err(|e| e.to_string())?;
    connection
        .execute_batch("PRAGMA foreign_keys = ON;")
        .map_err(|e| e.to_string())?;

    let existed: i64 = connection
        .query_row(
            "SELECT COUNT(1) FROM accounts WHERE id = ?1",
            [DEMO_PLAYGROUND_ACCOUNT_ID],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;

    crate::upsert_account_row(&connection, &account).map_err(|e| e.to_string())?;

    if existed == 0 {
        crate::set_keyring_password(
            DEMO_PLAYGROUND_ACCOUNT_ID,
            "rustymail-demo-not-for-sync",
        )?;
    }

    let tx = connection.transaction().map_err(|e| e.to_string())?;
    purge_account_mail(&tx, DEMO_PLAYGROUND_ACCOUNT_ID).map_err(|e| e.to_string())?;
    let n = insert_demo_dataset(&tx, DEMO_PLAYGROUND_ACCOUNT_ID, "INBOX").map_err(|e| e.to_string())?;
    tx.commit().map_err(|e| e.to_string())?;

    Ok(format!(
        "Boîte démo réinitialisée ({DEMO_PLAYGROUND_ACCOUNT_ID}) : {n} message(s) injecté(s) dans INBOX."
    ))
}

/// Supprime entièrement le compte démo (SQLite + trousseau). Idempotent si le compte n’existe pas.
pub fn sqlite_remove_demo_playground(db_path: &Path) -> Result<String, String> {
    let connection = crate::open_sqlite_migrated(db_path).map_err(|e| e.to_string())?;
    let existed: i64 = connection
        .query_row(
            "SELECT COUNT(1) FROM accounts WHERE id = ?1",
            [DEMO_PLAYGROUND_ACCOUNT_ID],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;

    if existed == 0 {
        return Ok(format!(
            "Aucune boîte démo à supprimer ({DEMO_PLAYGROUND_ACCOUNT_ID} n’est pas configurée)."
        ));
    }

    crate::delete_account(db_path, DEMO_PLAYGROUND_ACCOUNT_ID)?;

    Ok(format!(
        "Boîte démo supprimée ({DEMO_PLAYGROUND_ACCOUNT_ID}). Configurez un compte IMAP réel dans Paramètres → Comptes."
    ))
}
