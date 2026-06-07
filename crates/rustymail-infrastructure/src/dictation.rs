//! Dictée : trousseau pour la clé API cloud, transcription HTTP (OpenAI-compatible), traduction optionnelle.

use crate::app_prefs::AiPrefs;
use base64::{engine::general_purpose::STANDARD, Engine};
use reqwest::multipart::{Form, Part};
use serde::Deserialize;

pub const DICTATION_KEYRING_USERNAME: &str = "__rustymail_dictation_openai__";

pub fn dictation_api_key_get() -> Result<Option<String>, String> {
    keyring::use_native_store(false).map_err(|e| format!("keyring: {e}"))?;
    let entry = keyring_core::Entry::new(crate::KEYRING_SERVICE, DICTATION_KEYRING_USERNAME)
        .map_err(|e| format!("keyring entry: {e}"))?;
    match entry.get_password() {
        Ok(s) if !s.trim().is_empty() => Ok(Some(s)),
        Ok(_) => Ok(None),
        Err(keyring_core::Error::NoEntry) => Ok(None),
        Err(e) => Err(format!("keyring read: {e}")),
    }
}

pub fn dictation_api_key_set(secret: &str) -> Result<(), String> {
    keyring::use_native_store(false).map_err(|e| format!("keyring: {e}"))?;
    let entry = keyring_core::Entry::new(crate::KEYRING_SERVICE, DICTATION_KEYRING_USERNAME)
        .map_err(|e| format!("keyring entry: {e}"))?;
    entry
        .set_password(secret)
        .map_err(|e| format!("keyring write: {e}"))
}

pub fn dictation_api_key_clear() {
    let Ok(_) = keyring::use_native_store(false) else {
        return;
    };
    let Ok(entry) = keyring_core::Entry::new(crate::KEYRING_SERVICE, DICTATION_KEYRING_USERNAME)
    else {
        return;
    };
    let _ = entry.delete_credential();
}

/// Clé dictée cloud ; si absente, repli sur la clé OpenRouter (une saisie pour les deux).
pub fn dictation_cloud_api_key_get() -> Result<Option<String>, String> {
    if let Some(k) = dictation_api_key_get()? {
        if !k.trim().is_empty() {
            return Ok(Some(k));
        }
    }
    crate::openrouter::openrouter_api_key_get()
}

pub fn dictation_api_key_present() -> bool {
    dictation_cloud_api_key_get().ok().flatten().is_some()
}

fn normalize_lang(code: &str) -> String {
    code.trim()
        .to_ascii_lowercase()
        .split('-')
        .next()
        .unwrap_or("")
        .to_string()
}

fn langs_differ(speech: &str, draft: &str) -> bool {
    let s = normalize_lang(speech);
    let d = normalize_lang(draft);
    !s.is_empty() && !d.is_empty() && s != d
}

#[derive(Debug, Deserialize)]
struct TranscriptionResponse {
    text: String,
}

#[derive(Debug, Deserialize)]
struct ChatChoiceMessage {
    content: String,
}

#[derive(Debug, Deserialize)]
struct ChatChoice {
    message: ChatChoiceMessage,
}

#[derive(Debug, Deserialize)]
struct ChatCompletionResponse {
    choices: Vec<ChatChoice>,
}

fn join_base_transcriptions(base: &str) -> String {
    let b = base.trim_end_matches('/');
    format!("{b}/audio/transcriptions")
}

fn join_base_chat(base: &str) -> String {
    let b = base.trim_end_matches('/');
    format!("{b}/chat/completions")
}

/// Transcription ; `backend` = `cloud` | `local_http` (ou autre non-demo).
pub async fn transcribe_audio(
    ai: &AiPrefs,
    backend: &str,
    api_key: Option<&str>,
    audio_bytes: Vec<u8>,
    file_name: &str,
    mime_type: &str,
) -> Result<String, String> {
    let base = match backend {
        "local_http" => ai.local_companion_base_url.trim(),
        _ => ai.openai_base_url.trim(),
    };
    if base.is_empty() {
        return Err("URL de base dictée vide (cloud ou compagnon local).".into());
    }
    let url = join_base_transcriptions(base);
    let part = Part::bytes(audio_bytes)
        .file_name(file_name.to_string())
        .mime_str(mime_type)
        .map_err(|e| e.to_string())?;
    let mut form = Form::new().part("file", part);
    form = form.text("model", ai.whisper_model.clone());
    let lang = ai.speech_language.trim();
    if !lang.is_empty() && lang != "auto" {
        form = form.text("language", lang.to_string());
    }
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(120))
        .build()
        .map_err(|e| e.to_string())?;
    let mut req = client.post(&url).multipart(form);
    if let Some(k) = api_key.filter(|k| !k.trim().is_empty()) {
        req = req.bearer_auth(k.trim());
    }
    let resp = req.send().await.map_err(|e| e.to_string())?;
    let status = resp.status();
    let body = resp.text().await.map_err(|e| e.to_string())?;
    if !status.is_success() {
        return Err(format!("transcription HTTP {status}: {body}"));
    }
    let parsed: TranscriptionResponse =
        serde_json::from_str(&body).map_err(|e| format!("JSON: {e} — body: {body}"))?;
    Ok(parsed.text)
}

/// Traduit via `chat/completions` sur la **base cloud** uniquement (même clé que la dictée cloud).
pub async fn translate_to_draft_language(
    openai_base_url: &str,
    api_key: &str,
    model: &str,
    text: &str,
    target_lang_code: &str,
) -> Result<String, String> {
    let url = join_base_chat(openai_base_url);
    let body = serde_json::json!({
        "model": model,
        "temperature": 0.2,
        "messages": [
            {
                "role": "system",
                "content": format!(
                    "Tu traduis le texte suivant en {} (code langue). Réponds uniquement par la traduction, ton neutre, adapté à un courriel professionnel. Pas de guillemets ni préambule.",
                    target_lang_code.trim()
                )
            },
            { "role": "user", "content": text }
        ]
    });
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(60))
        .build()
        .map_err(|e| e.to_string())?;
    let resp = client
        .post(&url)
        .bearer_auth(api_key.trim())
        .json(&body)
        .send()
        .await
        .map_err(|e| e.to_string())?;
    let status = resp.status();
    let resp_body = resp.text().await.map_err(|e| e.to_string())?;
    if !status.is_success() {
        return Err(format!("traduction HTTP {status}: {resp_body}"));
    }
    let parsed: ChatCompletionResponse =
        serde_json::from_str(&resp_body).map_err(|e| format!("JSON chat: {e}"))?;
    parsed
        .choices
        .first()
        .map(|c| c.message.content.trim().to_string())
        .filter(|s| !s.is_empty())
        .ok_or_else(|| "réponse chat vide".into())
}

/// Décode base64 (standard) vers bytes.
pub fn decode_audio_base64(b64: &str) -> Result<Vec<u8>, String> {
    STANDARD.decode(b64.trim()).map_err(|e| e.to_string())
}

/// Pipeline : transcription puis traduction si backend cloud et langues différentes.
pub async fn transcribe_and_maybe_translate(
    ai: &AiPrefs,
    backend: &str,
    audio_bytes: Vec<u8>,
    file_name: &str,
    mime_type: &str,
) -> Result<String, String> {
    let key = dictation_cloud_api_key_get()?;
    let key_ref = key.as_deref();
    // Ne jamais envoyer la clé cloud vers un service `local_http` (compagnon type CyberScribe).
    let auth = if backend == "local_http" {
        None
    } else {
        key_ref
    };
    let text = transcribe_audio(ai, backend, auth, audio_bytes, file_name, mime_type).await?;
    if backend == "cloud" && langs_differ(&ai.speech_language, &ai.draft_language) {
        let Some(k) = key_ref.filter(|k| !k.is_empty()) else {
            return Ok(text);
        };
        return translate_to_draft_language(
            &ai.openai_base_url,
            k,
            &ai.translate_model,
            &text,
            &ai.draft_language,
        )
        .await;
    }
    Ok(text)
}
