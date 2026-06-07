# AI & models

RustyMail separates **small on-device models** (search + dictation) from **generative LLMs** (HTTP only).

## Overview

| Layer | Technology | When downloaded |
| ----- | ---------- | --------------- |
| Semantic search | MiniLM L6 v2 (ONNX) | First launch bootstrap (~90 MB) |
| Dictation | whisper.cpp GGML (tiny at bootstrap) | First launch bootstrap |
| Chat / summaries / etc. | GGUF via HF cache + **llama-server** OR **OpenRouter** | Only when local LLM enabled in Settings |

The desktop app **does not link llama.cpp**. Generative calls use HTTP `POST /v1/chat/completions` toward:

- **OpenRouter** (API key in keyring), and/or
- **llama-server** (or any OpenAI-compatible server), typically `http://127.0.0.1:8080/v1`

GPU usage is determined by your **external** llama-server process.

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

## OpenRouter

- Enable in Settings; set model id (default `openai/gpt-4o-mini`)
- API key via keyring commands (`*_api_key_*`) — never in `app_prefs.json`
- Optional cloud fallback when local server unavailable (`aiCloudLlmFallback`)

## Privacy & redaction

Before sending prompts to **third-party** endpoints (OpenRouter, non-loopback URLs), `rustymail-llm` redacts emails, phones, IBAN, cards, Bearer/JWT tokens. **Loopback llama-server** keeps full content (stays on machine). See [SECURITY.md](SECURITY.md).

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

Structured LLM outputs are validated in Rust (`ai_llm_contracts`). GBNF grammars apply on llama-server only. See [LLM_CONTRACTS.md](LLM_CONTRACTS.md).

## Related

- [CONFIGURATION.md](CONFIGURATION.md)
- [CAPABILITIES.md](CAPABILITIES.md)
- [IPC_SECURITY.md](IPC_SECURITY.md)
