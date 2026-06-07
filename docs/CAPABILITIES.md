# Current capabilities

**Last updated:** 2026-06-03  
**Reference:** `main` branch — Tauri v2, Rust workspace `core + modules`.

This document describes what the application **can do today**. For architecture see [ARCHITECTURE.md](ARCHITECTURE.md); for AI setup see [AI_AND_MODELS.md](AI_AND_MODELS.md).

---

## Summary

RustyMail is a **local-first desktop mail client**: **IMAP** sync, **SMTP** send, **SQLite** cache, **Vite/TypeScript** UI driven by **Tauri** Rust commands. Business logic lives in Rust, not the front end.

---

## Accounts & authentication

| Capability | Detail |
| ---------- | ------ |
| Multiple accounts | List, create, edit, delete; active account in UI |
| Manual IMAP/SMTP | Hosts, ports, TLS modes, invalid cert option (debug only) |
| Server discovery | `discover_mail_servers` helper |
| Desktop OAuth | Google and Microsoft flows when env vars set |
| Secrets | Passwords and API keys in **OS keyring** |
| Demo fallback | `seeded_app_core` if SQLite fails to init (non-production) |

---

## Mailboxes & sync

| Capability | Detail |
| ---------- | ------ |
| IMAP folder list | Sidebar from live server LIST |
| Sync | `sync_inbox`, `sync_mailboxes` — incremental UID, MIME, threading, SQLite upsert |
| IMAP IDLE | Background IDLE on INBOX → `imap-push` event → background sync; polling fallback ~90s |
| Unread badges | Per mailbox (`mailbox_unread_counts`) |
| Folder management | Create, rename, delete, subscribe on IMAP |
| Pagination | SQL `LIMIT`/`OFFSET` thread list + “Load more” |
| Trash | Move to Trash + empty trash |
| **Organization center** | Sidebar “Organize”: heuristic scan, batch cards (stale inbox, unsubscribe candidates, cross-folder duplicates, tags…), hierarchical archive `Archive/YYYY/MM-month`, LLM proposals when enabled |

---

## Threads, reading & actions

| Capability | Detail |
| ---------- | ------ |
| List / open | Threads by account + mailbox; cleaned discussion view |
| Search | Sender, tags, language filters; **lexical**, **semantic**, or **hybrid** text search |
| Thread actions | Trash, archive, move; read/unread (IMAP STORE + DB) |
| Follow | `thread_toggle_follow` |
| Inbound HTML | DOMPurify sanitization + guards; remote images blocked by default |
| Attachments | Metadata + blob in sync; download, OS open, inline `cid:` for HTML |
| Newsletters | Subscription rules; thread enrichment in infra |

### Message cleaning & security (`rustymail-modules`)

Opening a message produces a `CleanedMessageView`:

- **Text:** signature stripping, quote folding, entity/tag extraction
- **HTML:** provider pipelines — generic, **Amazon**, **Deblock**
- **Security:** heuristic `mail_security` (SPF/DKIM/DMARC, attachments, punycode, composite score); optional LLM augment merges without removing hard signals — see [IPC_SECURITY.md](IPC_SECURITY.md)

---

## Compose & send

| Capability | Detail |
| ---------- | ------ |
| Reply | Reply, reply-all (To/Cc from synced headers), forward with quoting |
| Draft | Markdown preview; To/Cc/Bcc; optional multipart plain+HTML |
| Reply headers | `In-Reply-To`, `References` on SMTP send |
| Outbound attachments | Local paths, `multipart/mixed` |
| Send | Real SMTP (`lettre`); Sent folder copy per config |
| Local drafts | Revisions (`draft_revision_*`), saved drafts (`saved_draft_*`) |
| Split send | `plan_split_send` / `execute_split_send_cmd` for multi-recipient cases |
| Reply guards | Blocks when thread marked newsletter per product rules |

---

## Dictation & audio

| Capability | Detail |
| ---------- | ------ |
| Local Whisper | `transcribe_dictation` via whisper.cpp |
| Cloud dictation key | Optional API key in keyring |
| Prefetch | Whisper model download + test dictation |
| Demo | `transcribe_demo` simplified path |

---

## Semantic search (local)

| Capability | Detail |
| ---------- | ------ |
| Model | MiniLM L6 v2 ONNX (`rustymail-semantic`, feature `embeddings-onnx`) |
| Index | Embeddings in SQLite; reindex by account or mailbox |
| Prefetch | Model bundle in app data `models/all-MiniLM-L6-v2/` |
| Status | `semantic_model_available`, per-mailbox embedding counts |

---

## Generative AI (HTTP)

No in-process llama.cpp. Calls via HTTP to OpenRouter and/or llama-server.

Commands include: translate, rewrite, grammar, quick replies, Q&A, inbox digest, security augment, NL search, org proposals.

- **Settings → AI → On my PC & cloud:** LLM status, hardware hints, GGUF cache, prefetch
- **Background idle cache:** optional summary/translation prefetch for visible threads
- JSON contracts: [LLM_CONTRACTS.md](LLM_CONTRACTS.md)

---

## Preferences & diagnostics

- Prefs JSON beside SQLite database
- `app_status`, `app_paths`, `capabilities`
- Audit logging: `rustymail::audit`, `rustymail_infrastructure` — tune with `RUST_LOG`

---

## Known limits

- HTML trust: DOMPurify + guards, not a full “text-only by default” policy
- Reply-all / forward: ongoing polish (dedup recipients, citations)
- Generative AI requires external server or OpenRouter
- Some tag/summary paths stay **deterministic** until an LLM is reachable
- UI locale packs: `fr` and `en`; not every string may be translated yet

---

## Quick verification

```bash
npm run verify:compile
npm run tauri:dev
```
