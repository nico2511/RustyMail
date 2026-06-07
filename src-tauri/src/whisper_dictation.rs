//! Dictée locale **whisper.cpp** (GGML) sur Hugging Face `ggerganov/whisper.cpp` (URLs `/resolve/…`).
//! La **langue** choisie dans les préférences pilote le nom du fichier GGML (variante `.en` si anglais pur
//! et disponible pour la taille), plus l’indice langue pour l’inférence.

use std::io::Cursor;
use std::path::PathBuf;

use rustymail_infrastructure::{download_hf_file_if_needed, hf_resolve_url};

use hound::{SampleFormat, WavSpec};
use transcribe_rs::accel::{set_whisper_accelerator, WhisperAccelerator, GPU_DEVICE_AUTO};
use transcribe_rs::whisper_cpp::{WhisperEngine, WhisperInferenceParams, WhisperLoadParams};
use transcribe_rs::TranscribeError;

#[derive(Debug, serde::Serialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum WhisperError {
    AudioTooShort { seconds: f32 },
    AudioSilent { rms: f32 },
    DecodeFailed { message: String },
    Other { message: String },
}

impl std::fmt::Display for WhisperError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            WhisperError::AudioTooShort { seconds } => {
                write!(f, "Audio trop court ({seconds:.2}s). Parlez plus longtemps.")
            }
            WhisperError::AudioSilent { rms } => write!(
                f,
                "Audio quasi silencieux (RMS={rms:.4}). Vérifiez le micro et le niveau d'entrée."
            ),
            WhisperError::DecodeFailed { message } => write!(f, "Échec transcription Whisper: {message}"),
            WhisperError::Other { message } => write!(f, "{message}"),
        }
    }
}

pub const DEFAULT_WHISPER_GGML_HF_REPO: &str = "ggerganov/whisper.cpp";

fn whisper_cache_dir(repo_id: &str, revision: &str, file_name: &str) -> PathBuf {
    let base = dirs::cache_dir()
        .unwrap_or_else(std::env::temp_dir)
        .join("rustymail")
        .join("whisper_ggml");
    let safe = repo_id.trim().replace('/', "--");
    base.join(safe).join(revision.trim()).join(file_name)
}

/// `tiny`…`medium` ont des variantes `.en` sur le dépôt officiel (fichiers plus petits pour l’anglais seul).
fn size_has_english_variant(size: &str) -> bool {
    matches!(size, "tiny" | "base" | "small" | "medium")
}

fn prefer_english_ggml(whisper_lang: &str, model_size: &str) -> bool {
    let primary = whisper_lang
        .trim()
        .to_ascii_lowercase()
        .split(|c| c == '-' || c == '_')
        .next()
        .unwrap_or("")
        .to_string();
    primary == "en" && size_has_english_variant(model_size.trim().to_ascii_lowercase().as_str())
}

/// Corps du nom de fichier (sans préfixe `ggml-` ni extension), ex. `base-q5_1` ou `base.en-q5_1`.
fn ggml_stem(model_size: &str, transcription_profile: &str) -> Result<String, String> {
    let size = model_size.trim().to_ascii_lowercase();
    let profile = transcription_profile.trim().to_ascii_lowercase();

    match profile.as_str() {
        "fast" | "balanced" | "accurate" => {}
        other => return Err(format!("profil dictée inconnu: {other}")),
    }

    let mid = match size.as_str() {
        "tiny" | "base" | "small" => size.as_str(),
        "medium" | "large-v2" | "large-v3" | "large-v3-turbo" => size.as_str(),
        "large-v1" => match profile.as_str() {
            "fast" | "balanced" => {
                return Ok(format!("{size}"));
            }
            _ => size.as_str(),
        },
        _ => {
            return Err(
                "taille inconnue (tiny, base, small, medium, large-v1, large-v2, large-v3, large-v3-turbo)."
                    .into(),
            );
        }
    };

    let suffix = match profile.as_str() {
        "accurate" => "".to_string(),
        "balanced" => "-q8_0".to_string(),
        "fast" => {
            let q = match mid {
                "tiny" | "base" | "small" => "-q5_1",
                "medium" | "large-v2" | "large-v3" | "large-v3-turbo" => "-q5_0",
                _ => "-q5_0",
            };
            q.to_string()
        }
        _ => unreachable!(),
    };

    Ok(format!("{mid}{suffix}"))
}

/// Fichiers à essayer dans l’ordre (premier cache / téléchargement réussi gagne).
fn ggml_candidate_filenames(
    model_size: &str,
    transcription_profile: &str,
    whisper_lang: &str,
) -> Result<Vec<String>, String> {
    let stem_ml = ggml_stem(model_size, transcription_profile)?;
    let mut out: Vec<String> = Vec::new();

    if prefer_english_ggml(whisper_lang, model_size) {
        let mid = model_size.trim().to_ascii_lowercase();
        let core = stem_ml.strip_prefix(mid.as_str()).unwrap_or("");
        let en_stem = format!("{}.en{}", mid, core);
        out.push(format!("ggml-{en_stem}.bin"));
    }

    out.push(format!("ggml-{stem_ml}.bin"));
    Ok(out)
}

/// Télécharge (ou réutilise le cache) le fichier GGML adapté à la langue + taille + profil.
pub fn ensure_ggml_weights(
    repo_id: &str,
    revision: &str,
    model_size: &str,
    transcription_profile: &str,
    whisper_cpp_language: &str,
) -> Result<PathBuf, String> {
    let rid = if repo_id.trim().is_empty() {
        DEFAULT_WHISPER_GGML_HF_REPO
    } else {
        repo_id.trim()
    };
    let rev = if revision.trim().is_empty() {
        "main"
    } else {
        revision.trim()
    };

    let candidates =
        ggml_candidate_filenames(model_size, transcription_profile, whisper_cpp_language)?;

    let mut last_err = String::from("aucun fichier GGML disponible");

    for file in candidates {
        let dest = whisper_cache_dir(rid, rev, &file);
        if let Ok(m) = std::fs::metadata(&dest) {
            if m.len() > 1024 {
                return Ok(dest);
            }
            let _ = std::fs::remove_file(&dest);
        }

        let url = hf_resolve_url(rid, rev, &file);
        if let Some(parent) = dest.parent() {
            std::fs::create_dir_all(parent).map_err(|e| format!("création cache: {e}"))?;
        }
        eprintln!("[RustyMail Whisper] essai {}\n → {}", url, dest.display());
        match download_hf_file_if_needed(&url, &dest, "whisper-dictation") {
            Ok(()) => return Ok(dest),
            Err(e) => {
                last_err = format!("« {file} » : {e}");
                let _ = std::fs::remove_file(&dest);
            }
        }
    }

    Err(last_err)
}

fn wav_bytes_to_f32_samples(wav: &[u8]) -> Result<Vec<f32>, String> {
    let mut reader = hound::WavReader::new(Cursor::new(wav)).map_err(|e| e.to_string())?;
    let spec = reader.spec();
    let expected = WavSpec {
        channels: 1,
        sample_rate: 16000,
        bits_per_sample: 16,
        sample_format: SampleFormat::Int,
    };
    if spec.channels != expected.channels {
        return Err(format!("WAV: mono requis ; reçu {} canaux.", spec.channels));
    }
    if spec.sample_rate != expected.sample_rate {
        return Err(format!(
            "WAV: 16000 Hz requis ; reçu {} Hz",
            spec.sample_rate
        ));
    }
    if spec.bits_per_sample != expected.bits_per_sample
        || spec.sample_format != expected.sample_format
    {
        return Err("WAV: attendu PCM 16-bit".into());
    }
    reader
        .samples::<i16>()
        .map(|s| s.map(|v| v as f32 / i16::MAX as f32))
        .collect::<Result<Vec<f32>, _>>()
        .map_err(|e| e.to_string())
}

fn validate_samples_for_dictation(samples: &[f32], sample_rate: u32) -> Result<(), WhisperError> {
    if samples.is_empty() || sample_rate == 0 {
        return Err(WhisperError::Other {
            message: "Audio vide.".into(),
        });
    }
    let duration_s = samples.len() as f32 / sample_rate as f32;
    if duration_s < 0.4 {
        return Err(WhisperError::AudioTooShort { seconds: duration_s });
    }
    let rms = (samples
        .iter()
        .map(|s| s * s)
        .sum::<f32>()
        / (samples.len() as f32))
        .sqrt();
    if rms < 0.005 {
        return Err(WhisperError::AudioSilent { rms });
    }
    Ok(())
}

pub fn wav_rms_duration(wav: &[u8]) -> Result<(f32, f32), WhisperError> {
    let samples = wav_bytes_to_f32_samples(wav).map_err(|e| WhisperError::Other { message: e })?;
    let duration_s = samples.len() as f32 / 16000.0;
    let rms = (samples
        .iter()
        .map(|s| s * s)
        .sum::<f32>()
        / (samples.len().max(1) as f32))
        .sqrt();
    Ok((duration_s, rms))
}

pub fn parse_processing_unit(unit: &str) -> WhisperAccelerator {
    match unit.trim().to_ascii_lowercase().as_str() {
        "cpu" => WhisperAccelerator::CpuOnly,
        "cuda" | "gpu" => WhisperAccelerator::Gpu,
        _ => WhisperAccelerator::Auto,
    }
}

fn whisper_gpu_compiled() -> bool {
    // Dans ce workspace, seul macOS active actuellement whisper-metal (cf. `src-tauri/Cargo.toml`).
    // Sur Windows/Linux, on compile `transcribe-rs` CPU only, donc demander `use_gpu=1` est inutile.
    cfg!(target_os = "macos")
}

fn effective_use_gpu(unit: WhisperAccelerator) -> bool {
    unit.use_gpu() && whisper_gpu_compiled()
}

pub fn transcribe_whisper_wav_bytes_typed(
    wav: &[u8],
    prefs: &rustymail_infrastructure::AiPrefs,
) -> Result<String, WhisperError> {
    let path = ensure_ggml_weights(
        &prefs.whisper_hf_repo_id,
        &prefs.whisper_hf_revision,
        &prefs.whisper_model_size,
        &prefs.whisper_transcription_profile,
        &prefs.whisper_cpp_language,
    )
    .map_err(|e| WhisperError::Other { message: e })?;

    let unit = parse_processing_unit(&prefs.whisper_processing_unit);
    set_whisper_accelerator(unit);

    let use_gpu = effective_use_gpu(unit);
    let profile = prefs
        .whisper_transcription_profile
        .trim()
        .to_ascii_lowercase();
    let flash_attn = profile != "accurate" && use_gpu;

    let load = WhisperLoadParams {
        use_gpu,
        flash_attn,
        gpu_device: GPU_DEVICE_AUTO,
    };

    let lang_owned = prefs.whisper_cpp_language.trim().to_string();
    let language: Option<String> = if lang_owned.is_empty() || lang_owned == "auto" {
        None
    } else {
        Some(lang_owned)
    };

    let n_threads = match profile.as_str() {
        "fast" => {
            let n = std::thread::available_parallelism()
                .map(|n| n.get() as i32)
                .unwrap_or(4)
                .min(8);
            n.max(1)
        }
        _ => 0,
    };

    let mut engine = WhisperEngine::load_with_params(&path, load)
        .map_err(|e: TranscribeError| WhisperError::Other {
            message: e.to_string(),
        })?;

    let samples =
        wav_bytes_to_f32_samples(wav).map_err(|e| WhisperError::Other { message: e })?;
    validate_samples_for_dictation(&samples, 16000)?;

    let mut inf = WhisperInferenceParams {
        language,
        translate: false,
        n_threads,
        ..Default::default()
    };
    if profile == "fast" {
        inf.no_speech_thold = 0.35;
    } else if profile == "accurate" {
        inf.no_speech_thold = 0.15;
    }

    let result = engine
        .transcribe_with(&samples, &inf)
        .map_err(|e: TranscribeError| WhisperError::DecodeFailed {
            message: e.to_string(),
        })?;
    if result.text.trim().is_empty() {
        return Err(WhisperError::DecodeFailed {
            message: "transcription vide".into(),
        });
    }
    Ok(result.text)
}

pub fn transcribe_whisper_wav_bytes(
    wav: &[u8],
    prefs: &rustymail_infrastructure::AiPrefs,
) -> Result<String, String> {
    transcribe_whisper_wav_bytes_typed(wav, prefs).map_err(|e| e.to_string())
}
