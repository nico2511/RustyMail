//! Registre déclaratif des digests transactionnels (phase 1).
//!
//! Une fixture YAML décrit le match (domaine + structure) et trois zones
//! (`show`, `hide`, ou `collapse`). La lecture l'applique sans modèle.
//! Le courrier personne-à-personne ne passe pas ici : pas de fixture, pas de
//! réécriture. Amazon et GitHub restent des plugins ad hoc.
//!
//! Banc d'essai (Paramètres) : [`preview_candidate_fixture`] rejoue un YAML
//! sans l'activer. La lecture locale n'est installée que par un geste explicite.

mod apply;
mod model;
pub mod proposal;

use std::sync::{Mutex, OnceLock};

pub use model::{
    parse_fixture, AnchorRole, DigestFixture, FixtureError, ZoneAction, ZonePresentation,
};
pub use proposal::{
    analyze_html_structure_heuristic, empty_or_invalid_proposal_does_not_apply, french_explanation,
    proposal_to_fixture_yaml, structure_outline_for_llm, DigestCutProposal, ProposalSource,
};

const DEBLOCK_FIXTURE_YAML: &str = include_str!("../../../fixtures/digests/deblock.yaml");

fn builtin_fixtures() -> &'static [DigestFixture] {
    static FIXTURES: OnceLock<Vec<DigestFixture>> = OnceLock::new();
    FIXTURES
        .get_or_init(|| {
            let deblock = parse_fixture(DEBLOCK_FIXTURE_YAML)
                .expect("fixture Deblock embarquée : YAML refusé");
            vec![deblock]
        })
        .as_slice()
}

/// Marqueur digest (nouveau préfixe, plus les trois historiques).
pub(crate) fn html_has_digest_marker(html: &str) -> bool {
    html.contains("rustymail:digest")
        || html.contains("rustymail:amazon-digest")
        || html.contains("rustymail:deblock-digest")
        || html.contains("rustymail:github-digest")
}

pub(crate) fn class_is_digest_article(class: &str) -> bool {
    class == "rm-digest"
        || class == "rm-amazon-digest"
        || class == "rm-deblock-digest"
        || class == "rm-github-digest"
}

pub(crate) fn builtin_rule_set_version(id: &str) -> Option<&'static str> {
    builtin_fixtures()
        .iter()
        .find(|fixture| fixture.id == id)
        .map(|fixture| fixture.rule_set_version.as_str())
}

pub(crate) fn builtin_sender_matches(id: &str, sender_email: &str) -> bool {
    builtin_fixtures().iter().any(|fixture| {
        fixture.id == id && apply::sender_specificity(sender_email, fixture).is_some()
    })
}

/// Applique la fixture embarquée `id` si le domaine et la structure tiennent.
pub(crate) fn apply_builtin_id(id: &str, html: &str, sender_email: &str) -> Option<String> {
    let selected: Vec<DigestFixture> = builtin_fixtures()
        .iter()
        .filter(|fixture| fixture.id == id)
        .cloned()
        .collect();
    apply::apply_fixtures(&selected, html, sender_email)
}

/// Aperçu banc d'essai : YAML valide ou non, sans écrire le registre de lecture.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct FixturePreview {
    pub applicable: bool,
    pub html: Option<String>,
    pub fixture_id: Option<String>,
    pub error: Option<String>,
}

/// Résultat d'une fixture explicitement activée pour la lecture.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AppliedReading {
    pub fixture_id: String,
    pub html: String,
}

/// Point d'entrée du harness et du banc d'essai.
///
/// `Ok(None)` : le YAML est valide, le mail ne matche pas (repli générique).
/// `Err` : YAML illisible ou schéma refusé. Aucun appel de modèle.
pub fn apply_fixture_yaml(
    yaml: &str,
    html: &str,
    sender_email: &str,
) -> Result<Option<String>, FixtureError> {
    let fixture = parse_fixture(yaml)?;
    Ok(apply::apply_fixtures(
        std::slice::from_ref(&fixture),
        html,
        sender_email,
    ))
}

/// Même aperçu, après le nettoyage générique (comme le chemin de lecture).
pub fn preview_candidate_fixture(yaml: &str, raw_html: &str, sender_email: &str) -> FixturePreview {
    let cleaned = super::generic::generic_html_clean(raw_html);
    match parse_fixture(yaml) {
        Ok(fixture) => {
            let id = fixture.id.clone();
            let rendered = apply::apply_fixtures(std::slice::from_ref(&fixture), &cleaned, sender_email)
                .or_else(|| apply::apply_ignoring_sender(&fixture, &cleaned));
            match rendered {
                Some(html) => FixturePreview {
                    applicable: true,
                    html: Some(html),
                    fixture_id: Some(id),
                    error: None,
                },
                None => FixturePreview {
                    applicable: false,
                    html: None,
                    fixture_id: Some(id),
                    error: None,
                },
            }
        }
        Err(error) => FixturePreview {
            applicable: false,
            html: None,
            fixture_id: None,
            error: Some(error.to_string()),
        },
    }
}

/// Fixture locale activée pour la lecture. Vide par défaut.
/// Accepter une fixture sur le banc n'appelle pas cette fonction.
static READING_FIXTURE: Mutex<Option<DigestFixture>> = Mutex::new(None);

pub fn set_installed_reading_fixture(fixture: Option<DigestFixture>) {
    if let Ok(mut slot) = READING_FIXTURE.lock() {
        *slot = fixture;
    }
}

pub fn installed_reading_fixture_id() -> Option<String> {
    READING_FIXTURE
        .lock()
        .ok()
        .and_then(|slot| slot.as_ref().map(|fixture| fixture.id.clone()))
}

pub fn apply_installed_reading_fixture(html: &str, sender_email: &str) -> Option<AppliedReading> {
    let fixture = READING_FIXTURE.lock().ok()?.as_ref().cloned()?;
    let html = apply::apply_fixtures(std::slice::from_ref(&fixture), html, sender_email)?;
    Some(AppliedReading {
        fixture_id: fixture.id,
        html,
    })
}

pub fn builtin_deblock_fixture_yaml() -> &'static str {
    DEBLOCK_FIXTURE_YAML
}

#[cfg(test)]
mod tests {
    use super::{
        apply, apply_builtin_id, apply_fixture_yaml, html_has_digest_marker, parse_fixture,
        preview_candidate_fixture, set_installed_reading_fixture, DEBLOCK_FIXTURE_YAML,
    };
    use crate::mail_cleaning::{
        clean_html_for_markdown, CleaningInput, ProviderId, ProviderRegistry,
    };

    const RECEIVE: &str = include_str!("../../../tests/fixtures/deblock/receive_200eur.html");
    const SEND: &str = include_str!("../../../tests/fixtures/deblock/send_200eur.html");
    const SKETCH: &str = include_str!("../../../../../docs/cadrage/digest-template.exemple.yaml");

    #[test]
    fn deblock_receive_and_send_match_the_plugin_shape() {
        let receive = apply_builtin_id("deblock", RECEIVE, "support@deblock.com").expect("reçu");
        assert!(receive.contains("rustymail:digest id=\"deblock\""));
        assert!(receive.contains("rustymail:deblock-digest"));
        assert!(receive.contains("rm-digest"));
        assert!(receive.contains("rm-deblock-digest"));
        assert!(receive.contains("+ 200 EUR"));
        assert!(receive.contains("IBAN"));
        assert!(receive.contains("Pat DOE"));
        assert!(receive.contains("<table>") && receive.contains("scope=\"row\""));
        assert!(!receive.contains("Marketing footer"));

        let send = apply_builtin_id("deblock", SEND, "alerts@mail.deblock.com").expect("envoi");
        assert!(send.contains("Virement envoyé"));
        assert!(send.contains("Montant Envoyé"));
        assert!(send.contains("ID de l'ordre de traitement"));
        assert!(send.contains("200 EUR"));
    }

    #[test]
    fn cadrage_sketch_applies_to_the_same_samples() {
        let receive = apply_fixture_yaml(SKETCH, RECEIVE, "support@deblock.com")
            .expect("esquisse")
            .expect("reçu");
        assert!(receive.contains("rustymail:digest id=\"deblock\""));
        assert!(receive.contains("+ 200 EUR"));
        assert!(receive.contains("IBAN"));
        assert!(!receive.contains("Marketing footer"));
        assert!(
            !receive.contains("rustymail:deblock-digest"),
            "l'esquisse n'a pas de marqueur historique"
        );

        let send = apply_fixture_yaml(SKETCH, SEND, "support@deblock.com")
            .expect("esquisse")
            .expect("envoi");
        assert!(send.contains("Montant Envoyé"));
        assert!(send.contains("Destinataire"));
    }

    #[test]
    fn fail_closed_without_sender_or_structure() {
        assert!(apply_builtin_id("deblock", RECEIVE, "ami@example.com").is_none());
        assert!(apply_builtin_id("deblock", RECEIVE, "deblock.com").is_none());
        let not_the_pattern = "<div class=\"f-fallback\"><p>On se voit demain ?</p></div>";
        assert!(apply_builtin_id("deblock", not_the_pattern, "support@deblock.com").is_none());
        let thread = "<div class=\"gmail_quote\"><p>Re: le fil</p></div>";
        assert!(
            apply_fixture_yaml(DEBLOCK_FIXTURE_YAML, thread, "pat@example.com")
                .expect("yaml")
                .is_none()
        );
    }

    #[test]
    fn read_path_keeps_deblock_and_drops_weak_sender() {
        let reg = ProviderRegistry::builtin();
        let strong = CleaningInput {
            sender_email: "support@deblock.com",
            subject: "Vous allez recevoir 200 EUR",
            html_preview: Some(RECEIVE),
            plain_body: None,
        };
        let cut = clean_html_for_markdown(&reg, &strong, RECEIVE);
        assert_eq!(cut.resolved_provider, ProviderId::Deblock);
        assert!(cut.html.contains("rustymail:deblock-digest"));
        assert!(cut.html.contains("+ 200 EUR"));
        assert!(!cut.html.contains("Marketing footer"));

        let weak = CleaningInput {
            sender_email: "ami@example.com",
            subject: "mon virement deblock",
            html_preview: Some(RECEIVE),
            plain_body: None,
        };
        let generic = clean_html_for_markdown(&reg, &weak, RECEIVE);
        assert_eq!(generic.resolved_provider, ProviderId::Generic);
        assert!(!html_has_digest_marker(&generic.html));
        assert!(generic.html.contains("Marketing footer"));
    }

    #[test]
    fn longest_sender_wins_and_structure_failure_falls_through() {
        let broad = r#"
id: broad
rule_set_version: "1"
match:
  sender:
    domains:
      - suffix: .example.com
  structure:
    root: div.f-fallback
    min_children: 1
zones:
  header:
    action: show
    presentation: as_is
    anchors:
      - selector: h3
        index: 0
  body:
    action: show
    presentation: as_is
    anchors:
      - selector: p
        index: 0
  footer:
    action: hide
"#;
        let narrow = r#"
id: narrow
rule_set_version: "1"
match:
  sender:
    domains:
      - exact: pay.example.com
  structure:
    root: article.missing
zones:
  header:
    action: show
    presentation: as_is
    anchors:
      - selector: h3
  body:
    action: show
    presentation: as_is
    anchors:
      - selector: p
  footer:
    action: hide
"#;
        let html = "<div class=\"f-fallback\"><h3>Titre</h3><p>Corps</p></div>";
        assert!(
            apply_fixture_yaml(narrow, html, "pay@pay.example.com")
                .expect("narrow")
                .is_none(),
            "ancre de structure absente : pas de digest"
        );

        let broad_hit = apply_fixture_yaml(broad, html, "pay@pay.example.com")
            .expect("broad")
            .expect("suffixe");
        assert!(broad_hit.contains("id=\"broad\""));
        assert!(broad_hit.contains("Titre"));
        assert!(broad_hit.contains("Corps"));

        let fixtures = vec![
            parse_fixture(broad).expect("broad"),
            parse_fixture(narrow).expect("narrow"),
        ];
        let fallen = apply::apply_fixtures(&fixtures, html, "pay@pay.example.com").expect("repli");
        assert!(
            fallen.contains("id=\"broad\""),
            "la fixture la plus spécifique ne tient pas : on essaie la suivante"
        );
        assert!(apply::apply_fixtures(&fixtures, html, "pat@example.net").is_none());
    }

    #[test]
    fn collapse_is_a_closed_details_and_text_is_escaped() {
        let yaml = r#"
id: stub
rule_set_version: "1"
match:
  sender:
    domains:
      - exact: example.com
  structure:
    root: div.f-fallback
    min_children: 1
zones:
  header:
    action: collapse
    presentation: as_is
    anchors:
      - selector: h3
        index: 0
  body:
    action: show
    presentation: as_is
    anchors:
      - selector: p
        index: 0
  footer:
    action: hide
    anchors:
      - selector: div
        class_contains: warning
"#;
        let html = "<div class=\"f-fallback\"><h3>&#60;script&#62;</h3><p>Corps</p><div class=\"warning\">Secret pied</div></div>";
        let out = apply_fixture_yaml(yaml, html, "a@example.com")
            .expect("yaml")
            .expect("digest");
        assert!(out.contains("<details class=\"rm-digest-collapsed\">"));
        assert!(out.contains("&lt;script&gt;"));
        assert!(!out.contains("<script>"));
        assert!(out.contains("Corps"));
        assert!(!out.contains("Secret pied"));
        assert!(!out.contains("<details open"));
    }

    #[test]
    fn rejects_a_free_selector() {
        let yaml = r#"
id: bad
rule_set_version: "1"
match:
  sender:
    domains:
      - exact: example.com
  structure:
    root: "div > p"
zones:
  header:
    action: show
  body:
    action: show
  footer:
    action: hide
"#;
        let err = apply_fixture_yaml(yaml, "<p>x</p>", "a@example.com").expect_err("sélecteur");
        let message = err.to_string();
        assert!(
            message.contains("sélecteur") || message.contains("refusé"),
            "{message}"
        );
    }

    struct ClearReading;
    impl Drop for ClearReading {
        fn drop(&mut self) {
            set_installed_reading_fixture(None);
        }
    }

    #[test]
    fn explicit_reading_fixture_applies_only_while_installed() {
        let _clear = ClearReading;
        set_installed_reading_fixture(None);
        let yaml = r#"
id: bench-bank
rule_set_version: "1"
match:
  sender:
    domains:
      - exact: bench-fixture.invalid
  structure:
    root: div.f-fallback
    min_children: 1
zones:
  header:
    action: show
    presentation: as_is
    anchors:
      - selector: h3
        index: 0
  body:
    action: show
    presentation: as_is
    anchors:
      - selector: p
        index: 0
  footer:
    action: hide
"#;
        let html = "<div class=\"f-fallback\"><h3>Titre</h3><p>Corps</p><div class=\"warning\">Pied</div></div>";
        let input = CleaningInput {
            sender_email: "a@bench-fixture.invalid",
            subject: "releve",
            html_preview: Some(html),
            plain_body: None,
        };
        let reg = ProviderRegistry::builtin();
        let before = clean_html_for_markdown(&reg, &input, html);
        assert_eq!(before.resolved_provider, ProviderId::Generic);
        assert!(!html_has_digest_marker(&before.html));

        let preview = preview_candidate_fixture(yaml, html, "a@bench-fixture.invalid");
        assert!(preview.applicable);
        assert!(preview.html.unwrap().contains("Titre"));
        assert!(super::installed_reading_fixture_id().is_none());

        set_installed_reading_fixture(Some(parse_fixture(yaml).expect("yaml")));
        let enabled = clean_html_for_markdown(&reg, &input, html);
        assert!(html_has_digest_marker(&enabled.html));
        assert!(enabled.html.contains("Titre"));
        assert!(!enabled.html.contains("Pied"));

        set_installed_reading_fixture(None);
        let after = clean_html_for_markdown(&reg, &input, html);
        assert!(!html_has_digest_marker(&after.html));
    }

    #[test]
    fn preview_reuses_a_template_from_another_sender() {
        let yaml = r#"
id: facture-gabarit
rule_set_version: "1"
match:
  sender:
    domains:
      - exact: autre-enseigne.example
  structure:
    root: div.letter
    min_children: 2
zones:
  header:
    action: show
    presentation: as_is
    anchors:
      - selector: h1
        index: 0
  body:
    action: show
    presentation: as_is
    anchors:
      - selector: p
        index: 0
  footer:
    action: hide
"#;
        let html = r#"<div class="letter"><h1>Duplicata</h1><p>Total 10</p><div class="foot">Mentions</div></div>"#;
        let preview = preview_candidate_fixture(yaml, html, "client@magasin-exemple.fr");
        assert!(preview.applicable, "{:?}", preview.error);
        let rendered = preview.html.expect("html");
        assert!(rendered.contains("Duplicata"));
        assert!(rendered.contains("Total 10"));
        assert!(!rendered.contains("Mentions"));

        let reg = ProviderRegistry::builtin();
        let input = CleaningInput {
            sender_email: "client@magasin-exemple.fr",
            subject: "facture",
            html_preview: Some(html),
            plain_body: None,
        };
        set_installed_reading_fixture(Some(parse_fixture(yaml).expect("yaml")));
        let live = clean_html_for_markdown(&reg, &input, html);
        assert!(!html_has_digest_marker(&live.html));
        set_installed_reading_fixture(None);
    }
}
