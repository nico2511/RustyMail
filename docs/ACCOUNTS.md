# Mail accounts

RustyMail supports **multiple IMAP/SMTP accounts** with credentials stored in the **OS keyring**.

## Adding an account

**Settings → Accounts** (or account setup flow):

1. Choose **Google**, **Microsoft**, or **password (IMAP/SMTP)**.
2. For manual setup: host, port, TLS mode, optional “allow invalid certificate” (**debug builds only** for real TLS bypass).
3. Use **Discover servers** (`discover_mail_servers`) to autofill common providers from an email address.
4. Save — password or OAuth tokens go to keyring; account metadata to SQLite.

## IMAP / SMTP (password auth)

| Setting | Notes |
| ------- | ----- |
| IMAP host/port | STARTTLS or TLS as configured |
| SMTP host/port | Outbound send via `lettre` |
| Invalid TLS | Allowed only in debug; not persisted in release |

After save, sync pulls folders and messages incrementally (UID-based).

## OAuth (Google / Microsoft)

Desktop OAuth with **PKCE** and loopback redirect `http://127.0.0.1:<port>`.

- Buttons are **disabled** unless developer env vars are set (see [OAUTH.md](OAUTH.md)).
- Tokens stored in keyring (Microsoft may overflow to `oauth_tokens/` JSON files).
- IMAP/SMTP use **XOAUTH2** after successful login.

End users of **release installers** use password auth unless you distribute OAuth client IDs through your own deployment process (not bundled in the MSI/NSIS).

## Sync & folders

| Feature | Behavior |
| ------- | -------- |
| Folder list | Live IMAP LIST (not hardcoded) |
| Sync | `sync_inbox`, `sync_mailboxes` — incremental UID fetch, MIME parse, threading, SQLite upsert |
| IDLE push | Background IDLE on INBOX → `imap-push` event → background sync (fallback polling ~90s) |
| Unread counts | Per-mailbox badges |
| Mailbox ops | Create, rename, delete, subscribe on server |
| Trash | Move to Trash + empty trash command |

## Account management

- Switch active account in UI
- Edit or delete account (`delete_account` purges local data and scoped AI cache)
- Demo account: `playground@demo.rustymail.app` for local testing commands

## Security notes

- Audit logs **mask** email addresses where possible
- Never paste refresh tokens into issues or chat
- OAuth errors return normalized messages without full provider JSON

See [OAUTH.md](OAUTH.md) and [SECURITY.md](SECURITY.md).
