use crate::ai_llm_util::{gen_params_text_for_prompt, truncate_chars};
use rustymail_llm::{LlmEngine, LlmError};

/// Résumé digest boîte (Markdown court) à partir de lignes déjà préparées côté appli (titres/apercus ou similaires).
pub fn inbox_digest_with_llm(
    engine: &mut LlmEngine,
    mailbox_thread_lines: &str,
    account_id: &str,
    mailbox: &str,
    output_language: &str,
) -> Result<String, LlmError> {
    let snapshot = truncate_chars(mailbox_thread_lines, 96_000);
    let system = crate::prompts::system_prompt_for_language("inbox_digest", output_language);
    let user = format!(
        "compte_hint={account_id}\nmailbox_hint={mailbox}\n\nLISTE FILS / APERÇUS (une entrée ou une ligne courte par élément):\n\n{snapshot}"
    );

    let raw = engine.generate(
        system.as_str(),
        &user,
        &gen_params_text_for_prompt(engine, system.as_str(), &user, 512, 2048),
    )?;
    Ok(raw.trim().chars().take(128_000).collect())
}
