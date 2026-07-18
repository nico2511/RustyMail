//! Nettoyage HTML des mails : pipeline générique, plugins expéditeur, signatures HTML.
//!
//! ## Trois couches (ne pas confondre)
//!
//! | Couche | Module | Rôle |
//! |--------|--------|------|
//! | **HTML** | [`pipeline`](pipeline), [`generic`](generic), [`signature_html`](signature_html) | Produit `cleanedHtmlBody` (sanitize, Outlook/Gmail, prune, signature) |
//! | **Texte brut** | `crate::signature_detection`, `crate::quote_collapse` | `cleanedText` quand pas de HTML MIME |
//! | **Affichage** | DOMPurify + shadow `.mail` dans `main.ts` | Sécurité, masque `.gmail_quote` / `.rm-mail-signature` (filet) |
//!
//! ## Ordre du pipeline HTML ([`clean_html_for_markdown`](pipeline::clean_html_for_markdown))
//!
//! 1. [`generic::generic_html_clean`] — MSO/VML, Gmail quotes, scripts, trackers
//! 2. Plugin si détecté (Amazon, Deblock) — digest structuré
//! 3. Garde qualité (masse de texte)
//! 4. [`generic::finalize_html_for_display`] — prune vide, [`signature_html::fold_signature_tail`], attrs, lisibilité
//!
//! Digests tagués `rustymail:amazon-digest` / `rustymail:deblock-digest` / `rustymail:github-digest` : pas de strip agressif en finalize.

mod dom;
mod error;
mod generic;
mod outlook_conversation;
mod outlook_forward;
pub mod pipeline;
pub mod providers;
mod registry;
pub mod signature_html;
mod traits;
pub mod types;

pub use pipeline::{clean_html_builtin, clean_html_for_markdown};
pub use registry::{ProviderRegistry, RegisteredProvider};
pub use signature_html::fold_signature_tail;
pub use traits::{ProviderCleaner, ProviderDetector};
pub use types::{CleanHtmlResult, CleaningInput, DetectionConfidence, ProviderId};
