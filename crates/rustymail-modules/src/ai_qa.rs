use std::convert::Infallible;
use std::ops::ControlFlow;
use std::sync::atomic::AtomicBool;

use serde::Deserialize;

use crate::ai_llm_contracts::{introduces_llm_meta, validate_qa_llm_shape, QA_THREAD_JSON_GBNF};
use crate::ai_llm_util::{
    budget_report, cancelled_llm_err, gen_params_json_for_prompt, parse_model_json,
    stream_chunk_or_cancel, truncate_chars, untrusted_mail_for_engine,
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

const QA_META_ERR: &str =
    "Réponse refusée : le modèle a renvoyé un refus ou une consigne au lieu d’une réponse fondée sur le fil. Réessayez.";

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
    if introduces_llm_meta(tx, dto.answer.trim()) {
        return Err(LlmError::Msg(QA_META_ERR.into()));
    }
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
    match qa_from_raw(&raw, engine, system.as_str(), &user, &tx, thread_transcript) {
        Err(LlmError::Msg(m)) if m == QA_META_ERR => {
            let raw2 = engine.generate_with_schema(
                system.as_str(),
                &user,
                &params,
                QA_THREAD_JSON_GBNF,
            )?;
            qa_from_raw(
                &raw2,
                engine,
                system.as_str(),
                &user,
                &tx,
                thread_transcript,
            )
        }
        other => other,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn qa_rejects_model_refusal_in_answer() {
        let tx = "[message_id=m1] Paul propose mardi.";
        let raw = r#"{"answer":"I cannot comply with this request.","evidenceMessageIds":[]}"#;
        let err = qa_from_raw(
            raw,
            &mut LlmEngine::open_ai_compatible(
                "http://127.0.0.1:8080/v1".into(),
                "test".into(),
                String::new(),
            )
            .expect("engine"),
            "sys",
            "user",
            tx,
            tx,
        )
        .expect_err("refusal");
        assert!(matches!(err, LlmError::Msg(_)));
    }

    #[test]
    fn qa_accepts_substantive_answer_from_thread() {
        let tx = "[message_id=m1] Paul dit qu'il ne peut pas venir mardi.";
        let raw = r#"{"answer":"Paul ne peut pas venir mardi selon le fil.","evidenceMessageIds":["m1"]}"#;
        let out = qa_from_raw(
            &raw,
            &mut LlmEngine::open_ai_compatible(
                "http://127.0.0.1:8080/v1".into(),
                "test".into(),
                String::new(),
            )
            .expect("engine"),
            "sys",
            "user",
            tx,
            tx,
        )
        .expect("ok");
        assert!(out.answer.contains("mardi"));
    }
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
    match qa_from_raw(&raw, engine, system.as_str(), &user, &tx, thread_transcript) {
        Err(LlmError::Msg(m)) if m == QA_META_ERR => {
            let raw2 = engine.generate_streaming_with_schema(
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
            qa_from_raw(
                &raw2,
                engine,
                system.as_str(),
                &user,
                &tx,
                thread_transcript,
            )
        }
        other => other,
    }
}
