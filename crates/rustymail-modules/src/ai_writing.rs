use serde::Deserialize;

use crate::ai_llm_contracts::{introduces_llm_meta, validate_rewrite_llm_shape};
use crate::ai_llm_util::{
    budget_report, gen_params_json_echo_for_prompt, parse_model_json, truncate_chars,
    untrusted_mail_for_engine,
};
use rustymail_domain::{RewriteResult, RewriteStyle};
use rustymail_llm::{LlmEngine, LlmError};

const REWRITE_META_ERR: &str = "Réécriture refusée : le modèle a renvoyé une consigne (format JSON, message système) au lieu du texte. Le message n’a pas été modifié.";
const REWRITE_PARSE_ERR: &str = "Réécriture impossible : la réponse du modèle n’était pas un texte exploitable. Le message n’a pas été modifié.";

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct RewriteDto {
    text: String,
}

fn rewrite_once(
    engine: &mut LlmEngine,
    system: &str,
    user: &str,
    source: &str,
    clipped: &str,
) -> Result<String, LlmError> {
    let raw = engine.generate(
        system,
        user,
        &gen_params_json_echo_for_prompt(engine, system, user, clipped, 512, 8192),
    )?;
    let dto: RewriteDto = parse_model_json(&raw)?;
    let text = dto.text.trim().to_string();
    validate_rewrite_llm_shape(&text)?;
    if introduces_llm_meta(source, &text) {
        return Err(LlmError::InvalidJson("meta-leak".into()));
    }
    Ok(text)
}

pub fn rewrite_with_llm(
    engine: &mut LlmEngine,
    text: &str,
    style: RewriteStyle,
    output_language: &str,
) -> Result<RewriteResult, LlmError> {
    let style_name = match style {
        RewriteStyle::Neutral => "Neutral",
        RewriteStyle::Formal => "Formal",
        RewriteStyle::Casual => "Casual",
        RewriteStyle::Concise => "Concise",
        RewriteStyle::Polite => "Polite",
        RewriteStyle::Assertive => "Assertive",
        RewriteStyle::Apologetic => "Apologetic",
    };

    let system = crate::prompts::system_prompt_for_language("writing", output_language);
    let clipped = truncate_chars(text, 48_000);
    let user = format!(
        "Desired style: {style_name}\nRewrite only the draft inside the markers. The JSON text value is that rewrite and nothing else.\n{}",
        untrusted_mail_for_engine(engine, "rewrite-input", &clipped)
    );

    let rewritten = match rewrite_once(engine, system.as_str(), &user, text, &clipped) {
        Ok(t) => t,
        Err(LlmError::InvalidJson(msg)) => {
            let user_retry = format!(
                "{user}\n\nRetry: return only {{\"text\":\"…\"}}. The text value is the rewritten email. Do not mention JSON, the system message, or reliability."
            );
            match rewrite_once(engine, system.as_str(), &user_retry, text, &clipped) {
                Ok(t) => t,
                Err(LlmError::InvalidJson(msg2))
                    if msg2.contains("meta") || msg.contains("meta") =>
                {
                    return Err(LlmError::Msg(REWRITE_META_ERR.into()));
                }
                Err(LlmError::InvalidJson(_)) => {
                    return Err(LlmError::Msg(REWRITE_PARSE_ERR.into()));
                }
                Err(e) => return Err(e),
            }
        }
        Err(e) => return Err(e),
    };

    let text_out = rewritten.trim().to_string();
    let budget = budget_report(
        engine.n_ctx(),
        engine,
        system.as_str(),
        &user,
        Some(text_out.as_str()),
        text.chars().count() > 48_000,
    );
    Ok(RewriteResult {
        text: text_out,
        style,
        budget,
    })
}

pub fn rewrite_stub(text: &str, style: RewriteStyle) -> RewriteResult {
    use rustymail_domain::TokenBudgetReport;

    RewriteResult {
        text: text.to_string(),
        style,
        budget: TokenBudgetReport::empty_stub(),
    }
}
