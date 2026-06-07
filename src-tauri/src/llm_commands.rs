//! Commandes surface pour les modules IA — OpenRouter et/ou llama-server (HTTP).

use rustymail_application::ai;
use rustymail_domain::{
    ActionBriefResult, AssistUserPrefs, FluxAffinerResult, FluxAffinerSample, MailSecuritySignals,
    RewriteStyle, SearchQuery, ThreadListItem, ThreadQaAnswer, TranslationResult,
};
use rustymail_infrastructure::{
    ai_feature_enabled, llama_server_api_key_get, llm_gguf_cached, load_app_prefs,
    openrouter_api_key_get, openrouter_api_key_present, sqlite_list_threads_page_scoped,
    sqlite_open_thread_by_id, AiFeature, AppPrefs,
};
use rustymail_llm::{
    hardware::{detect_profile, llama_server_gpu_gate_ok},
    redact_user_content_if_needed, LlmEngine,
};
use rustymail_modules::{
    ai_action_brief::{
        self, parse_action_brief_mode_request, resolve_action_brief_execution, ActionBriefSnapshotLimits,
    },
    ai_agent_prepare_reply::{self, AgentIntentResult, AgentPrepareReplyStep, AgentStepResult},
    ai_contact_profile, ai_flux_affiner, ai_grammar, ai_qa, ai_quick_reply, ai_search_nl,
    ai_translation, ai_writing,
    mail_security::llm_intent,
};
use serde::Deserialize;
use tauri::State;

use crate::AppPaths;

fn openrouter_model_nonempty(prefs: &AppPrefs) -> bool {
    !prefs.ai.openrouter_model.trim().is_empty()
}

pub(crate) fn ensure_llm_gate_args(prefs: &AppPrefs, paths: &AppPaths) -> Result<(), String> {
    let profile = detect_profile();
    let llama_gpu_ok = llama_server_gpu_gate_ok(&profile, prefs.ai.llama_server_allow_cpu_override);
    let gguf_cached = llm_gguf_cached(&paths.llm_models_dir, &prefs.ai);
    ai::ensure_llm_gate(
        prefs.ai.openrouter_enabled,
        openrouter_api_key_present(),
        openrouter_model_nonempty(prefs),
        prefs.ai.llama_server_enabled,
        !prefs.ai.llama_server_base_url.trim().is_empty(),
        !prefs.ai.llama_server_model.trim().is_empty(),
        llama_gpu_ok,
        prefs.ai.llama_server_spawn_enabled,
        !prefs.ai.llama_server_binary_path.trim().is_empty(),
        gguf_cached,
    )
    .map_err(|e| e.to_string())
}

fn llm_gate(prefs: &AppPrefs, paths: &AppPaths) -> Result<(), String> {
    crate::rate_guard::cooldown(
        "llm_invoke_pulse",
        std::time::Duration::from_millis(360),
    )?;
    ensure_llm_gate_args(prefs, paths)?;
    Ok(())
}

pub(crate) fn llm_gate_feature(
    prefs: &AppPrefs,
    paths: &AppPaths,
    feature: AiFeature,
) -> Result<(), String> {
    if !ai_feature_enabled(&prefs.ai, feature) {
        return Err("Cette fonctionnalité IA est désactivée dans les préférences.".into());
    }
    llm_gate(prefs, paths)
}

/// **OpenRouter** en priorité si activé et prêt, sinon **llama-server** (HTTP).
/// Avec `ai_cloud_llm_fallback` et les deux moteurs prêts : tente d’abord **llama-server**, puis OpenRouter en cas d’échec de construction du client local.
pub fn build_llm_engine(prefs: &AppPrefs, paths: &crate::AppPaths) -> Result<LlmEngine, String> {
    let openrouter_ok = prefs.ai.openrouter_enabled
        && openrouter_api_key_present()
        && openrouter_model_nonempty(prefs);
    let profile = detect_profile();
    let llama_gpu_ok = llama_server_gpu_gate_ok(&profile, prefs.ai.llama_server_allow_cpu_override);
    let gguf_cached = llm_gguf_cached(&paths.llm_models_dir, &prefs.ai);
    let llama_spawn_ready = prefs.ai.llama_server_spawn_enabled
        && !prefs.ai.llama_server_binary_path.trim().is_empty()
        && gguf_cached;
    let llama_ok = prefs.ai.llama_server_enabled
        && !prefs.ai.llama_server_base_url.trim().is_empty()
        && llama_gpu_ok
        && (!prefs.ai.llama_server_model.trim().is_empty() || llama_spawn_ready);

    let build_openrouter = || -> Result<LlmEngine, String> {
        let key = openrouter_api_key_get()?.ok_or_else(|| "Clé OpenRouter absente.".to_string())?;
        LlmEngine::open_router(
            key,
            prefs.ai.openrouter_base_url.trim().to_string(),
            prefs.ai.openrouter_model.trim().to_string(),
        )
        .map_err(|e| e.to_string())
    };

    let build_llama = || -> Result<LlmEngine, String> {
        crate::llama_server_spawn::ensure_managed_llama_server(paths, prefs)?;
        let key = llama_server_api_key_get()?.unwrap_or_default();
        let bearer = if key.is_empty() {
            None
        } else {
            Some(key.as_str())
        };
        let base = prefs.ai.llama_server_base_url.trim().to_string();
        let model = if prefs.ai.llama_server_model.trim().is_empty() {
            crate::llama_server_spawn::probe_first_model_id(base.as_str(), bearer)?
        } else {
            prefs.ai.llama_server_model.trim().to_string()
        };
        let n_ctx = crate::llama_server_spawn::cached_or_probe_llama_n_ctx(
            base.as_str(),
            model.as_str(),
            bearer,
        );
        let mut engine = LlmEngine::open_ai_compatible(base.clone(), model.clone(), key)
            .map_err(|e| e.to_string())?;
        if let Some(n) = n_ctx {
            engine.set_n_ctx_probe(n);
        } else if prefs.ai.local_llm_context_size >= 1024 {
            engine.set_n_ctx_probe(prefs.ai.local_llm_context_size);
        }
        Ok(engine)
    };

    if prefs.ai.ai_cloud_llm_fallback && llama_ok && openrouter_ok {
        return match build_llama() {
            Ok(e) => Ok(e),
            Err(e1) => build_openrouter()
                .map_err(|e2| format!("LLM local indisponible ({e1}) · repli cloud: {e2}")),
        };
    }

    if openrouter_ok {
        return build_openrouter();
    }
    if llama_ok {
        return build_llama();
    }
    Err("Aucun moteur IA utilisable.".into())
}

fn clip_chars(s: &str, max: usize) -> String {
    if s.len() <= max {
        return s.to_string();
    }
    let mut cut: String = s.chars().take(max).collect();
    cut.push_str(" …");
    cut
}

/// Texte envoyé aux prompts Q&A / réponses rapides (redaction PII si moteur cloud / API distante).
pub(crate) fn transcript_for_llm(
    view: &rustymail_domain::DiscussionThreadView,
    engine: &LlmEngine,
) -> String {
    let mut out = String::new();
    for m in view.messages.iter().take(40) {
        out.push_str(&format!(
            "[message_id={}] de {} ({}) :\n{}\n\n",
            m.message_id,
            m.sender,
            m.received_at,
            clip_chars(m.cleaned_text.as_str(), 4000),
        ));
    }
    redact_user_content_if_needed(engine, &out)
}

fn score_thread_for_brief(t: &ThreadListItem) -> i32 {
    let mut s = 0i32;
    if t.unread {
        s += 35;
    }
    if t.followed {
        s += 28;
    }
    if t.pinned {
        s += 22;
    }
    if t.attachment_count > 0 {
        s += 8;
    }
    if t.is_newsletter_thread {
        s -= 45;
    }
    let hay = format!("{} {}", t.subject, t.preview).to_ascii_lowercase();
    for kw in [
        "urgent",
        "asap",
        "contrat",
        "sla",
        "deadline",
        "facture",
        "escalade",
        "pénal",
        "ceo",
        "cto",
        "juridique",
        "réunion",
        "p1",
        "ticket",
    ] {
        if hay.contains(kw) {
            s += 14;
        }
    }
    s
}

fn mailbox_action_brief_snapshot(
    db_path: &std::path::Path,
    account_id: &str,
    mailbox: &str,
    limits: ActionBriefSnapshotLimits,
) -> Result<(String, Vec<String>), String> {
    let fetch = limits.fetch.max(limits.take).max(1);
    let take = limits.take.max(1);
    let preview = limits.preview_chars.max(80);
    let rows = sqlite_list_threads_page_scoped(db_path, account_id, mailbox, fetch, 0)
        .map_err(|e| e.to_string())?;
    let mut scored: Vec<(i32, ThreadListItem)> = rows
        .into_iter()
        .map(|t| (score_thread_for_brief(&t), t))
        .collect();
    scored.sort_by(|a, b| b.0.cmp(&a.0));
    let top: Vec<ThreadListItem> = scored.into_iter().take(take).map(|(_, t)| t).collect();

    let mut ids = Vec::with_capacity(top.len());
    let mut lines = String::new();
    for t in &top {
        ids.push(t.id.0.clone());
        lines.push_str(&format!(
            "fil_id={} | unread={} | messages={} | last={} | followed={} | pinned={} | newsletter={} | attachments={} | {}\n {}\n",
            t.id.0.as_str(),
            t.unread,
            t.message_count,
            t.last_activity.trim(),
            t.followed,
            t.pinned,
            t.is_newsletter_thread,
            t.attachment_count,
            t.subject.replace('\n', " ").trim(),
            clip_chars(&t.preview, preview),
        ));
    }
    Ok((lines, ids))
}


pub(crate) fn open_thread_domain(
    db_path: &std::path::Path,
    thread_id: &str,
) -> Result<rustymail_domain::DiscussionThreadView, String> {
    crate::ipc_guard::validate_thread_id(thread_id)?;
    let thread = sqlite_open_thread_by_id(db_path, thread_id)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "Fil introuvable.".to_string())?;
    let temp = rustymail_application::AppCore::new(vec![thread]);
    temp
        .open_thread(&rustymail_domain::ThreadId(thread_id.to_string()))
        .map_err(|e| e.to_string())
}

/// Révision des prompts / formats JSON — **bump** quand le comportement des features cachées change.
pub const AI_CACHE_PROMPT_REVISION: u32 = 6;

fn sanitize_cache_seg(s: &str) -> String {
    s.chars()
        .filter(|c| c.is_ascii_alphanumeric() || *c == '-' || *c == '_')
        .take(120)
        .collect()
}

/// Segment stable pour versionner le cache SQLite (modèle effectif + backend).
pub fn ai_cache_model_segment(prefs: &AppPrefs) -> String {
    let ai = &prefs.ai;
    if ai.openrouter_enabled
        && openrouter_api_key_present()
        && !ai.openrouter_model.trim().is_empty()
    {
        format!("or:{}", sanitize_cache_seg(ai.openrouter_model.trim()))
    } else if ai.llama_server_enabled {
        let m = if ai.llama_server_model.trim().is_empty() {
            "auto".to_string()
        } else {
            sanitize_cache_seg(ai.llama_server_model.trim())
        };
        format!(
            "ll:{}@{}",
            m,
            sanitize_cache_seg(ai.llama_server_base_url.trim())
        )
    } else {
        "none".into()
    }
}

pub(crate) fn ai_cache_summary_key(prefs: &AppPrefs, thread_id: &str) -> String {
    format!(
        "summary:v2:{}:p{}:{}",
        ai_cache_model_segment(prefs),
        AI_CACHE_PROMPT_REVISION,
        thread_id.trim()
    )
}

pub(crate) fn ai_cache_translate_thread_key(prefs: &AppPrefs, thread_id: &str, target_lang: &str) -> String {
    format!(
        "translate:v2:{}:p{}:thread:{}:{}",
        ai_cache_model_segment(prefs),
        AI_CACHE_PROMPT_REVISION,
        thread_id.trim(),
        target_lang.trim()
    )
}

fn ai_cache_translate_msg_key(prefs: &AppPrefs, message_id: &str, target_lang: &str) -> String {
    format!(
        "translate:v2:{}:p{}:msg:{}:{}",
        ai_cache_model_segment(prefs),
        AI_CACHE_PROMPT_REVISION,
        message_id.trim(),
        target_lang.trim()
    )
}

/// Synthèse LLM + écriture cache (appelé depuis `spawn_blocking`).
pub fn summarize_thread_llm_attempt(
    paths: &AppPaths,
    view: &rustymail_domain::DiscussionThreadView,
    thread_id: &str,
) -> Option<rustymail_modules::ai_summary::SummaryResult> {
    let prefs = load_app_prefs(&paths.prefs_path);
    if !ai_feature_enabled(&prefs.ai, AiFeature::ThreadSummary) {
        return None;
    }
    if ensure_llm_gate_args(&prefs, paths).is_err() {
        return None;
    }
    let mut engine = match build_llm_engine(&prefs, paths) {
        Ok(e) => e,
        Err(e) => {
            eprintln!("[RustyMail] Synthèse fil : moteur LLM indisponible: {e}");
            return None;
        }
    };
    let lang = prefs.general.mother_language.as_str();
    match rustymail_modules::ai_summary::summarize_thread_with_llm(view, &mut engine, lang) {
        Ok(s) => {
            let cache_key = ai_cache_summary_key(&prefs, thread_id);
            if let Ok(json) = serde_json::to_string(&s) {
                let _ = rustymail_infrastructure::sqlite_ai_cache_put(
                    &paths.db_path,
                    &cache_key,
                    &json,
                );
            }
            Some(s)
        }
        Err(err) => {
            eprintln!(
                "[RustyMail] Synthèse fil LLM échouée, repli ligne par ligne: {err}"
            );
            None
        }
    }
}

#[tauri::command]
pub fn ai_cache_llm_segment(paths: State<'_, AppPaths>) -> Result<String, String> {
    let prefs = load_app_prefs(&paths.prefs_path);
    Ok(ai_cache_model_segment(&prefs))
}

fn llm_translate_message_compute(
    paths: &AppPaths,
    thread_id: String,
    message_id: String,
    target_lang: String,
) -> Result<TranslationResult, String> {
    crate::ipc_guard::validate_thread_id(&thread_id)?;
    crate::ipc_guard::validate_message_id(&message_id)?;
    crate::ipc_guard::validate_target_lang(&target_lang)?;
    let prefs = load_app_prefs(&paths.prefs_path);
    llm_gate_feature(&prefs, paths, AiFeature::MessageTranslate)?;
    let mut engine = build_llm_engine(&prefs, paths)?;
    let view = open_thread_domain(&paths.db_path, thread_id.trim())?;
    let msg = view
        .messages
        .iter()
        .find(|m| m.message_id == message_id.trim())
        .ok_or_else(|| "Message introuvable dans ce fil.".to_string())?;
    let res = ai_translation::translate_plain_with_llm(
        &mut engine,
        &msg.message_id,
        &msg.cleaned_text,
        "auto",
        target_lang.trim(),
    )
    .map_err(|e| e.to_string())?;
    let key = ai_cache_translate_msg_key(&prefs, msg.message_id.trim(), target_lang.trim());
    if let Ok(json) = serde_json::to_string(&res) {
        let _ = rustymail_infrastructure::sqlite_ai_cache_put(&paths.db_path, &key, &json);
    }
    Ok(res)
}

#[tauri::command]
pub async fn llm_translate_message(
    paths: State<'_, AppPaths>,
    thread_id: String,
    message_id: String,
    target_lang: String,
) -> Result<TranslationResult, String> {
    let paths = Clone::clone(&*paths);
    let thread_id = thread_id.trim().to_string();
    let message_id = message_id.trim().to_string();
    let target_lang = target_lang.trim().to_string();
    tauri::async_runtime::spawn_blocking(move || {
        llm_translate_message_compute(&paths, thread_id, message_id, target_lang)
    })
    .await
    .map_err(|e| format!("llm_translate_message join: {e}"))?
}

fn llm_translate_thread_compute(
    paths: &AppPaths,
    thread_id: String,
    target_lang: String,
) -> Result<TranslationResult, String> {
    crate::ipc_guard::validate_thread_id(&thread_id)?;
    crate::ipc_guard::validate_target_lang(&target_lang)?;
    let prefs = load_app_prefs(&paths.prefs_path);
    llm_gate_feature(&prefs, paths, AiFeature::ThreadTranslate)?;
    let mut engine = build_llm_engine(&prefs, paths)?;
    let view = open_thread_domain(&paths.db_path, thread_id.trim())?;
    let last = view
        .messages
        .last()
        .ok_or_else(|| "Fil vide.".to_string())?;
    let mut acc = String::new();
    for m in view.messages.iter().take(12) {
        acc.push_str(m.cleaned_text.as_str());
        acc.push('\n');
    }
    let res = ai_translation::translate_plain_with_llm(
        &mut engine,
        &last.message_id,
        acc.trim(),
        "auto",
        target_lang.trim(),
    )
    .map_err(|e| e.to_string())?;
    let key = ai_cache_translate_thread_key(&prefs, thread_id.trim(), target_lang.trim());
    if let Ok(json) = serde_json::to_string(&res) {
        let _ = rustymail_infrastructure::sqlite_ai_cache_put(&paths.db_path, &key, &json);
    }
    Ok(res)
}

#[tauri::command]
pub async fn llm_translate_thread(
    paths: State<'_, AppPaths>,
    thread_id: String,
    target_lang: String,
) -> Result<TranslationResult, String> {
    let paths = Clone::clone(&*paths);
    let thread_id = thread_id.trim().to_string();
    let target_lang = target_lang.trim().to_string();
    tauri::async_runtime::spawn_blocking(move || llm_translate_thread_compute(&paths, thread_id, target_lang))
        .await
        .map_err(|e| format!("llm_translate_thread join: {e}"))?
}

fn llm_rewrite_compose_compute(
    paths: &AppPaths,
    text: String,
    style: String,
) -> Result<rustymail_domain::RewriteResult, String> {
    let prefs = load_app_prefs(&paths.prefs_path);
    llm_gate_feature(&prefs, paths, AiFeature::ComposeRewrite)?;
    let st = match style.trim().to_ascii_lowercase().as_str() {
        "formal" => RewriteStyle::Formal,
        "casual" => RewriteStyle::Casual,
        "concise" => RewriteStyle::Concise,
        "polite" => RewriteStyle::Polite,
        "assertive" => RewriteStyle::Assertive,
        "apologetic" => RewriteStyle::Apologetic,
        _ => RewriteStyle::Neutral,
    };
    let mut engine = build_llm_engine(&prefs, paths)?;
    let lang = prefs.general.mother_language.as_str();
    ai_writing::rewrite_with_llm(&mut engine, text.trim(), st, lang).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn llm_rewrite_compose(
    paths: State<'_, AppPaths>,
    text: String,
    style: String,
) -> Result<rustymail_domain::RewriteResult, String> {
    let paths = Clone::clone(&*paths);
    tauri::async_runtime::spawn_blocking(move || llm_rewrite_compose_compute(&paths, text, style))
        .await
        .map_err(|e| format!("llm_rewrite_compose join: {e}"))?
}

fn llm_grammar_compose_compute(paths: &AppPaths, text: String) -> Result<rustymail_domain::GrammarResult, String> {
    let prefs = load_app_prefs(&paths.prefs_path);
    llm_gate_feature(&prefs, paths, AiFeature::ComposeGrammar)?;
    let mut engine = build_llm_engine(&prefs, paths)?;
    let lang = prefs.general.mother_language.as_str();
    ai_grammar::grammar_check_with_llm(&mut engine, text.trim(), lang).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn llm_grammar_compose(
    paths: State<'_, AppPaths>,
    text: String,
) -> Result<rustymail_domain::GrammarResult, String> {
    let paths = Clone::clone(&*paths);
    tauri::async_runtime::spawn_blocking(move || llm_grammar_compose_compute(&paths, text))
        .await
        .map_err(|e| format!("llm_grammar_compose join: {e}"))?
}

fn llm_quick_reply_thread_compute(
    paths: &AppPaths,
    thread_id: String,
) -> Result<rustymail_domain::QuickRepliesResult, String> {
    crate::ipc_guard::validate_thread_id(&thread_id)?;
    let prefs = load_app_prefs(&paths.prefs_path);
    llm_gate_feature(&prefs, paths, AiFeature::QuickReplyThread)?;
    let mut engine = build_llm_engine(&prefs, paths)?;
    let view = open_thread_domain(&paths.db_path, thread_id.trim())?;
    let ctx = transcript_for_llm(&view, &engine);
    let lang = prefs.general.mother_language.as_str();
    ai_quick_reply::quick_replies_with_llm(&mut engine, Some(ctx.as_str()), lang)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn llm_quick_reply_thread(
    paths: State<'_, AppPaths>,
    thread_id: String,
) -> Result<rustymail_domain::QuickRepliesResult, String> {
    let paths = Clone::clone(&*paths);
    let thread_id = thread_id.trim().to_string();
    tauri::async_runtime::spawn_blocking(move || llm_quick_reply_thread_compute(&paths, thread_id))
        .await
        .map_err(|e| format!("llm_quick_reply_thread join: {e}"))?
}

fn llm_quick_reply_compose_compute(paths: &AppPaths) -> Result<rustymail_domain::QuickRepliesResult, String> {
    let prefs = load_app_prefs(&paths.prefs_path);
    llm_gate_feature(&prefs, paths, AiFeature::QuickReplyCompose)?;
    let mut engine = build_llm_engine(&prefs, paths)?;
    let lang = prefs.general.mother_language.as_str();
    ai_quick_reply::quick_replies_with_llm(&mut engine, None, lang).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn llm_quick_reply_compose(paths: State<'_, AppPaths>) -> Result<rustymail_domain::QuickRepliesResult, String> {
    let paths = Clone::clone(&*paths);
    tauri::async_runtime::spawn_blocking(move || llm_quick_reply_compose_compute(&paths))
        .await
        .map_err(|e| format!("llm_quick_reply_compose join: {e}"))?
}

fn llm_qa_thread_compute(
    paths: &AppPaths,
    thread_id: String,
    question: String,
) -> Result<ThreadQaAnswer, String> {
    crate::ipc_guard::validate_thread_id(&thread_id)?;
    crate::ipc_guard::validate_qa_question(&question)?;
    let prefs = load_app_prefs(&paths.prefs_path);
    llm_gate_feature(&prefs, paths, AiFeature::ThreadQa)?;
    let mut engine = build_llm_engine(&prefs, paths)?;
    let view = open_thread_domain(&paths.db_path, thread_id.trim())?;
    let ctx = transcript_for_llm(&view, &engine);
    let lang = prefs.general.mother_language.as_str();
    ai_qa::qa_thread_with_llm(&mut engine, ctx.as_str(), question.trim(), lang)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn llm_qa_thread(
    paths: State<'_, AppPaths>,
    thread_id: String,
    question: String,
) -> Result<ThreadQaAnswer, String> {
    let paths = Clone::clone(&*paths);
    let thread_id = thread_id.trim().to_string();
    let question = question.trim().to_string();
    tauri::async_runtime::spawn_blocking(move || llm_qa_thread_compute(&paths, thread_id, question))
        .await
        .map_err(|e| format!("llm_qa_thread join: {e}"))?
}

fn llm_search_nl_compute(
    paths: &AppPaths,
    account_id: String,
    phrase: String,
) -> Result<SearchQuery, String> {
    crate::ipc_guard::validate_optional_account_id(Some(&account_id))?;
    crate::ipc_guard::validate_search_phrase(&phrase)?;
    let prefs = load_app_prefs(&paths.prefs_path);
    llm_gate_feature(&prefs, paths, AiFeature::SearchNl)?;
    let mut engine = build_llm_engine(&prefs, paths)?;
    let lang = prefs.general.mother_language.as_str();
    ai_search_nl::nl_to_search_query(&mut engine, phrase.trim(), account_id.trim(), lang)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn llm_search_nl(
    paths: State<'_, AppPaths>,
    account_id: String,
    phrase: String,
) -> Result<SearchQuery, String> {
    let paths = Clone::clone(&*paths);
    let account_id = account_id.trim().to_string();
    let phrase = phrase.trim().to_string();
    tauri::async_runtime::spawn_blocking(move || llm_search_nl_compute(&paths, account_id, phrase))
        .await
        .map_err(|e| format!("llm_search_nl join: {e}"))?
}

fn llm_inbox_digest_compute(
    paths: &AppPaths,
    account_id: &str,
    mailbox: &str,
    mode_request: rustymail_modules::ai_action_brief::ActionBriefModeRequest,
) -> Result<ActionBriefResult, String> {
    crate::ipc_guard::validate_account_id(account_id)?;
    crate::ipc_guard::validate_mailbox(mailbox)?;
    let prefs = load_app_prefs(&paths.prefs_path);
    llm_gate_feature(&prefs, paths, AiFeature::InboxDigest)?;
    let mut engine = build_llm_engine(&prefs, paths)?;
    let n_ctx = engine.n_ctx();
    let (mode, limits) = resolve_action_brief_execution(n_ctx, mode_request);
    let (snap, thread_ids) = mailbox_action_brief_snapshot(
        paths.db_path.as_path(),
        account_id.trim(),
        mailbox.trim(),
        limits,
    )?;
    let lang = prefs.general.mother_language.as_str();
    ai_action_brief::action_brief_with_llm(
        &mut engine,
        &snap,
        &thread_ids,
        account_id.trim(),
        mailbox.trim(),
        mode,
        lang,
    )
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn llm_inbox_digest(
    paths: State<'_, AppPaths>,
    account_id: String,
    mailbox: String,
    mode: Option<String>,
) -> Result<ActionBriefResult, String> {
    let paths = Clone::clone(&*paths);
    let account_id = account_id.trim().to_string();
    let mailbox = mailbox.trim().to_string();
    let mode_request = parse_action_brief_mode_request(mode.as_deref());
    tauri::async_runtime::spawn_blocking(move || {
        llm_inbox_digest_compute(&paths, &account_id, &mailbox, mode_request)
    })
        .await
        .map_err(|e| format!("digest join: {e}"))?
}

fn llm_security_signals_augment_compute(
    paths: &AppPaths,
    payload: MailSecuritySignals,
) -> Result<MailSecuritySignals, String> {
    let prefs = load_app_prefs(&paths.prefs_path);
    llm_gate_feature(&prefs, paths, AiFeature::SecurityLlm)?;
    let mut engine = build_llm_engine(&prefs, paths)?;
    let lang = prefs.general.mother_language.as_str();
    llm_intent::augment_security_with_llm(payload, &mut engine, true, lang)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn llm_security_signals_augment(
    paths: State<'_, AppPaths>,
    payload: MailSecuritySignals,
) -> Result<MailSecuritySignals, String> {
    let paths = Clone::clone(&*paths);
    tauri::async_runtime::spawn_blocking(move || llm_security_signals_augment_compute(&paths, payload))
        .await
        .map_err(|e| format!("llm_security_signals_augment join: {e}"))?
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LlmAgentPrepareReplyPayload {
    pub thread_id: String,
    pub step: AgentPrepareReplyStep,
    #[serde(default)]
    pub prior_intent: Option<AgentIntentResult>,
}

fn llm_agent_prepare_reply_step_compute(
    paths: &AppPaths,
    payload: LlmAgentPrepareReplyPayload,
) -> Result<AgentStepResult, String> {
    crate::ipc_guard::validate_thread_id(&payload.thread_id)?;
    let prefs = load_app_prefs(&paths.prefs_path);
    llm_gate_feature(&prefs, paths, AiFeature::AgentPrepareReply)?;
    let mut engine = build_llm_engine(&prefs, paths)?;
    let view = open_thread_domain(&paths.db_path, payload.thread_id.trim())?;
    let ctx = transcript_for_llm(&view, &engine);
    let lang = prefs.ai.draft_language.trim();
    let lang = if lang.is_empty() { "fr" } else { lang };
    let user_prefs = AssistUserPrefs {
        lang: lang.to_string(),
        tone: "neutre".into(),
        timezone: "Europe/Paris".into(),
    };
    ai_agent_prepare_reply::agent_prepare_reply_step(
        &mut engine,
        payload.step,
        ctx.as_str(),
        payload.prior_intent.as_ref(),
        lang,
        &user_prefs,
        None,
    )
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn llm_agent_prepare_reply_step(
    paths: State<'_, AppPaths>,
    payload: LlmAgentPrepareReplyPayload,
) -> Result<AgentStepResult, String> {
    let paths = Clone::clone(&*paths);
    tauri::async_runtime::spawn_blocking(move || llm_agent_prepare_reply_step_compute(&paths, payload))
        .await
        .map_err(|e| format!("llm_agent_prepare_reply_step join: {e}"))?
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LlmContactProfilePayload {
    pub account_id: String,
    pub email: String,
    #[serde(default)]
    pub global_scope: Option<bool>,
}

fn ai_cache_contact_profile_key(prefs: &AppPrefs, account_id: &str, email: &str) -> String {
    format!(
        "contact_profile:v1:{}:{}:{}",
        ai_cache_model_segment(prefs),
        account_id.trim(),
        email.trim().to_ascii_lowercase()
    )
}

fn llm_contact_profile_compute(
    paths: &AppPaths,
    payload: LlmContactProfilePayload,
) -> Result<rustymail_modules::ai_contact_profile::ContactProfileResult, String> {
    crate::ipc_guard::validate_account_id(&payload.account_id)?;
    crate::ipc_guard::validate_contact_email(&payload.email)?;
    let prefs = load_app_prefs(&paths.prefs_path);
    llm_gate_feature(&prefs, paths, AiFeature::ContactProfile)?;
    let global = payload
        .global_scope
        .unwrap_or(prefs.general.address_book_global_scope);
    let cache_key = ai_cache_contact_profile_key(&prefs, &payload.account_id, &payload.email);
    if let Ok(Some(cached)) = rustymail_infrastructure::sqlite_ai_cache_get(&paths.db_path, &cache_key)
    {
        if let Ok(parsed) =
            serde_json::from_str::<rustymail_modules::ai_contact_profile::ContactProfileResult>(&cached)
        {
            return Ok(parsed);
        }
    }
    let samples = rustymail_infrastructure::contact_message_samples(
        paths.db_path.as_path(),
        payload.account_id.trim(),
        payload.email.trim(),
        global,
        10,
    )?;
    if samples.trim().is_empty() {
        return Err("Aucun message local pour ce contact.".into());
    }
    let mut engine = build_llm_engine(&prefs, paths)?;
    let lang = prefs.general.mother_language.as_str();
    let profile = ai_contact_profile::contact_profile_with_llm(
        &mut engine,
        payload.email.trim(),
        samples.as_str(),
        lang,
    )
    .map_err(|e| e.to_string())?;
    if let Ok(json) = serde_json::to_string(&profile) {
        let _ = rustymail_infrastructure::sqlite_ai_cache_put(&paths.db_path, &cache_key, &json);
    }
    Ok(profile)
}

#[tauri::command]
pub async fn llm_contact_profile(
    paths: State<'_, AppPaths>,
    payload: LlmContactProfilePayload,
) -> Result<rustymail_modules::ai_contact_profile::ContactProfileResult, String> {
    let paths = Clone::clone(&*paths);
    tauri::async_runtime::spawn_blocking(move || llm_contact_profile_compute(&paths, payload))
        .await
        .map_err(|e| format!("llm_contact_profile join: {e}"))?
}

#[tauri::command]
pub fn list_ai_prompt_catalog() -> Vec<rustymail_modules::prompts::PromptCatalogItemView> {
    rustymail_modules::prompts::list_catalog_for_ui()
}

#[tauri::command]
pub fn ai_cache_get(paths: State<'_, AppPaths>, key: String) -> Result<Option<String>, String> {
    crate::ipc_guard::validate_ai_cache_key(&key)?;
    rustymail_infrastructure::sqlite_ai_cache_get(&paths.db_path, &key)
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LlmFluxAffinerPayload {
    pub account_id: String,
    #[serde(default)]
    pub view_label: Option<String>,
    pub samples: Vec<FluxAffinerSample>,
    #[serde(default)]
    pub existing_mailboxes: Vec<String>,
}

fn llm_affiner_flux_compute(
    paths: &AppPaths,
    payload: LlmFluxAffinerPayload,
) -> Result<FluxAffinerResult, String> {
    crate::ipc_guard::validate_account_id(&payload.account_id)?;
    if payload.samples.is_empty() {
        return Err("samples: au moins un fil requis.".into());
    }
    if payload.samples.len() > 50 {
        return Err("samples: maximum 50 fils.".into());
    }
    let prefs = load_app_prefs(&paths.prefs_path);
    llm_gate_feature(&prefs, paths, AiFeature::OrgProposals)?;
    let mut engine = build_llm_engine(&prefs, paths)?;
    let label = payload
        .view_label
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .unwrap_or("Recherche");
    let lang = prefs.general.mother_language.as_str();
    ai_flux_affiner::affiner_flux_with_llm(
        &mut engine,
        label,
        &payload.samples,
        &payload.existing_mailboxes,
        lang,
    )
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn llm_affiner_flux_cmd(
    paths: State<'_, AppPaths>,
    payload: LlmFluxAffinerPayload,
) -> Result<FluxAffinerResult, String> {
    let paths = Clone::clone(&*paths);
    tauri::async_runtime::spawn_blocking(move || llm_affiner_flux_compute(&paths, payload))
        .await
        .map_err(|e| format!("llm_affiner_flux join: {e}"))?
}
