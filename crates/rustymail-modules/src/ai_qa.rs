use std::convert::Infallible;
use std::ops::ControlFlow;
use std::sync::atomic::AtomicBool;

use serde::Deserialize;

use crate::ai_llm_contracts::{validate_qa_llm_shape, QA_THREAD_JSON_GBNF};
use crate::ai_llm_util::{
    budget_report, cancelled_llm_err, gen_params_json_for_prompt, parse_model_json, stream_chunk_or_cancel,
    truncate_chars, untrusted_mail_for_engine,
};
use rustymail_domain::ThreadQaAnswer;
use rustymail_llm::{LlmEngine, LlmError};

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct QaDto {
    answer: String,
    #[serde(default)]
    evidence_message_ids: Vec<String>,
}

fn qa_system(output_language: &str) -> String {
    crate::prompts::system_prompt_for_language("qa", output_language)
}

fn qa_from_raw(
    raw: &str,
    engine: &mut LlmEngine,
    system: &str,
    user: &str,
    tx: &str,
    thread_transcript: &str,
) -> Result<ThreadQaAnswer, LlmError> {
    let dto: QaDto = parse_model_json(raw)?;
    validate_qa_llm_shape(&dto.answer, &dto.evidence_message_ids)?;
    let ev: Vec<String> = dto
        .evidence_message_ids
        .into_iter()
        .filter(|id| tx.contains(id.as_str()))
        .take(8)
        .collect();

    Ok(ThreadQaAnswer {
        answer: dto.answer.trim().to_string(),
        evidence_message_ids: ev,
        budget: budget_report(
            engine.n_ctx(),
            engine,
            system,
            user,
            Some(raw),
            thread_transcript.chars().count() > 40_000,
        ),
    })
}

pub fn qa_thread_with_llm(
    engine: &mut LlmEngine,
    thread_transcript: &str,
    question: &str,
    output_language: &str,
) -> Result<ThreadQaAnswer, LlmError> {
    let system = qa_system(output_language);
    let tx = truncate_chars(thread_transcript, 40_000);
    let user = format!(
        "{}\n\nUSER QUESTION:\n{}",
        untrusted_mail_for_engine(engine, "thread-qa", &tx),
        question.trim()
    );
    let params = gen_params_json_for_prompt(engine, system.as_str(), &user, 512, 4096);
    let raw = engine.generate_with_schema(system.as_str(), &user, &params, QA_THREAD_JSON_GBNF)?;
    qa_from_raw(&raw, engine, system.as_str(), &user, &tx, thread_transcript)
}

pub fn qa_thread_with_llm_streaming(
    engine: &mut LlmEngine,
    thread_transcript: &str,
    question: &str,
    output_language: &str,
    cancelled: &AtomicBool,
    mut on_chunk: impl FnMut(&str),
) -> Result<ThreadQaAnswer, LlmError> {
    let system = qa_system(output_language);
    let tx = truncate_chars(thread_transcript, 40_000);
    let user = format!(
        "{}\n\nUSER QUESTION:\n{}",
        untrusted_mail_for_engine(engine, "thread-qa", &tx),
        question.trim()
    );
    let params = gen_params_json_for_prompt(engine, system.as_str(), &user, 512, 4096);
    let raw = engine.generate_streaming_with_schema(
        system.as_str(),
        &user,
        &params,
        QA_THREAD_JSON_GBNF,
        |piece| -> ControlFlow<Result<(), Infallible>> {
            stream_chunk_or_cancel(cancelled, piece, &mut on_chunk)
        },
    )?;
    if let Some(e) = cancelled_llm_err(cancelled) {
        return Err(e);
    }
    qa_from_raw(&raw, engine, system.as_str(), &user, &tx, thread_transcript)
}
