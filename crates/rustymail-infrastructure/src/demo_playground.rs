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

struct DemoNote {
    message: rustymail_domain::Message,
    to_header: String,
    cc_header: String,
}

struct DemoBundle {
    thread: Thread,
    headers: Vec<(String, String)>,
}

fn demo_note(
    id: &str,
    name: &str,
    email: &str,
    subject: &str,
    at: &str,
    plain: &str,
    html: &str,
    to: &str,
    cc: &str,
    read: bool,
    reply_to: Option<&str>,
) -> DemoNote {
    let mut msg = message(id, name, email, subject, at, plain, read);
    msg.html_body = Some(html.to_string());
    if let Some(prev) = reply_to {
        let mid = format!("<{prev}@rustymail.local>");
        msg.references.in_reply_to = Some(mid.clone());
        msg.references.references = vec![mid];
    }
    let mut recipients = mail_addresses(to);
    recipients.extend(mail_addresses(cc));
    if !recipients.is_empty() {
        msg.recipients = recipients;
    }
    DemoNote {
        message: msg,
        to_header: to.to_string(),
        cc_header: cc.to_string(),
    }
}

fn mail_addresses(raw: &str) -> Vec<rustymail_domain::EmailAddress> {
    let mut out = Vec::new();
    let Ok(list) = mailparse::addrparse(raw) else {
        return out;
    };
    for addr in list.iter() {
        let mailparse::MailAddr::Single(single) = addr else {
            continue;
        };
        let email = single.addr.trim().to_string();
        if email.is_empty() {
            continue;
        }
        out.push(rustymail_domain::EmailAddress {
            name: single.display_name.clone(),
            email,
        });
    }
    out
}

fn bundle(
    account: &str,
    mailbox: &str,
    root_key: &str,
    subject: &str,
    notes: Vec<DemoNote>,
) -> DemoBundle {
    let mut headers = Vec::with_capacity(notes.len());
    let mut messages = Vec::with_capacity(notes.len());
    for note in notes {
        headers.push((note.to_header, note.cc_header));
        messages.push(note.message);
    }
    let id = thread_id_for_root(account, mailbox, root_key);
    DemoBundle {
        headers,
        thread: Thread {
            id: ThreadId(id),
            subject: subject.to_string(),
            tags: vec![Tag::source("demo.rustymail.app"), Tag::kind("demo")],
            entities: Vec::new(),
            followed: false,
            messages,
        },
    }
}

/// Fils pro fictifs, assez longs pour la lecture : plusieurs participants, liens, tableaux.
fn professional_demo_threads(account: &str, mailbox: &str) -> Vec<DemoBundle> {
    vec![
        bundle(
            account,
            mailbox,
            "demo-root-globex-sla",
            "RE: SLA livraison module paiements — Globex",
            vec![
                demo_note(
                    "m-d-globex-0",
                    "Service compta Globex",
                    "compta@globex-industrie.fr",
                    "SLA livraison module paiements — Globex",
                    "2026-05-18T16:40:00Z",
                    "Rappel collectif : la livraison du module paiements était attendue le 20/05.\n\nLe tableau de jalons est dans le corps du message. Merci d’indiquer où en est l’intégration et quelle fenêtre de 48 h vous pouvez tenir.",
                    r#"<p>Bonjour à toutes et tous,</p>
<p>Rappel collectif : la livraison du <strong>module paiements</strong> était attendue le 20/05 (contrat cadre <a href="https://intranet.globex-industrie.test/contrats/2024-118">#2024-118</a>).</p>
<table class="rm-mail-data"><thead><tr><th>Jalon</th><th>Date</th><th>Statut</th><th>Responsable</th></tr></thead><tbody>
<tr><td>Spécification API v3</td><td>02/05</td><td>Livré</td><td>Léa Martin</td></tr>
<tr><td>Recette interne Acme</td><td>12/05</td><td>Livré</td><td>Karim Benali</td></tr>
<tr><td>Recette partenaire</td><td>20/05</td><td>En retard</td><td>Marc Legrand</td></tr>
<tr><td>Mise en production</td><td>27/05</td><td>À confirmer</td><td>Léa Martin</td></tr>
</tbody></table>
<p>Le détail des écarts est sur le <a href="https://intranet.globex-industrie.test/projets/paiements/sla">tableau de suivi SLA</a>. Merci d’indiquer une fenêtre de 48 h, ou la date ferme de livraison.</p>
<ul>
<li><strong>Blocage connu</strong> : certificat partenaire toujours en attente côté Globex.</li>
<li>Pénalités prévues au contrat : <em>0,15 % / jour</em> au-delà du 20/05.</li>
</ul>
<p>Inès Bernard (juridique) et Marc Legrand (delivery) sont en copie.</p>"#,
                    "Léa Martin <playground@demo.rustymail.app>, Marc Legrand <m.legrand@globex-industrie.fr>",
                    "Inès Bernard <i.bernard@globex-industrie.fr>, Camille Rousseau <c.rousseau@acme-interne.fr>",
                    true,
                    None,
                ),
                demo_note(
                    "m-d-globex-1",
                    "Marc Legrand",
                    "m.legrand@globex-industrie.fr",
                    "RE: SLA livraison module paiements — Globex",
                    "2026-05-19T07:10:00Z",
                    "Sans réponse écrite avant le 21/05 18h, nous activerons la clause pénalités du contrat cadre #2024-118.\n\nMerci de confirmer la date de livraison finale ou une fenêtre de 48 h. Le certificat partenaire est prêt depuis ce matin.",
                    r#"<p>Bonjour Léa, Camille,</p>
<p>Sans réponse écrite de votre part <strong>avant le 21/05 18h</strong>, nous activerons la clause pénalités (0,15 % / jour de retard) du contrat cadre <a href="https://intranet.globex-industrie.test/contrats/2024-118">#2024-118</a>.</p>
<blockquote><p>Le certificat partenaire a été déposé ce matin sur le coffre. Le blocage cité hier n’est plus d’actualité.</p></blockquote>
<p>Merci de confirmer soit la date de livraison finale, soit une fenêtre de 48 h. Inès reste en copie pour la lecture juridique.</p>
<p>Marc Legrand<br>Delivery, Globex Industrie</p>"#,
                    "Léa Martin <playground@demo.rustymail.app>, Camille Rousseau <c.rousseau@acme-interne.fr>",
                    "Inès Bernard <i.bernard@globex-industrie.fr>, Service compta Globex <compta@globex-industrie.fr>",
                    false,
                    Some("m-d-globex-0"),
                ),
                demo_note(
                    "m-d-globex-2",
                    "Léa Martin",
                    "playground@demo.rustymail.app",
                    "RE: SLA livraison module paiements — Globex",
                    "2026-05-19T09:05:00Z",
                    "Fenêtre proposée : jeudi 21/05 14h – vendredi 22/05 18h. La recette partenaire peut démarrer dès réception de l’accès coffre.\n\nJe tiens le point avec Karim à 11h et je confirme le créneau par écrit.",
                    r#"<p>Bonjour Marc, Inès, Camille,</p>
<p>Fenêtre que nous pouvons tenir : <strong>jeudi 21/05 14h – vendredi 22/05 18h</strong>. La recette partenaire démarre dès que l’accès coffre est ouvert pour Karim Benali.</p>
<table class="rm-mail-data"><thead><tr><th>Créneau</th><th>Qui</th><th>Objectif</th></tr></thead><tbody>
<tr><td>21/05 14h–18h</td><td>Karim Benali, Marc Legrand</td><td>Rejeu des 12 cas de paiement</td></tr>
<tr><td>22/05 9h–12h</td><td>Léa Martin, Inès Bernard</td><td>Lecture des écarts et clause 4.2</td></tr>
<tr><td>22/05 16h</td><td>Camille Rousseau</td><td>Go / no-go écrit</td></tr>
</tbody></table>
<p>Le protocole de recette est ici : <a href="https://intranet.acme-interne.test/qualite/recette-paiements">protocole v2.3</a>. Je confirme le créneau après le point de 11h avec Karim.</p>
<p>Léa Martin</p>"#,
                    "Marc Legrand <m.legrand@globex-industrie.fr>, Camille Rousseau <c.rousseau@acme-interne.fr>",
                    "Inès Bernard <i.bernard@globex-industrie.fr>, Karim Benali <k.benali@acme-interne.fr>",
                    false,
                    Some("m-d-globex-1"),
                ),
            ],
        ),
        bundle(
            account,
            mailbox,
            "demo-root-devis-t4",
            "TR: Devis T4 — validation CFO",
            vec![
                demo_note(
                    "m-d-fin-1",
                    "Finance",
                    "finance@acme-interne.fr",
                    "Devis T4 — brouillon",
                    "2026-05-17T14:20:00Z",
                    "Voici le devis consolidé T4 pour relecture. Trois postes restent ouverts : licence, régie et hébergement.",
                    r#"<p>Bonjour Camille, Hugo,</p>
<p>Devis consolidé T4 pour relecture avant envoi client. Les trois postes ouverts sont repris ci-dessous.</p>
<table class="rm-mail-data"><thead><tr><th>Poste</th><th>Montant HT</th><th>Statut</th></tr></thead><tbody>
<tr><td>Licence module paiements</td><td>48 000 €</td><td>Figé</td></tr>
<tr><td>Régie recette (12 j)</td><td>14 400 €</td><td>À arbitrer</td></tr>
<tr><td>Hébergement préprod 3 mois</td><td>2 760 €</td><td>Devis cloud joint</td></tr>
</tbody></table>
<p>Annexe chiffrée : <a href="https://intranet.acme-interne.test/finance/devis-t4">dossier T4</a>.</p>"#,
                    "Camille Rousseau <c.rousseau@acme-interne.fr>, Hugo Lambert <h.lambert@acme-interne.fr>",
                    "Léa Martin <playground@demo.rustymail.app>",
                    true,
                    None,
                ),
                demo_note(
                    "m-d-fin-2",
                    "Camille Rousseau",
                    "c.rousseau@acme-interne.fr",
                    "TR: Devis T4 — validation CFO",
                    "2026-05-19T06:55:00Z",
                    "La version validée par le CFO hier soir peut partir au client dès que Juridique a coché la case NDA page 4. La campagne e-mail client est prévue jeudi matin.",
                    r#"<p>Léa, Hugo,</p>
<p>La version validée par le CFO hier soir est l’<a href="https://intranet.acme-interne.test/finance/devis-t4/annexe-b">annexe B</a>. Tu peux l’envoyer au client dès que Juridique a coché la case NDA, page 4.</p>
<p>Bloqué côté client : la campagne e-mail est prévue <strong>jeudi matin</strong>. Si la case NDA n’est pas cochée mercredi 18h, on décale l’envoi au vendredi.</p>
<ol>
<li>Hugo : confirmer le plafond régie à 14 400 € HT.</li>
<li>Léa : relancer Globex sur la fenêtre de recette.</li>
<li>Juridique : case NDA, page 4.</li>
</ol>
<p>Camille Rousseau<br>Opérations clients</p>"#,
                    "Léa Martin <playground@demo.rustymail.app>, Hugo Lambert <h.lambert@acme-interne.fr>",
                    "Juridique <legal@acme-interne.fr>",
                    false,
                    Some("m-d-fin-1"),
                ),
                demo_note(
                    "m-d-fin-3",
                    "Hugo Lambert",
                    "h.lambert@acme-interne.fr",
                    "RE: Devis T4 — validation CFO",
                    "2026-05-19T08:40:00Z",
                    "Plafond régie confirmé à 14 400 € HT. Au-delà, il me faut un avenant. L’annexe B peut partir.",
                    r#"<p>Camille, Léa,</p>
<p>Plafond régie <strong>confirmé à 14 400 € HT</strong>. Au-delà, avenant obligatoire — pas d’extension tacite.</p>
<table class="rm-mail-data"><thead><tr><th>Décision</th><th>Effet</th></tr></thead><tbody>
<tr><td>Annexe B</td><td>Peut partir au client</td></tr>
<tr><td>Régie</td><td>Plafond 12 jours</td></tr>
<tr><td>NDA page 4</td><td>Toujours bloquant</td></tr>
</tbody></table>
<p>Référence interne : <a href="https://intranet.acme-interne.test/finance/decisions/cfo-2026-19">note CFO 2026-19</a>.</p>
<p>Hugo Lambert<br>Direction financière</p>"#,
                    "Camille Rousseau <c.rousseau@acme-interne.fr>, Léa Martin <playground@demo.rustymail.app>",
                    "Juridique <legal@acme-interne.fr>, Finance <finance@acme-interne.fr>",
                    false,
                    Some("m-d-fin-2"),
                ),
            ],
        ),
        bundle(
            account,
            mailbox,
            "demo-root-atelier-produit",
            "Atelier produit — arbitrage roadmap v2.3",
            vec![
                demo_note(
                    "m-d-prod-1",
                    "Julien Petit",
                    "j.petit@acme-interne.fr",
                    "Atelier produit — arbitrage roadmap v2.3",
                    "2026-05-18T11:00:00Z",
                    "Jeudi 10h : deux PM absents. On maintient l’atelier ou on le reporte ? La release v2.3 est annoncée aux bêta testeurs pour lundi. Ordre du jour : scope réduit ou date fixe.",
                    r#"<p>Nadia, Karim, Léa,</p>
<p>Jeudi 10h : <strong>deux PM absents</strong> (congés). On maintient l’atelier ou on le reporte ? La release v2.3 est annoncée aux bêta testeurs pour lundi.</p>
<p>Ordre du jour proposé :</p>
<ol>
<li>Scope réduit (paiement invité seulement) contre date fixe.</li>
<li>Ce qui sort de la 2.3 si on tient lundi.</li>
<li>Message bêta : <a href="https://intranet.acme-interne.test/produit/beta-v23">brouillon d’annonce</a>.</li>
</ol>
<p>Julien Petit<br>Produit</p>"#,
                    "Nadia Cherif <n.cherif@acme-interne.fr>, Karim Benali <k.benali@acme-interne.fr>, Léa Martin <playground@demo.rustymail.app>",
                    "Camille Rousseau <c.rousseau@acme-interne.fr>",
                    false,
                    None,
                ),
                demo_note(
                    "m-d-prod-2",
                    "Nadia Cherif",
                    "n.cherif@acme-interne.fr",
                    "RE: Atelier produit — arbitrage roadmap v2.3",
                    "2026-05-18T15:10:00Z",
                    "Je vote pour tenir lundi avec un scope réduit. Le paiement invité et le reçu PDF restent. Le virement différé sort de la 2.3.",
                    r#"<p>Julien, Karim, Léa,</p>
<p>Je vote pour <strong>tenir lundi</strong> avec un scope réduit. Le tableau ci-dessous est ma proposition de coupe.</p>
<table class="rm-mail-data"><thead><tr><th>Sujet</th><th>v2.3 lundi</th><th>Report</th></tr></thead><tbody>
<tr><td>Paiement invité</td><td>Oui</td><td>—</td></tr>
<tr><td>Reçu PDF</td><td>Oui</td><td>—</td></tr>
<tr><td>Virement différé</td><td>Non</td><td>v2.4</td></tr>
<tr><td>Webhooks partenaires</td><td>Non</td><td>après Globex</td></tr>
</tbody></table>
<p>Détail dans la <a href="https://intranet.acme-interne.test/produit/roadmap-v23">roadmap v2.3</a>. On peut maintenir jeudi 10h à trois.</p>
<p>Nadia Cherif</p>"#,
                    "Julien Petit <j.petit@acme-interne.fr>, Karim Benali <k.benali@acme-interne.fr>, Léa Martin <playground@demo.rustymail.app>",
                    "Camille Rousseau <c.rousseau@acme-interne.fr>",
                    false,
                    Some("m-d-prod-1"),
                ),
                demo_note(
                    "m-d-prod-3",
                    "Karim Benali",
                    "k.benali@acme-interne.fr",
                    "RE: Atelier produit — arbitrage roadmap v2.3",
                    "2026-05-18T16:45:00Z",
                    "D’accord pour la coupe de Nadia si le reçu PDF ne dépend plus du virement différé. J’ai un correctif de 4 h à poser mardi. Jeudi 10h me va.",
                    r#"<p>Nadia, Julien,</p>
<p>D’accord pour la coupe, <em>si</em> le reçu PDF ne dépend plus du virement différé. J’ai vérifié : le modèle de reçu actuel n’appelle pas ce flux.</p>
<ul>
<li>Correctif estimé : <strong>4 h</strong>, mardi.</li>
<li>Risque restant : le libellé « paiement en attente » sur les reçus invités.</li>
<li>Jeudi 10h : je serai là.</li>
</ul>
<p>Note technique : <a href="https://intranet.acme-interne.test/eng/recu-pdf">fiche reçu PDF</a>.</p>
<p>Karim Benali</p>"#,
                    "Nadia Cherif <n.cherif@acme-interne.fr>, Julien Petit <j.petit@acme-interne.fr>, Léa Martin <playground@demo.rustymail.app>",
                    "",
                    false,
                    Some("m-d-prod-2"),
                ),
            ],
        ),
        bundle(
            account,
            mailbox,
            "demo-root-rh-conges",
            "Demande congés — chevauchement équipe support",
            vec![
                demo_note(
                    "m-d-rh-1",
                    "RH",
                    "rh@acme-interne.fr",
                    "Demande congés — chevauchement équipe support",
                    "2026-05-17T09:00:00Z",
                    "Les demandes de Léa et Karim se chevauchent sur la semaine 23. Un seul slot peut être validé selon la charte support N1. Merci d’arbitrer avant mercredi.",
                    r#"<p>Bonjour Léa,</p>
<p>Les demandes de <strong>Léa Martin</strong> et <strong>Karim Benali</strong> se chevauchent sur la semaine 23. La charte support N1 n’autorise qu’un seul départ cette semaine-là.</p>
<table class="rm-mail-data"><thead><tr><th>Personne</th><th>Du</th><th>Au</th><th>Couverture proposée</th></tr></thead><tbody>
<tr><td>Léa Martin</td><td>02/06</td><td>05/06</td><td>Nadia Cherif</td></tr>
<tr><td>Karim Benali</td><td>03/06</td><td>06/06</td><td>Julien Petit</td></tr>
</tbody></table>
<p>Charte : <a href="https://intranet.acme-interne.test/rh/charte-support-n1">support N1</a>. Merci d’arbitrer avant mercredi. Chloé Marin (RH) et Karim sont en copie.</p>
<p>Équipe RH</p>"#,
                    "Léa Martin <playground@demo.rustymail.app>",
                    "Karim Benali <k.benali@acme-interne.fr>, Chloé Marin <c.marin@acme-interne.fr>",
                    false,
                    None,
                ),
                demo_note(
                    "m-d-rh-2",
                    "Chloé Marin",
                    "c.marin@acme-interne.fr",
                    "RE: Demande congés — chevauchement équipe support",
                    "2026-05-17T11:20:00Z",
                    "Je peux décaler Karim au 09/06 si Léa confirme qu’elle tient l’astreinte du 3 juin. Sans ça, je valide le slot de Karim, demandé en premier.",
                    r#"<p>Léa, Karim,</p>
<p>Deux options, une seule peut être signée :</p>
<ol>
<li><strong>Léa partie</strong> du 2 au 5 juin, Karim décalé au 9 juin, Léa tient l’astreinte du 3.</li>
<li><strong>Karim parti</strong> du 3 au 6 juin (demande la plus ancienne), Léa reportée à juillet.</li>
</ol>
<p>Le planning est là : <a href="https://intranet.acme-interne.test/rh/planning-s23">semaine 23</a>. Dites-moi avant mercredi 12h quelle ligne je signe.</p>
<p>Chloé Marin</p>"#,
                    "Léa Martin <playground@demo.rustymail.app>, Karim Benali <k.benali@acme-interne.fr>",
                    "RH <rh@acme-interne.fr>",
                    false,
                    Some("m-d-rh-1"),
                ),
            ],
        ),
        bundle(
            account,
            mailbox,
            "demo-root-it-incident",
            "[URGENT] VPN partenaires — dégradation",
            vec![
                demo_note(
                    "m-d-it-1",
                    "SOC Interne",
                    "soc@acme-interne.fr",
                    "[URGENT] VPN partenaires — dégradation",
                    "2026-05-19T07:45:00Z",
                    "Ticket P1-7782 : latence supérieure à 800 ms sur le profil partenaires depuis 06h30 UTC. Escalade CTO possible sans contournement avant 10h.",
                    r#"<p>Nina, Léa, Karim,</p>
<p>Ticket <strong>P1-7782</strong> : latence &gt; 800 ms sur le profil « partenaires » depuis 06h30 UTC. Sans contournement avant 10h, escalade CTO.</p>
<table class="rm-mail-data"><thead><tr><th>Sonde</th><th>06h30</th><th>07h40</th><th>Seuil</th></tr></thead><tbody>
<tr><td>Paris-1</td><td>820 ms</td><td>910 ms</td><td>200 ms</td></tr>
<tr><td>Lyon-2</td><td>640 ms</td><td>870 ms</td><td>200 ms</td></tr>
<tr><td>Profil salariés</td><td>40 ms</td><td>45 ms</td><td>200 ms</td></tr>
</tbody></table>
<p>Statut public interne : <a href="https://statut.acme-interne.test/p1-7782">P1-7782</a>. Le profil salariés n’est pas touché.</p>
<p>SOC interne</p>"#,
                    "Nina Costa <n.costa@acme-interne.fr>, Léa Martin <playground@demo.rustymail.app>",
                    "Karim Benali <k.benali@acme-interne.fr>",
                    false,
                    None,
                ),
                demo_note(
                    "m-d-it-2",
                    "Nina Costa",
                    "n.costa@acme-interne.fr",
                    "RE: [URGENT] VPN partenaires — dégradation",
                    "2026-05-19T08:20:00Z",
                    "Contournement en place : les partenaires passent par le concentrateur de secours. La latence est redescendue sous 180 ms. Je laisse le P1 ouvert jusqu’à la cause racine.",
                    r#"<p>SOC, Léa,</p>
<p>Contournement posé à 08h12 : les partenaires passent par le <strong>concentrateur de secours</strong>. La latence est redescendue sous 180 ms sur Paris-1 et Lyon-2.</p>
<ul>
<li>Cause probable : saturation du nœud <code>vpn-edge-03</code>.</li>
<li>Le P1 reste ouvert jusqu’à la cause racine.</li>
<li>Pas d’escalade CTO si le contournement tient jusqu’à 10h.</li>
</ul>
<p>Journal : <a href="https://statut.acme-interne.test/p1-7782">fil du ticket</a>.</p>
<p>Nina Costa<br>Infra</p>"#,
                    "SOC Interne <soc@acme-interne.fr>, Léa Martin <playground@demo.rustymail.app>",
                    "Karim Benali <k.benali@acme-interne.fr>",
                    false,
                    Some("m-d-it-1"),
                ),
            ],
        ),
        bundle(
            account,
            mailbox,
            "demo-root-juridique",
            "Clause NDA — revue fournisseur NovaTech",
            vec![
                demo_note(
                    "m-d-jur-1",
                    "Juridique",
                    "legal@acme-interne.fr",
                    "Clause NDA — revue fournisseur NovaTech",
                    "2026-05-16T15:30:00Z",
                    "La clause 8.2 (sous-traitance) n’est pas conforme à la politique groupe. Contre-projet sous 48 h, sinon suspension des achats au-dessus de 50 k€.",
                    r#"<p>Léa, Maître Adel,</p>
<p>La clause <strong>8.2</strong> (sous-traitance) du NDA NovaTech n’est pas conforme à la politique groupe. Contre-projet sous 48 h, sinon suspension des achats au-dessus de 50 k€.</p>
<table class="rm-mail-data"><thead><tr><th>Clause</th><th>NovaTech</th><th>Politique Acme</th></tr></thead><tbody>
<tr><td>8.2 Sous-traitance</td><td>Libre, simple information</td><td>Accord écrit préalable</td></tr>
<tr><td>11 Durée</td><td>2 ans</td><td>3 ans</td></tr>
<tr><td>14 Loi applicable</td><td>Delaware</td><td>France</td></tr>
</tbody></table>
<p>Projet de clause : <a href="https://intranet.acme-interne.test/legal/novatech-nda">contre-projet</a>.</p>
<p>Juridique interne</p>"#,
                    "Léa Martin <playground@demo.rustymail.app>, Maître Adel <a.adel@cabinet-adel.test>",
                    "Achats <achats@acme-interne.fr>",
                    false,
                    None,
                ),
                demo_note(
                    "m-d-jur-2",
                    "Maître Adel",
                    "a.adel@cabinet-adel.test",
                    "RE: Clause NDA — revue fournisseur NovaTech",
                    "2026-05-17T10:05:00Z",
                    "Le contre-projet tient si NovaTech accepte l’accord écrit et la loi française. Je déconseille de céder sur la sous-traitance : c’est le point qui expose le groupe.",
                    r#"<p>Juridique, Léa,</p>
<p>Le contre-projet tient si NovaTech accepte <strong>l’accord écrit</strong> et la <strong>loi française</strong>. Je déconseille de céder sur la sous-traitance : c’est le point qui expose le groupe.</p>
<blockquote><p>Une simple information a posteriori ne permet pas de retirer un sous-traitant déjà en possession des données.</p></blockquote>
<p>Je peux envoyer la rédaction mardi si Achats confirme qu’aucun bon de commande &gt; 50 k€ n’est signé d’ici là. Dossier : <a href="https://intranet.acme-interne.test/legal/novatech-nda">contre-projet</a>.</p>
<p>Adel<br>Cabinet Adel</p>"#,
                    "Juridique <legal@acme-interne.fr>, Léa Martin <playground@demo.rustymail.app>",
                    "Achats <achats@acme-interne.fr>",
                    false,
                    Some("m-d-jur-1"),
                ),
            ],
        ),
        bundle(
            account,
            mailbox,
            "demo-root-supplier",
            "Commande matériel — délai fournisseur",
            vec![
                demo_note(
                    "m-d-sup-1",
                    "Achats",
                    "achats@acme-interne.fr",
                    "Commande matériel — délai fournisseur",
                    "2026-05-18T08:15:00Z",
                    "Le fournisseur annonce dix jours de plus sur le lot serveurs. L’atelier infra du 22/05 est touché. Décision demandée : accepter le délai ou sourcer ailleurs, environ 15 % plus cher.",
                    r#"<p>Léa, Nina,</p>
<p>Le fournisseur annonce <strong>+10 jours</strong> sur le lot serveurs. L’atelier infra du 22/05 est touché.</p>
<table class="rm-mail-data"><thead><tr><th>Option</th><th>Livraison</th><th>Écart de coût</th><th>Atelier du 22/05</th></tr></thead><tbody>
<tr><td>Accepter NovaTech</td><td>01/06</td><td>0</td><td>Reporté</td></tr>
<tr><td>Second sourcing Helio</td><td>24/05</td><td>+15 %</td><td>Tenable</td></tr>
<tr><td>Location 30 jours</td><td>21/05</td><td>+9 %</td><td>Tenable, puis retour</td></tr>
</tbody></table>
<p>Comparatif : <a href="https://intranet.acme-interne.test/achats/lot-serveurs">lot serveurs</a>. Il me faut une décision aujourd’hui.</p>
<p>Achats</p>"#,
                    "Léa Martin <playground@demo.rustymail.app>, Nina Costa <n.costa@acme-interne.fr>",
                    "Hugo Lambert <h.lambert@acme-interne.fr>",
                    false,
                    None,
                ),
                demo_note(
                    "m-d-sup-2",
                    "Nina Costa",
                    "n.costa@acme-interne.fr",
                    "RE: Commande matériel — délai fournisseur",
                    "2026-05-18T09:30:00Z",
                    "Je prends la location 30 jours. L’atelier du 22/05 ne se décale pas, et on ne signe pas le second sourcing tant que le NDA NovaTech n’est pas clos.",
                    r#"<p>Achats, Léa, Hugo,</p>
<p>Je prends la <strong>location 30 jours</strong>. L’atelier du 22/05 ne se décale pas, et on ne signe pas Helio tant que le NDA NovaTech n’est pas clos.</p>
<ul>
<li>Besoin réel le 22/05 : 4 machines, pas les 8 du lot.</li>
<li>Le reliquat NovaTech peut arriver le 1/06 sans bloquer la recette.</li>
<li>Hugo : l’écart de 9 % tient dans l’enveloppe infra du mois.</li>
</ul>
<p>Fiche atelier : <a href="https://intranet.acme-interne.test/infra/atelier-22-05">22/05</a>.</p>
<p>Nina Costa</p>"#,
                    "Achats <achats@acme-interne.fr>, Léa Martin <playground@demo.rustymail.app>",
                    "Hugo Lambert <h.lambert@acme-interne.fr>",
                    false,
                    Some("m-d-sup-1"),
                ),
            ],
        ),
        bundle(
            account,
            mailbox,
            "demo-root-standup",
            "Compte-rendu standup — actions",
            vec![
                demo_note(
                    "m-d-std-0",
                    "David Park",
                    "david@meridianpr.com",
                    "Standup notes",
                    "2026-05-19T07:45:00Z",
                    "Notes brutes du standup. Sarah en fait le compte-rendu. Trois sujets : Globex, devis T4, atelier jeudi.",
                    r#"<p>Sarah, Omar, Léa,</p>
<p>Notes brutes, pas encore relues. Trois sujets ouverts : Globex, devis T4, atelier de jeudi.</p>
<ul>
<li>Globex attend une fenêtre écrite.</li>
<li>Le devis T4 est chez le CFO.</li>
<li>Deux PM absents jeudi.</li>
</ul>
<p>David Park</p>"#,
                    "Sarah Chen <sarah@meridianpr.com>, Omar Diallo <omar@meridianpr.com>, Léa Martin <playground@demo.rustymail.app>",
                    "",
                    true,
                    None,
                ),
                demo_note(
                    "m-d-std-1",
                    "Sarah Chen",
                    "sarah@meridianpr.com",
                    "Compte-rendu standup — actions",
                    "2026-05-19T08:00:00Z",
                    "Actions : Léa relance Globex avant midi ; Camille envoie le devis T4 après le NDA ; Julien tranche l’atelier jeudi. Le détail est dans le tableau.",
                    r#"<p>David, Omar, Léa, Camille, Julien,</p>
<p>Compte-rendu. Chaque ligne a un responsable et une heure limite.</p>
<table class="rm-mail-data"><thead><tr><th>Action</th><th>Qui</th><th>Avant</th></tr></thead><tbody>
<tr><td>Fenêtre écrite Globex</td><td>Léa Martin</td><td>Mardi 12h</td></tr>
<tr><td>Devis T4 après NDA</td><td>Camille Rousseau</td><td>Mercredi 18h</td></tr>
<tr><td>Atelier jeudi : tenir ou reporter</td><td>Julien Petit</td><td>Mardi 17h</td></tr>
<tr><td>P1 VPN : cause racine</td><td>Nina Costa</td><td>Mardi 16h</td></tr>
</tbody></table>
<p>Fil de la semaine : <a href="https://intranet.acme-interne.test/rituel/standup-s21">standup S21</a>.</p>
<p>Sarah Chen</p>"#,
                    "Léa Martin <playground@demo.rustymail.app>, Camille Rousseau <c.rousseau@acme-interne.fr>, Julien Petit <j.petit@acme-interne.fr>",
                    "David Park <david@meridianpr.com>, Omar Diallo <omar@meridianpr.com>, Nina Costa <n.costa@acme-interne.fr>",
                    false,
                    Some("m-d-std-0"),
                ),
                demo_note(
                    "m-d-std-2",
                    "Omar Diallo",
                    "omar@meridianpr.com",
                    "RE: Compte-rendu standup — actions",
                    "2026-05-19T08:25:00Z",
                    "J’ajoute la revue NDA NovaTech sur la ligne de Léa. Maître Adel a répondu : ne pas céder sur la sous-traitance. Je peux prendre le suivi Achats si Léa est sur Globex.",
                    r#"<p>Sarah, Léa,</p>
<p>J’ajoute la revue NDA NovaTech. Maître Adel a répondu : <strong>ne pas céder sur la sous-traitance</strong>. Je peux prendre le suivi Achats si Léa est sur Globex ce matin.</p>
<p>Proposition :</p>
<ol>
<li>Léa : Globex, avant midi.</li>
<li>Omar : relance Achats sur la location 30 jours.</li>
<li>Sarah : le tableau d’actions reste la référence.</li>
</ol>
<p>Omar Diallo</p>"#,
                    "Sarah Chen <sarah@meridianpr.com>, Léa Martin <playground@demo.rustymail.app>",
                    "David Park <david@meridianpr.com>, Camille Rousseau <c.rousseau@acme-interne.fr>",
                    false,
                    Some("m-d-std-1"),
                ),
            ],
        ),
        bundle(
            account,
            mailbox,
            "demo-root-newsletter",
            "Partner News — Mai 2026",
            vec![
                demo_note(
                    "m-d-nl-1",
                    "Partner News",
                    "noreply@partner-news.io",
                    "Partner News — Mai 2026",
                    "2026-05-19T05:00:00Z",
                    "Mai 2026 : trois annonces partenaires, un webinaire jeudi, et le rappel des conditions de retrait de la liste.",
                    r#"<h2>Partner News — mai 2026</h2>
<p>Trois annonces cette semaine, plus un webinaire jeudi 10h.</p>
<table class="rm-mail-data"><thead><tr><th>Partenaire</th><th>Annonce</th><th>Lien</th></tr></thead><tbody>
<tr><td>Helio</td><td>Location serveurs 30 jours</td><td><a href="https://partner-news.test/helio-location">lire</a></td></tr>
<tr><td>NovaTech</td><td>Nouveau portail fournisseur</td><td><a href="https://partner-news.test/novatech-portail">lire</a></td></tr>
<tr><td>Globex</td><td>Fenêtre de recette paiements</td><td><a href="https://partner-news.test/globex-recette">lire</a></td></tr>
</tbody></table>
<p>Webinaire : <a href="https://partner-news.test/webinaire-mai">jeudi 10h, inscription</a>.</p>
<p><a href="https://partner-news.test/desinscription?id=demo">Se désinscrire</a></p>"#,
                    "Léa Martin <playground@demo.rustymail.app>",
                    "",
                    true,
                    None,
                ),
            ],
        ),
        bundle(
            account,
            mailbox,
            "demo-root-facture",
            "Facture hébergement — Mars 2026",
            vec![
                demo_note(
                    "m-d-fac-1",
                    "Facturation nuage",
                    "billing@example-cloud.fr",
                    "Facture hébergement — Mars 2026",
                    "2026-05-10T12:00:00Z",
                    "Facture F-2026-0312 disponible. Total 842,10 € TTC. Échéance le 25/05. Le détail par environnement est dans le tableau.",
                    r#"<p>Bonjour,</p>
<p>Votre facture <strong>F-2026-0312</strong> est disponible. Échéance : <strong>25/05/2026</strong>.</p>
<table class="rm-mail-data"><thead><tr><th>Environnement</th><th>Période</th><th>HT</th><th>TVA</th><th>TTC</th></tr></thead><tbody>
<tr><td>Préprod paiements</td><td>Mars</td><td>420,00 €</td><td>84,00 €</td><td>504,00 €</td></tr>
<tr><td>VPN partenaires</td><td>Mars</td><td>180,00 €</td><td>36,00 €</td><td>216,00 €</td></tr>
<tr><td>Journaux (rétention 30 j)</td><td>Mars</td><td>101,75 €</td><td>20,35 €</td><td>122,10 €</td></tr>
<tr><td>Total</td><td></td><td>701,75 €</td><td>140,35 €</td><td>842,10 €</td></tr>
</tbody></table>
<p>PDF et historique : <a href="https://factures.example-cloud.test/F-2026-0312">ouvrir F-2026-0312</a>.</p>
<p>Le prélèvement part le 25/05 si la facture n’est pas contestée d’ici là.</p>"#,
                    "Léa Martin <playground@demo.rustymail.app>, Finance <finance@acme-interne.fr>",
                    "Hugo Lambert <h.lambert@acme-interne.fr>",
                    true,
                    None,
                ),
            ],
        ),
        bundle(
            account,
            mailbox,
            "demo-root-client-nl",
            "Votre commande #44921 a été expédiée",
            vec![
                demo_note(
                    "m-d-shop-1",
                    "Boutique Atelier",
                    "commandes@boutique-auto.fr",
                    "Votre commande #44921 a été expédiée",
                    "2026-05-18T19:00:00Z",
                    "Votre colis a quitté le dépôt de Lyon. Suivi disponible. Deux articles, livraison estimée le 21/05.",
                    r#"<p>Bonjour Léa,</p>
<p>Votre commande <strong>#44921</strong> a quitté le dépôt de Lyon. Livraison estimée le <strong>21/05</strong>.</p>
<table class="rm-mail-data"><thead><tr><th>Article</th><th>Qté</th><th>Référence</th></tr></thead><tbody>
<tr><td>Câble console 1,8 m</td><td>2</td><td>CAB-18</td></tr>
<tr><td>Kit rails 1U</td><td>4</td><td>RL-1U</td></tr>
</tbody></table>
<p>Suivi transporteur : <a href="https://suivi.boutique-auto.test/44921">colis 44921</a>. Le bon de livraison reprend la même adresse que la commande d’avril.</p>
<p>Boutique Atelier</p>"#,
                    "Léa Martin <playground@demo.rustymail.app>",
                    "",
                    true,
                    None,
                ),
            ],
        ),
        bundle(
            account,
            mailbox,
            "demo-root-comite",
            "Comité de pilotage — décisions du 19/05",
            vec![
                demo_note(
                    "m-d-copil-1",
                    "Camille Rousseau",
                    "c.rousseau@acme-interne.fr",
                    "Comité de pilotage — décisions du 19/05",
                    "2026-05-19T11:30:00Z",
                    "Quatre décisions actées ce matin : fenêtre Globex, scope v2.3, location serveurs, et un seul départ en semaine 23. Le relevé est dans le message.",
                    r#"<p>Léa, Hugo, Julien, Nina, Chloé,</p>
<p>Relevé du comité de ce matin. Quatre décisions, un responsable chacune.</p>
<table class="rm-mail-data"><thead><tr><th>#</th><th>Décision</th><th>Responsable</th><th>Échéance</th></tr></thead><tbody>
<tr><td>1</td><td>Fenêtre Globex 21–22/05</td><td>Léa Martin</td><td>19/05 12h</td></tr>
<tr><td>2</td><td>v2.3 lundi, scope coupé</td><td>Julien Petit</td><td>19/05 17h</td></tr>
<tr><td>3</td><td>Location serveurs 30 jours</td><td>Nina Costa</td><td>20/05</td></tr>
<tr><td>4</td><td>Un seul départ en semaine 23</td><td>Chloé Marin</td><td>20/05 12h</td></tr>
</tbody></table>
<p>Compte-rendu complet : <a href="https://intranet.acme-interne.test/copil/2026-05-19">copil du 19/05</a>.</p>
<p>Les fils Globex, devis T4, VPN et NDA restent la source de détail. Ce message ne les remplace pas.</p>
<blockquote><p>Prochain comité : mardi 26/05, 9h30, seulement si une des quatre lignes est encore ouverte.</p></blockquote>
<p>Camille Rousseau</p>"#,
                    "Léa Martin <playground@demo.rustymail.app>, Hugo Lambert <h.lambert@acme-interne.fr>, Julien Petit <j.petit@acme-interne.fr>",
                    "Nina Costa <n.costa@acme-interne.fr>, Chloé Marin <c.marin@acme-interne.fr>, Karim Benali <k.benali@acme-interne.fr>",
                    false,
                    None,
                ),
                demo_note(
                    "m-d-copil-2",
                    "Léa Martin",
                    "playground@demo.rustymail.app",
                    "RE: Comité de pilotage — décisions du 19/05",
                    "2026-05-19T11:55:00Z",
                    "La ligne 1 est couverte : la fenêtre Globex est déjà partie dans le fil SLA. Je reste responsable du go / no-go de vendredi 16h avec Camille.",
                    r#"<p>Camille, Hugo, Julien,</p>
<p>La ligne 1 est couverte : la fenêtre <strong>21/05 14h – 22/05 18h</strong> est déjà dans le fil Globex. Je reste responsable du go / no-go de vendredi 16h avec Camille.</p>
<p>Point d’attention : la lecture juridique du 22/05 matin suppose que Maître Adel ait envoyé le contre-projet NDA. Sinon on découple les deux sujets.</p>
<p>Références :</p>
<ul>
<li><a href="https://intranet.globex-industrie.test/projets/paiements/sla">suivi SLA Globex</a></li>
<li><a href="https://intranet.acme-interne.test/copil/2026-05-19">relevé du comité</a></li>
</ul>
<p>Léa Martin</p>"#,
                    "Camille Rousseau <c.rousseau@acme-interne.fr>, Hugo Lambert <h.lambert@acme-interne.fr>, Julien Petit <j.petit@acme-interne.fr>",
                    "Nina Costa <n.costa@acme-interne.fr>, Chloé Marin <c.marin@acme-interne.fr>",
                    false,
                    Some("m-d-copil-1"),
                ),
            ],
        ),
    ]
}

fn insert_demo_dataset(
    tx: &rusqlite::Transaction<'_>,
    account_id: &str,
    mailbox: &str,
) -> Result<usize, rusqlite::Error> {
    let threads = professional_demo_threads(account_id, mailbox);
    let mut n = 0usize;
    let mut imap_uid: i64 = 900_000;

    for bundle in threads {
        let thread = bundle.thread;
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
                    header_or_none(bundle.headers.get(position).map(|(to, _)| to.as_str())),
                    header_or_none(bundle.headers.get(position).map(|(_, cc)| cc.as_str())),
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

fn header_or_none(value: Option<&str>) -> Option<String> {
    value
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(str::to_string)
}

fn purge_account_mail(
    tx: &rusqlite::Transaction<'_>,
    account_id: &str,
) -> Result<(), rusqlite::Error> {
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
    account
        .validate()
        .map_err(|e| format!("compte démo invalide: {e:?}"))?;

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
        crate::set_keyring_password(DEMO_PLAYGROUND_ACCOUNT_ID, "rustymail-demo-not-for-sync")?;
    }

    let tx = connection.transaction().map_err(|e| e.to_string())?;
    purge_account_mail(&tx, DEMO_PLAYGROUND_ACCOUNT_ID).map_err(|e| e.to_string())?;
    let n =
        insert_demo_dataset(&tx, DEMO_PLAYGROUND_ACCOUNT_ID, "INBOX").map_err(|e| e.to_string())?;
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

#[cfg(test)]
mod demo_rich_mail_tests {
    use std::collections::HashSet;

    use super::*;

    #[test]
    fn demo_threads_keep_tables_links_and_several_people() {
        let bundles = professional_demo_threads(DEMO_PLAYGROUND_ACCOUNT_ID, "INBOX");
        assert!(bundles.len() >= 12);

        let mut senders = HashSet::new();
        let mut with_table = 0usize;
        let mut with_link = 0usize;
        for bundle in &bundles {
            assert_eq!(bundle.thread.messages.len(), bundle.headers.len());
            for (msg, (to, cc)) in bundle.thread.messages.iter().zip(bundle.headers.iter()) {
                senders.insert(msg.sender.email.clone());
                let html = msg.html_body.as_deref().unwrap_or("");
                assert!(html.contains('<'), "{}", msg.id.0);
                if html.contains("<table") {
                    with_table += 1;
                }
                if html.contains("href=") {
                    with_link += 1;
                }
                assert!(!to.trim().is_empty(), "{}", msg.id.0);
                let _ = cc;
                assert!(msg.plain_body.chars().count() > 80, "{}", msg.id.0);
            }
        }
        assert!(senders.len() >= 12, "participants: {}", senders.len());
        assert!(with_table >= 8, "tables: {with_table}");
        assert!(with_link >= 10, "links: {with_link}");

        let globex = bundles
            .iter()
            .find(|b| b.thread.subject.contains("Globex"))
            .expect("fil Globex");
        assert!(globex.thread.messages.len() >= 3);
        let last = globex.thread.messages.last().unwrap();
        let cleaned = rustymail_modules::clean_message(last);
        let html = cleaned.cleaned_html_body.expect("html nettoyé");
        assert!(html.contains("<table"), "{html}");
        assert!(html.contains("rm-mail-data"), "{html}");
        assert!(html.contains("href="), "{html}");
        assert!(cleaned.recipients.len() >= 2);
    }
}
