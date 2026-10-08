# Tauri IPC security matrix

`invoke` commands are the boundary between the WebView and Rust. This summary focuses on abuse surface (XSS, double-clicks, oversized payloads).

## Legend

| Level | Meaning |
| ----- | ------- |
| R | Read SQLite / local metadata |
| W | Write SQLite |
| Net | Network (IMAP, SMTP, model download, cloud APIs) |
| Sys | Open paths with OS default handler |

## Common guard (`src-tauri/src/ipc_guard.rs`)

Central validation before handlers:

| Identifier | Rule |
| ---------- | ---- |
| `accountId` | Non-empty, ≤ 320, `@` or `oauth:` prefix |
| `threadId` / `messageId` / `attachmentId` | Non-empty, ≤ 512, no NUL |
| `mailbox` | ≤ 512, no NUL or newlines (empty → INBOX default) |
| `jobId` / `sessionId` / drafts | Non-empty, ≤ 128 |
| `email` (address book) | Non-empty, contains `@` |
| `SearchQuery` | Bounded text/sender fields |
| `phrase` / `question` (LLM) | Dedicated bounds |
| `cacheKey` (`ai_cache_get`) | ≤ 512, no NUL/newlines; allowed prefixes: `summary:v2:`, `translate:v2:`, `contact_profile:v1:` |

Anchors: `resolve_account_from_paths`, `open_thread_domain`, thread/IMAP/draft commands, LLM (`llm_commands`, `llm_stream`), address book.

## AI cache SQLite (`ai_cache`)

| Aspect | Behavior |
| ------ | -------- |
| WebView read | `ai_cache_get` only — key validated |
| WebView write | **None** — `ai_cache_put` removed from invoke surface |
| Backend write | `sqlite_ai_cache_put` from summary/translation/contact/stream |
| Size | Key ≤ 512 B; payload ≤ 256 KiB |
| TTL | By prefix: summary 7d, translation 30d, contact 14d |
| Purge | `sqlite_ai_cache_purge_expired` at startup |
| Legacy | `sqlite_ai_cache_backfill_null_expires` for old rows |

Front-end reads via **`invokeAiCacheGet`** (`ipc_bridge.ts`) with dedup and timeout.

## Mail security analysis (`mail_security`)

| Layer | Role |
| ----- | ---- |
| Heuristics | SPF/DKIM/DMARC, risky attachments, Reply-To/Return-Path, urgency, punycode — **always kept** |
| LLM (`llm_security_signals_augment`) | Soft signal enrichments; cannot remove hard findings |
| Fallback | Invalid JSON → heuristics only |
| Preference | `feature_security_llm_enabled` default **off** |

## Sensitive commands (sample)

| Command(s) | Levels | Controls |
| ---------- | ------ | -------- |
| `save_account` | W, keyring | Domain validation; invalid TLS not persisted in release; audit email masked |
| `sync_*` IMAP | Net, W | ID validation; rate_guard |
| `open_attachment` / `download_attachment` | R, Sys | ID validation; risky MIME + user ack; audit logs |
| `inline_attachment_fetch` | R | message + CID validation |
| `set_app_prefs` | W file | AI URL validation |
| LLM commands | W cache / Net | `llm_gate`; JSON validators; untrusted mail wrapper |
| `ai_cache_get` | R | Validated keys only |
| Org center apply | Net+W | Trash/delete mailbox backend acks ; optional `batchId` (hex UUID) shared across V2 chunks |
| Org v2 scan | Net (LLM) | Heuristics are prompt context. Response is a validated orientation or a status message; proposals shown are LLM actions only |
| Updater plugin | Net | Capabilities `updater:default` (check, download, install). Downloads happen in Rust, not the WebView. No install without a user click. |
| Process restart | Sys | `process:allow-restart` only — `process:allow-exit` is not granted |
| Demo account reset/remove | W | Scoped to `playground@demo.rustymail.app` |

## Command families (status)

| Family | Risk | Status |
| ------ | ---- | ------ |
| Status/capabilities | R metadata | OK |
| Threads/search | R SQLite | Bounded pagination; validated queries |
| Digest bench (`digest_fixture_preview`, `digest_bench_*`) | R mail HTML, W two local files | YAML ≤ 64 KiB, schema-validated, no code. Accept does not change reading. Enable/disable is a separate command |
| Digest cut editor (`digest_cut_*`) | R sample HTML, optional Net (LLM propose) | Bounded HTML/YAML; proposal does not write reading registry; preview reuses bench preview |
| Drafts | R/W | Follow-up: body/HTML bounds on all draft commands |
| Send | SMTP, FS | `validate_draft_for_ipc`; send ack backend ; `send_draft` accepte `sendId` (UUID). Registre mémoire + table `send_attempts` (TTL 1 h, lignes plus vieilles supprimées). Rejeu silencieux seulement pour le même `sendId` (reprise de cette tentative, y compris après redémarrage si l'UI restaure cet id). Un autre id part toujours en SMTP, même à empreinte égale. Empreinte : compte, id de brouillon, destinataires, objet, corps, pièces jointes, `in_reply_to`, références, `send_html`. Même id et autre empreinte → refus. Un `inflight` de plus de 3 minutes est repris (risque de double envoi si le SMTP avait déjà accepté). `send_draft_status` lit ce registre |
| `threads_mark_read_bulk` | Net, W | `validate_thread_mailbox_batch` (≤ 500) ; une session IMAP par dossier ; un rechargement du cœur |
| Attachments | FS, OS | Sanitized names; CID image-only limits |
| Prefs/secrets | W prefs, keyring | URL validation; secrets in keyring |
| Dictation/models | audio, Net/CPU | Bounded audio payload |
| LLM | Net/cache | Feature gates; contract validators |
| Accounts/OAuth | Net, keyring | Delete ack; autoconfig documented |
| IMAP sync/mailbox ops | Net, destructive | Sync bounds; trash/delete acks |

## HTTP LLM engine (`rustymail-llm`)

| Aspect | Behavior |
| ------ | -------- |
| `generate_json` | JSON extraction + deserialize; optional GBNF merge |
| GBNF grammar | Sent to **llama-server** only; ignored on OpenRouter and Ollama |
| Business validation | Callers + `ai_llm_contracts` — see [LLM_CONTRACTS.md](LLM_CONTRACTS.md) |

## Local CI regression targets

- `ipc_guard::tests` — acks, pagination, sync, cache keys
- `sanitizeEmailHtml` — remote images, unsupported links, `url()` styles
- Attachment infra tests — extensions, double extension, Windows names, CID
- `ai_llm_contracts` — invalid JSON, bounds, untrusted mail wrapper
- Account delete purges scoped AI cache before SQLite removal

## Related

- [SECURITY.md](SECURITY.md)
- [LLM_CONTRACTS.md](LLM_CONTRACTS.md)
