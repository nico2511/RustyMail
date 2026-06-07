use serde::Deserialize;

use crate::ai_llm_contracts::validate_contact_profile_shape;
use crate::ai_llm_util::{
    gen_params_json_for_prompt, parse_model_json, truncate_chars, untrusted_mail_for_engine,
    user_text_for_engine,
};
use rustymail_llm::{LlmEngine, LlmError};

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ContactProfileResult {
    pub summary: String,
    pub topics: Vec<String>,
    pub suggested_tone: String,
    pub is_auto_likely: bool,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ContactProfileDto {
    summary: String,
    topics: Vec<String>,
    suggested_tone: String,
    is_auto_likely: bool,
}

pub fn contact_profile_with_llm(
    engine: &mut LlmEngine,
    email: &str,
    message_samples: &str,
    output_language: &str,
) -> Result<ContactProfileResult, LlmError> {
    let samples = truncate_chars(message_samples, 16_000);
    let system = crate::prompts::system_prompt_for_language("contact_profile", output_language);
    let user = format!(
        "Contact : {}\n\n{}",
        user_text_for_engine(engine, email.trim()),
        untrusted_mail_for_engine(engine, "contact-samples", &samples)
    );
    let raw = engine.generate(
        system.as_str(),
        &user,
        &gen_params_json_for_prompt(engine, system.as_str(), &user, 256, 1024),
    )?;
    let dto: ContactProfileDto = parse_model_json(&raw)?;
    validate_contact_profile_shape(&dto.summary, &dto.topics, &dto.suggested_tone)?;
    Ok(ContactProfileResult {
        summary: dto.summary.trim().chars().take(500).collect(),
        topics: dto
            .topics
            .into_iter()
            .map(|t| t.trim().chars().take(80).collect())
            .filter(|t: &String| !t.is_empty())
            .take(5)
            .collect(),
        suggested_tone: if dto.suggested_tone.trim().is_empty() {
            "neutre".into()
        } else {
            dto.suggested_tone.trim().chars().take(40).collect()
        },
        is_auto_likely: dto.is_auto_likely,
    })
}
