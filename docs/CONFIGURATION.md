# Configuration & preferences

Preferences are stored in **`app_prefs.json`** next to `rustymail.sqlite3` under the app data directory. Secrets (passwords, API keys, SQLCipher key, OAuth tokens) live in the **OS keyring** or restricted files — never in prefs JSON.

## Settings vs first-run wizard

| Surface | Scope |
| ------- | ----- |
| **First-run wizard** | 3-step onboarding: language, quick feature toggles (dictation, semantic search, local LLM), startup guide; marks `general.firstRunDismissed` |
| **Settings** | All ongoing configuration: accounts, mother language, AI, archive rules, storage paths |

The wizard does **not** configure mail accounts or API keys.

## General preferences (`general`)

| Field | Description |
| ----- | ----------- |
| `motherLanguage` | BCP-47-ish code (default `fr`). Drives UI locale (`fr`/`en` packs), translation targets, archive month folder names |
| `firstRunDismissed` | Welcome dialog shown until true |
| `bootstrapModelsCompleted` | Set after MiniLM + Whisper bootstrap succeed |
| `defaultAccountId` | Account selected at startup |
| `defaultListFilter` | Inbox filter: `all`, `unread`, `starred`, `focused`, `auto` |
| `archiveLayout` | `hierarchical` (`Archive/YYYY/MM-month`) or `flat` |
| `archiveRoot` | Root mailbox name for hierarchical archive (default `Archive`) |
| `orgKeywordRules` | Keyword → mailbox routing rules for organization center |
| `activitySuggestionsEnabled` | On-device activity-based view suggestions |
| `addressBookGlobalScope` | Address book scope across accounts |

## AI preferences (`ai`)

See [AI_AND_MODELS.md](AI_AND_MODELS.md) for full detail. Summary:

- **Dictation:** backend (`demo`, `whisper_cpp`, `cloud`, `local_http`), Whisper model size, PTT key
- **Semantic search:** `semanticSearchEnabled` (requires MiniLM ONNX on disk)
- **Local LLM:** HF repo/revision/GGUF filename, context size, GPU preference
- **OpenRouter:** enabled flag, base URL, model id — **API key in keyring only**
- **llama-server:** base URL (default `http://127.0.0.1:8080/v1`), spawn options, binary path
- **Feature toggles:** per-feature gates (`featureThreadSummaryEnabled`, `featureSecurityLlmEnabled`, etc.)
- **Background tasks:** auto semantic index, LLM prefetch, idle cache prefetch

## Validation

`set_app_prefs` validates AI URLs (allowed schemes, no credentials in URL). Invalid TLS acceptance for IMAP/SMTP is **not persisted in release builds**.

## Storage diagnostics

Tauri commands expose paths for support (use carefully in production logs):

- `app_status` — vault location, capabilities summary
- `app_paths` — database, prefs, model directories

## Environment variables (OAuth clients)

Used at process startup (and optionally **embedded at build** for release binaries — see [OAUTH.md](OAUTH.md)):

| Variable | Purpose |
| -------- | ------- |
| `RUSTYMAIL_GOOGLE_OAUTH_CLIENT_ID` | Google OAuth desktop client |
| `RUSTYMAIL_GOOGLE_OAUTH_CLIENT_SECRET` | Google Desktop secret (non-confidential; required by token endpoint) |
| `RUSTYMAIL_MICROSOFT_OAUTH_CLIENT_ID` | Entra public client |
| `RUSTYMAIL_OAUTH_LOOPBACK_PORT` | Default `52789` for redirect |
| `RUSTYMAIL_OAUTH_ALLOW_EPHEMERAL_PORT` | Dev escape hatch if port busy (`0` recommended) |

Placeholders only in docs — copy [`.env.example`](../.env.example) locally. See [OAUTH.md](OAUTH.md).

## Mother language & i18n

- **`general.motherLanguage`** selects UI strings via `src/i18n.ts` (`fr*` → French, `en*` → English, else English)
- Date/number formatting uses `fr-FR` or `en-US`
- AI translation and summaries target the mother language by default
- UI copy in code may still contain French strings in places; new UI work should add both locale packs

## Related

- [ACCOUNTS.md](ACCOUNTS.md) — mail account setup
- [AI_AND_MODELS.md](AI_AND_MODELS.md) — model and feature preferences
- [SECURITY.md](SECURITY.md) — keyring, redaction, release checklist
