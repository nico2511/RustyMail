# Architecture

RustyMail follows a **layered Rust workspace** plus a thin **Tauri presentation shell**. Business rules never live in the TypeScript front end.

## Layer diagram

```text
┌─────────────────────────────────────────────────────────┐
│  src/ (Vite + TypeScript)                               │
│  UI, i18n, DOMPurify — invokes Tauri commands only      │
└──────────────────────────┬──────────────────────────────┘
                           │ invoke (IPC)
┌──────────────────────────▼──────────────────────────────┐
│  src-tauri/                                             │
│  Command handlers, ipc_guard, model bootstrap, IMAP push│
└──────────────────────────┬──────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────┐
│  rustymail-application/   Use cases & orchestration     │
└──────────────────────────┬──────────────────────────────┘
                           │
        ┌──────────────────┼──────────────────┐
        ▼                  ▼                  ▼
 rustymail-domain/  rustymail-infrastructure/  rustymail-modules/
 (pure types)       (IMAP, SMTP, SQLite,       (cleaning, security,
                     keyring, prefs, OAuth)     AI feature modules)
        │                  │                  │
        └──────────────────┼──────────────────┘
                           ▼
              rustymail-llm/     rustymail-semantic/
              HTTP LLM client    MiniLM ONNX embeddings
```

## Crates

### `rustymail-domain`

Pure product language: accounts, messages, threads, drafts, tags, entities, search queries. Minimal dependencies.

### `rustymail-application`

Workflows the UI triggers: list/search/open threads, prepare drafts, preview, send validation, organization proposals.

### `rustymail-infrastructure`

Adapters and persistence:

- **SQLite** (`rustymail.sqlite3`, WAL, SQLCipher at rest)
- **IMAP** session, sync, mailbox ops, **IDLE push** (`imap_push.rs` → Tauri event `imap-push`)
- **SMTP** send via `lettre`
- **Keyring** for passwords and API keys
- **Unified search** (lexical + semantic index)
- **App preferences** JSON next to the database
- OAuth token storage (keyring + overflow files under `oauth_tokens/`)

### `rustymail-modules`

Optional product capabilities:

- **Readability pipeline** → `CleanedMessageView`
- **`mail_cleaning`** — generic, Amazon, Deblock provider pipelines
- **`mail_security`** — SPF/DKIM/DMARC heuristics, attachment risk, punycode
- **`ai_*`** — translation, summary, Q&A, rewrite, quick replies, NL search, org proposals

### `rustymail-llm`

HTTP client for `/v1/chat/completions` (OpenRouter, llama-server, other OpenAI-compatible endpoints). Privacy redaction before third-party exfiltration.

### `rustymail-semantic`

MiniLM L6 v2 embeddings (ONNX feature `embeddings-onnx`); vectors stored in SQLite for hybrid search.

### `src-tauri`

Desktop integration:

| Module | Role |
| ------ | ---- |
| `lib.rs` | App setup, command registration, dotenv (debug only) |
| `ipc_guard.rs` | Central validation for invoke payloads |
| `llm_commands.rs` / `llm_stream.rs` | Generative AI commands |
| `model_bootstrap.rs` | First-run MiniLM + Whisper download |
| `imap_push.rs` | Per-account IMAP IDLE coordinator |
| `llama_winget.rs` / `llama_server_spawn.rs` | Optional local server install/spawn |

## Data locations

Under the OS app data directory (see **Settings → Storage** or `app_paths` command):

| Path | Purpose |
| ---- | ------- |
| `rustymail.sqlite3` | Mail cache, threads, AI cache, embeddings metadata |
| `app_prefs.json` | Non-secret preferences |
| `models/all-MiniLM-L6-v2/` | Semantic search ONNX bundle |
| `models/local-llm/` | Cached GGUF for local chat (when enabled) |
| `oauth_tokens/` | Large Microsoft tokens if keyring entry exceeds OS limits |

## Runtime fallback

If SQLite initialization fails, the app loads **`seeded_app_core`** so the shell still runs (demo/recovery only — not normal operation).

## Frontend boundaries

- **`src/main.ts`** — large monolith UI; calls Rust via `@tauri-apps/api`
- **`src/i18n.ts`** — UI locale from `general.motherLanguage` pref (`fr` / `en` packs)
- **`src/setupWizard.ts`** — first-run dialog (llama-server winget opt-in)
- **`src/prefs_defaults.ts`** — default preference shape (mirrors Rust validation)

HTML from mail is sanitized with **DOMPurify** before render; remote images blocked by default.

## Related docs

- [CAPABILITIES.md](CAPABILITIES.md) — feature matrix
- [IPC_SECURITY.md](IPC_SECURITY.md) — invoke command surface
- [SECURITY.md](SECURITY.md) — encryption, keyring, release checks
- [AI_AND_MODELS.md](AI_AND_MODELS.md) — models and generative features
