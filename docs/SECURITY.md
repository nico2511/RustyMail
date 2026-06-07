# Security & privacy

Security practices for development, release, and daily use. Combines the former release checklist and privacy hardening notes.

## Release checklist

Before publishing an installable bundle (MSI/NSIS):

### Secrets & installer

1. No `.env` file or embedded OAuth keys in MSI/NSIS artifacts.
2. **Release builds:** `dotenv` loaded only in **debug** (`tauri dev`) — not at installed runtime.
3. Google/Microsoft OAuth buttons disabled when environment variables are absent.
4. First launch: lightweight HF models (MiniLM + Whisper bootstrap); chat GGUF only if local LLM enabled in Settings.

### Configuration

5. Inspect CSP in `src-tauri/tauri.conf.json` — avoid `null` CSP in release.
6. **Release builds:** verify no development path exposes `danger_accept_invalid*` for real IMAP/SMTP (`effective_allow_invalid_tls` tied to debug).
7. Preferences: API / companion URLs rejected if outside allowed schemes (manual tests: `javascript:`, SMB paths, credentials in URL).

### Dependencies

8. Run `cargo audit` (CI [`.github/workflows/cargo-audit.yml`](../.github/workflows/cargo-audit.yml)); fix or document exceptions.

### Local data

9. After upgrade: confirm `rustymail.sqlite3` opens (SQLCipher migration) and `*.pre-sqlcipher.bak` exists if a plaintext DB was migrated.
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
- Migrating plaintext DB: `ATTACH` + `sqlcipher_export` + backup `*.pre-sqlcipher.bak`
- Failed migration: restore from backup if valid

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
**Redacted:** non-loopback OpenAI-compatible URLs  
**Not redacted:** llama-server on loopback (`127.0.0.1`, `localhost`, `[::1]`)

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
