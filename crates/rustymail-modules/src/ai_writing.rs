use serde::Deserialize;

use crate::ai_llm_contracts::validate_rewrite_llm_shape;
use crate::ai_llm_util::{
    budget_report, gen_params_json_echo_for_prompt, parse_model_json, truncate_chars,
    untrusted_mail_for_engine,
};
use rustymail_domain::{RewriteResult, RewriteStyle};
use rustymail_llm::{LlmEngine, LlmError};

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct RewriteDto {
    text: String,
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
        "Desired style: {style_name}\n{}",
        untrusted_mail_for_engine(engine, "rewrite-input", &clipped)
    );

    let raw = engine.generate(
        system.as_str(),
        &user,
        &gen_params_json_echo_for_prompt(engine, system.as_str(), &user, &clipped, 512, 8192),
    )?;
    let dto: RewriteDto = parse_model_json(&raw)?;
    validate_rewrite_llm_shape(&dto.text)?;
    Ok(RewriteResult {
        text: dto.text.trim().to_string(),
        style,
        budget: budget_report(
            engine.n_ctx(),
            engine,
            system.as_str(),
            &user,
            Some(dto.text.as_str()),
            text.chars().count() > 48_000,
        ),
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
