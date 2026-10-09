# AI & models

RustyMail separates **small on-device models** (search + dictation) from **generative LLMs** (HTTP only).

## Overview

| Layer | Technology | When downloaded |
| ----- | ---------- | --------------- |
| Semantic search | MiniLM L6 v2 (ONNX) | First launch bootstrap (~90 MB) |
| Dictation | whisper.cpp GGML (tiny at bootstrap) | First launch bootstrap |
| Chat / summaries / etc. | **OpenRouter**, **llama-server**, or **Ollama** | GGUF download only when local LLM enabled |

The desktop app **does not link llama.cpp**. Generative calls use the same HTTP client: `POST /v1/chat/completions` toward:

- **OpenRouter** (API key in keyring), and/or
- **llama-server** (or any OpenAI-compatible server), typically `http://127.0.0.1:8080/v1`, or
- **Ollama**, typically `http://127.0.0.1:11434/v1` plus the model name from `ollama list`

Settings → IA → Moteurs chooses the backend: Sur mon PC (llama-server), Cloud (OpenRouter), Hybride, or **Ollama**. `chatBackend` is `auto`, `openrouter`, `llama-server`, or `ollama` (`auto` keeps the previous priority: OpenRouter, then llama-server, then Ollama if that one is enabled).

GPU usage for llama-server is determined by the **external** process. Ollama manages its own device; RustyMail does not apply the llama-server GPU gate to it.

## First-run bootstrap

On startup, if MiniLM is missing, a background thread runs `bootstrap_small_models`:

1. Download MiniLM ONNX assets to `models/all-MiniLM-L6-v2/`
2. Download Whisper **tiny** weights (fast profile)
3. Emit `model_bootstrap_progress` / `model_bootstrap_done` events
4. Set `general.bootstrapModelsCompleted` when both succeed

Failures are non-fatal; semantic search and dictation degrade gracefully.

## First-run wizard vs Settings

| Step | Where |
| ---- | ----- |
| Welcome + optional llama-server winget | First-run overlay (`setupWizard.ts`) |
| Enable local LLM, download GGUF | **Settings → AI → On my PC & cloud** |
| OpenRouter API key | **Settings → AI** (stored in keyring) |
| Per-feature toggles | Settings AI feature switches |
| Mother language | **Settings → General** |

Chat GGUF (~2 GB default: Qwen2.5-3B Q4) downloads only when **`localLlmEnabled`** is true (or prefetch flags set).

## Local LLM (llama-server)

1. Install **llama-server** (PATH or winget helper from wizard/Settings)
2. Enable **llama-server** in Settings; set base URL and model alias
3. Optional: **spawn** llama-server with cached GGUF (loopback only)
4. UI shows RAM hints and cached GGUF list (`list_cached_gguf_models`)

Default HF target (prefs): `Qwen/Qwen2.5-3B-Instruct-GGUF` / `qwen2.5-3b-instruct-q4_k_m.gguf`

GBNF grammars are sent **only** to llama-server. OpenRouter and Ollama ignore them; Rust validators stay the source of truth (Organiser orientation included).

## Ollama

1. Run Ollama (`ollama serve`) and pull a model (`ollama pull llama3.2`)
2. Settings → IA → Moteurs → **Ollama**
3. Base URL default `http://127.0.0.1:11434/v1`, model name as in `ollama list`
4. Chat calls the native API `POST {host}/api/chat` (the `/v1` suffix is stripped). The body sends `options.num_ctx` (preference `localLlmContextSize`, else 8192), `options.num_predict`, `think: false`, and `keep_alive` (preference `ollamaKeepAlive`, default `30m`). JSON features set `format: "json"`. Streaming is NDJSON (`message.content`, `done: true`).
5. Status probes `GET {base}/models` (about 2s). If nothing answers, the line says **injoignable** and Organiser shows that message instead of inventing an orientation

No API key. Loopback Ollama is not treated as third-party exfiltration. A remote Ollama URL is redacted like any other non-loopback host. RustyMail does not install or start the Ollama binary. OpenRouter and llama-server stay on `/v1/chat/completions`.

## OpenRouter

- Enable in Settings; set model id (default `openai/gpt-4o-mini`)
- API key via keyring commands (`*_api_key_*`) — never in `app_prefs.json`
- Optional cloud fallback when local server unavailable (`aiCloudLlmFallback`)

## Privacy & redaction

Before sending prompts to **third-party** endpoints (OpenRouter, non-loopback URLs), `rustymail-llm` redacts emails, phones, IBAN, cards, Bearer/JWT tokens. **Loopback llama-server and loopback Ollama** keep full content (stays on machine). See [SECURITY.md](SECURITY.md).

## Dictation

| Backend | Description |
| ------- | ----------- |
| `demo` | Simplified path without real STT |
| `whisper_cpp` | Local whisper.cpp (default after bootstrap) |
| `cloud` | OpenAI-compatible transcription API |
| `local_http` | Custom companion server |

Push-to-talk key configurable (default `F9`). Optional post-dictation LLM style rewrite (`dictationRewriteWithStyle`).

## Semantic search

Requires MiniLM ONNX + `semanticSearchEnabled`:

- Modes: **lexical**, **semantic**, **hybrid**
- Reindex per account/mailbox via Settings or Tauri commands
- Background auto-index optional (`aiBackgroundAutoSemanticIndex`)

## Generative features (feature flags)

| Feature pref | Capability |
| ------------ | ---------- |
| `featureThreadSummaryEnabled` | Thread summary |
| `featureThreadTranslateEnabled` | Thread translation |
| `featureMessageTranslateEnabled` | Single message translation |
| `featureComposeRewriteEnabled` | Composer rewrite |
| `featureComposeGrammarEnabled` | Grammar pass |
| `featureQuickReplyThreadEnabled` | Quick replies in thread |
| `featureQuickReplyComposeEnabled` | Quick replies in composer |
| `featureInboxDigestEnabled` | Mailbox action brief / digest |
| `featureSearchNlEnabled` | Natural-language search |
| `featureThreadQaEnabled` | Q&A on thread |
| `featureSecurityLlmEnabled` | LLM augment for mail security (off by default) |
| `featureOrgProposalsEnabled` | Organization center LLM cards |
| `featureContactProfileEnabled` | Contact profile extraction |

When no LLM backend is reachable, modules fall back to **deterministic** behavior where implemented.

## AI cache

SQLite `ai_cache` stores LLM responses with TTL by key prefix. The WebView may **read** via `ai_cache_get` (validated keys only); **writes are backend-only**. Idle prefetch can warm summary/translation cache for visible threads.

## JSON contracts

Structured LLM outputs are validated in Rust (`ai_llm_contracts`). GBNF grammars apply on llama-server only; Ollama and OpenRouter rely on the same Rust checks. See [LLM_CONTRACTS.md](LLM_CONTRACTS.md).

## Related

- [CONFIGURATION.md](CONFIGURATION.md)
- [CAPABILITIES.md](CAPABILITIES.md)
- [IPC_SECURITY.md](IPC_SECURITY.md)
