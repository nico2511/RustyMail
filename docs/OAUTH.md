# OAuth setup (developers)

Google and Microsoft **desktop OAuth** for IMAP/SMTP via XOAUTH2. Intended for **local development** (`tauri dev`); release installers do not ship client secrets.

## Environment variables

At Tauri startup:

| Variable | Required | Description |
| -------- | -------- | ----------- |
| `RUSTYMAIL_GOOGLE_OAUTH_CLIENT_ID` | For Google button | OAuth 2.0 client ID |
| `RUSTYMAIL_GOOGLE_OAUTH_CLIENT_SECRET` | For Google token exchange | Client secret from same Google credential |
| `RUSTYMAIL_MICROSOFT_OAUTH_CLIENT_ID` | For Microsoft button | Entra application (client) ID |
| `RUSTYMAIL_OAUTH_LOOPBACK_PORT` | Optional | Default `52789` — must match Entra redirect URI |
| `RUSTYMAIL_OAUTH_ALLOW_EPHEMERAL_PORT` | Optional | Set `1` only for dev if fixed port blocked |

Without Google/Microsoft client IDs, OAuth buttons show an explicit error; **password auth remains available**.

## Local `.env` file

1. Copy [`.env.example`](../.env.example) to `.env` at repo root (next to `package.json`).
2. Fill in your own client ID and secret — **never commit `.env`**.
3. Run `npm run tauri:dev`.

`.env` is loaded **only in debug builds** (`#[cfg(debug_assertions)]`). Installed release builds ignore it.

Example (placeholders):

```env
RUSTYMAIL_GOOGLE_OAUTH_CLIENT_ID=your-client-id.apps.googleusercontent.com
RUSTYMAIL_GOOGLE_OAUTH_CLIENT_SECRET=your-client-secret
RUSTYMAIL_MICROSOFT_OAUTH_CLIENT_ID=your-entra-application-id
```

## Google Cloud Console

1. **APIs & Services → Credentials → Create OAuth client ID**
2. Application type: **Desktop app** (recommended). RustyMail uses PKCE + `client_secret` in token POST.
3. Copy Client ID → `RUSTYMAIL_GOOGLE_OAUTH_CLIENT_ID`
4. Copy Client secret → `RUSTYMAIL_GOOGLE_OAUTH_CLIENT_SECRET`
5. Scopes used: `openid email profile https://mail.google.com/`

If you created a **Web application** client by mistake, the secret is still required; prefer recreating a **Desktop** client for loopback flows.

## Microsoft Entra (Azure AD)

1. **App registrations → New registration** — platform: **Mobile and desktop applications**
2. Redirect URI **exact**: `http://127.0.0.1:52789` (or your `RUSTYMAIL_OAUTH_LOOPBACK_PORT`)
3. **Allow public client flows** = Yes
4. Scopes (delegated): `offline_access openid email profile https://outlook.office.com/IMAP.AccessAsUser.All https://outlook.office.com/SMTP.Send`

### Port conflicts

Only **one RustyMail instance** should hold port `52789`. If connection fails:

- Close other RustyMail windows
- Windows: `netstat -ano | findstr :52789` then identify the PID
- Last resort (dev): `RUSTYMAIL_OAUTH_ALLOW_EPHEMERAL_PORT=1` (UI warning if random port used — Entra may reject)

## Token storage

- Primary: OS keyring (meta + access + refresh entries)
- Overflow: `oauth_tokens/` under app data if Microsoft token exceeds Windows keyring size (~2560 chars)

## Manual test checklist

1. Gmail personal: OAuth → discover servers → save → sync INBOX
2. Outlook.com / M365: same + test SMTP send
3. Regression: existing **password** account unchanged

**Never** log or paste access/refresh tokens in tickets.

## Related

- [ACCOUNTS.md](ACCOUNTS.md)
- [SECURITY.md](SECURITY.md)
