# Security & privacy

Security practices for development, release, and daily use. Combines the former release checklist and privacy hardening notes.

## Release checklist

Before publishing an installable bundle (MSI/NSIS):

### Secrets & installer

1. No runtime `.env` in MSI/NSIS artifacts. **Public** desktop OAuth client credentials (Google Desktop ID + non-confidential secret, Microsoft client ID) may be **embedded at build** so OAuth works without a RustyMail server — see [OAUTH.md](OAUTH.md).
2. **Never** embed user access/refresh tokens. User tokens stay in the OS keyring after interactive login.
3. Google/Microsoft OAuth buttons disabled when neither build-time embed nor runtime env provides client credentials.
4. First launch: lightweight HF models (MiniLM + Whisper bootstrap); chat GGUF only if local LLM enabled in Settings.

### Configuration

5. Inspect CSP in `src-tauri/tauri.conf.json` — avoid `null` CSP in release.
6. **Release builds:** verify no development path exposes `danger_accept_invalid*` for real IMAP/SMTP (`effective_allow_invalid_tls` tied to debug).
7. Preferences: API / companion URLs rejected if outside allowed schemes (manual tests: `javascript:`, SMB paths, credentials in URL).

### Dependencies

8. Run `cargo audit` (CI [`.github/workflows/cargo-audit.yml`](../.github/workflows/cargo-audit.yml)); fix or document exceptions.

### Updater

8b. The minisign **private** key exists only as the GitHub Actions secret `TAURI_SIGNING_PRIVATE_KEY` (optional password secret). It is not in the repo, the installer, or release notes. The matching **public** key is the `plugins.updater.pubkey` string in `tauri.conf.json` (placeholder replaced for 0.3.1). See [RELEASE.md](RELEASE.md).

### Local data

9. After upgrade: confirm `rustymail.sqlite3` opens (SQLCipher). A plaintext `*.pre-sqlcipher.bak` is removed after two successful launches. A version change keeps a single encrypted `*.pre-<version>.bak` (about 1× the database file; the copy is skipped when free space is below that size, and the app shows the stored notice until a later launch succeeds).
10. IMAP push: new mail detected without manual Sync (check `imap-push` in logs).

### Functional smoke tests

11. HTML mail with remote/`cid:` images renders (DOMPurify retained).
12. Opening risky executable attachment: double confirmation + predictable error if ack missing.
13. IMAP sync: rate limit slows bursts but does not block normal use indefinitely.

### Log hygiene

14. Sample `rustymail::audit` lines: no full secrets, no systematic full home paths.

---

## Data at rest

### SQLCipher

- `rusqlite` with `bundled-sqlcipher-vendored-openssl`
- 256-bit key in OS keyring (`sqlcipher-db-v1` / service `RustyMail`)
- A keyring error other than a missing entry does not overwrite the key. The UI shows « Base verrouillée : trousseau inaccessible, réessayer ».
- A missing keyring entry creates a key only when no database file exists yet, or the file is still plaintext SQLite, and there is no staging file (`*.encrypting` / `*.encrypt-staging`), migrating marker, or `*.bak`. If an encrypted database is already on disk, startup fails with the same locked message: no new key is stored and the file is not quarantined.
- Migrating plaintext DB: marker `*.sqlcipher-migrating`, `ATTACH` + `sqlcipher_export`, backup `*.pre-sqlcipher.bak`
- That plaintext backup is deleted after two verified opens of the encrypted database
- Restore from `*.pre-sqlcipher.bak` only when a plaintext→encrypted migration was interrupted (staging `*.encrypting` / `*.encrypt-staging`, or the migrating marker). The current file is renamed `*.unreadable-<timestamp>` before the backup is copied (it is not deleted). An unreadable encrypted file outside that interrupted-migration path is also renamed and is not overwritten
- Before a schema migration when `app_meta.last_app_version` differs, one encrypted copy `*.pre-<version>.bak` is kept (older version copies are removed). Free space required is **1×** the database file size (the live file is already allocated). `PRAGMA wal_checkpoint(TRUNCATE)` must report `busy = 0` before the copy. If the checkpoint is incomplete, space is short, or the copy fails, `last_app_version` is left unchanged (the next launch retries) and `app_meta.version_backup_notice` is set; the text is shown at startup
- OAuth token files (`oauth_tokens/*.json`) are AES-256-GCM (`RMOT1` header). The 32-byte key `oauth-file-key-v1` lives in the OS keyring and is created only when the entry is missing. Writes use a unique temporary name (`<file>.<pid>.<n>.tmp`, then rename). A legacy plaintext JSON file is rewritten encrypted on read. A legacy monolithic keyring secret is deleted only after that encrypted store succeeds
- Info logs for OAuth use a short hash (`ref:`) of the account id. They do not include the email address or the token-file path
- IMAP UIDs that could not be parsed are stored in `imap_sync_skipped` and are not fetched again (`last_uid` moves past them). Those rows are deleted when the account is deleted and when that mailbox's UIDVALIDITY changes

### Keyring

- Account passwords, OpenRouter key, dictation API key, SQLCipher key
- Linux: `keyring::use_native_store(false)` may use keyutils vs Secret Service
- Windows/macOS: native OS store

---

## LLM privacy

### Redaction before third-party calls

Module `crates/rustymail-llm/src/privacy.rs` redacts when `LlmEngine::exfiltrates_to_third_party()`:

- Emails, phones, IBAN, cards, Bearer/JWT tokens, `message_id=` prefixes

**Always redacted:** OpenRouter  
**Redacted:** non-loopback OpenAI-compatible URLs (llama-server or Ollama)  
**Not redacted:** llama-server or Ollama on loopback (`127.0.0.1`, `localhost`, `[::1]`)

Organiser’s prior-decisions block uses the same path (`redact_user_content_if_needed` inside `untrusted_mail_content_block`). The block carries action, target mailbox, rule id, one sender domain and a few keywords — not message bodies, full addresses, or thread id lists. See [ORGANISER_V2.md](ORGANISER_V2.md).

Deleting an account purges that account’s `org_decisions`, `org_memory`, and `org_apply_history` rows from `rustymail.sqlite3`. Newsletter rules stay global to the profile.

### AI cache

SQLite `ai_cache` stores model **responses** in plaintext with TTL by key prefix. WebView cannot write arbitrary cache entries.

### OAuth errors

`provider_errors.rs` — provider JSON never returned whole to UI; bounded redacted excerpt + `oauth_error` code.

---

## IPC & HTML

- Central validation in `src-tauri/src/ipc_guard.rs` — see [IPC_SECURITY.md](IPC_SECURITY.md)
- HTML: DOMPurify + `sanitizeEmailHtml` — blocks remote images by default, neutralizes unsupported links
- Attachments: MIME/extension policy, user ack for risky opens, sanitized download names

---

## Developer secrets

| Do | Don't |
| -- | ----- |
| Use `.env` locally (gitignored) | Commit `.env` or real client secrets |
| Placeholder values in docs | Paste production tokens in issues |
| Copy `.env.example` | Document actual secret values from the repo |

---

## Related

- [OAUTH.md](OAUTH.md)
- [RELEASE.md](RELEASE.md)
- [IPC_SECURITY.md](IPC_SECURITY.md)
