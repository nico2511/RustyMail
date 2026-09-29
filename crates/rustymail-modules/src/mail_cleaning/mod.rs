//! Nettoyage HTML des mails : pipeline générique, plugins expéditeur, signatures HTML.
//!
//! ## Trois couches (ne pas confondre)
//!
//! | Couche | Module | Rôle |
//! |--------|--------|------|
//! | **HTML** | [`pipeline`](pipeline), [`generic`](generic), [`signature_html`](signature_html) | Produit `cleanedHtmlBody` (discussion : citations pliées, signature atténuée) |
//! | **Texte** | [`reading_text`](reading_text) si HTML, sinon plain (`signature_detection`, `quote_collapse`) | `cleanedText` = substance visible du corps affiché |
//! | **Affichage** | DOMPurify + shadow `.mail` | Sécurité ; `.rm-mail-folded-quote` se déplie, `.rm-mail-signature` est masquée |
//!
//! Le générique sert la **lecture en discussion**. Les digests ne s’étendent pas au courrier personne-à-personne. Deblock est une fixture ; Amazon et GitHub restent des plugins.
//!
//! ## Ordre du pipeline HTML ([`clean_html_for_markdown`](pipeline::clean_html_for_markdown))
//!
//! 1. [`generic::generic_html_clean`] — MSO/VML, citations Gmail/Apple repliées, scripts, trackers
//! 2. Fixture locale seulement si « Activer en lecture » a installé un YAML déjà accepté — sinon cette étape est vide
//! 3. Plugin si détecté (Amazon, GitHub, fixture Deblock) — digest structuré, inchangé ensuite
//! 4. Garde qualité (masse de texte)
//! 5. [`generic::finalize_html_for_display`] — prune vide, historique cité replié (`rm-mail-folded-quote`), [`signature_html::fold_signature_tail`], attrs, lisibilité
//!
//! Digests tagués `rustymail:digest` (et, le temps de la bascule, `rustymail:amazon-digest` / `rustymail:deblock-digest` / `rustymail:github-digest`) : pas de strip agressif en finalize.
//!
//! Deblock est une fixture YAML ([`digest_fixtures`]). Amazon et GitHub restent des plugins. Le générique ne gagne pas ce rendu.

pub mod digest_fixtures;
mod dom;
mod error;
mod generic;
mod outlook_conversation;
mod outlook_forward;
pub mod pipeline;
pub mod providers;
mod quoted_history;
mod reading_text;
mod registry;
pub mod signature_html;
mod traits;
pub mod types;

pub use digest_fixtures::apply_fixture_yaml;
pub use pipeline::{clean_html_builtin, clean_html_for_markdown};
pub use reading_text::reading_text_from_cleaned_html;
pub use registry::{ProviderRegistry, RegisteredProvider};
pub use signature_html::fold_signature_tail;
pub use traits::{ProviderCleaner, ProviderDetector};
pub use types::{CleanHtmlResult, CleaningInput, DetectionConfidence, ProviderId};
