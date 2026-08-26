# OAuth setup (desktop public clients)

Google and Microsoft **desktop OAuth** for IMAP/SMTP via XOAUTH2.

Architecture:

1. User clicks **Continuer avec Google / Microsoft**
2. App generates PKCE `code_verifier` / `code_challenge` + CSRF `state`
3. System browser opens the provider authorize URL
4. Provider redirects to **loopback** `http://127.0.0.1:52789` (local listener in the binary)
5. App exchanges the code (with `code_verifier`) **directly** with Google / Microsoft
6. Access + refresh tokens go to the **OS keyring** (never plaintext prefs)

**No RustyMail backend.** Token traffic is binary ↔ identity provider only.

## Build-time embedding (release binaries)

At `cargo` / `tauri build`, [`src-tauri/build.rs`](../src-tauri/build.rs) embeds non-empty:

| Variable | Role |
| -------- | ---- |
| `RUSTYMAIL_GOOGLE_OAUTH_CLIENT_ID` | Google Desktop client ID |
| `RUSTYMAIL_GOOGLE_OAUTH_CLIENT_SECRET` | Google Desktop “secret” (required by Google’s token endpoint despite PKCE; **non-confidential** for installed apps) |
| `RUSTYMAIL_MICROSOFT_OAUTH_CLIENT_ID` | Entra public client ID |
| `RUSTYMAIL_OAUTH_LOOPBACK_PORT` | Optional; default `52789` |

Sources (first wins per key):

1. Process environment (CI secrets)
2. Repo-root `.env` (local builds)

Runtime override: if the same env var is already set and non-empty when the app starts, the embedded value is **not** applied.

Debug (`tauri dev`) still loads `.env` via `dotenvy` before embed injection.

Without client credentials at build **and** runtime, OAuth buttons stay disabled; **password / app-password IMAP** remains available.

## Local `.env` (developers)

1. Copy [`.env.example`](../.env.example) → `.env` at repo root.
2. Fill client IDs (and Google Desktop secret).
3. `npm run tauri:dev` or `npm run tauri:build` (build embeds from `.env`).

Never commit `.env`.

```env
RUSTYMAIL_GOOGLE_OAUTH_CLIENT_ID=your-client-id.apps.googleusercontent.com
RUSTYMAIL_GOOGLE_OAUTH_CLIENT_SECRET=your-desktop-client-secret
RUSTYMAIL_MICROSOFT_OAUTH_CLIENT_ID=your-entra-application-id
```

## Google Cloud Console

1. **APIs & Services → Credentials → Create OAuth client ID**
2. Application type: **Desktop app**
3. Consent screen configured; scopes include `openid email profile https://mail.google.com/`
4. Copy Client ID + Client secret into `.env` / CI

Redirect used by RustyMail: `http://127.0.0.1:52789` (or `RUSTYMAIL_OAUTH_LOOPBACK_PORT`).

## Microsoft Entra (Azure AD)

1. **App registrations → New registration** — accounts: personal + work/school as needed
2. Platform: **Mobile and desktop applications**
3. Redirect URI **exact**: `http://127.0.0.1:52789`
4. **Allow public client flows** = Yes
5. Delegated scopes: `offline_access openid email profile https://outlook.office.com/IMAP.AccessAsUser.All https://outlook.office.com/SMTP.Send`

### Port conflicts

Only **one RustyMail instance** should hold port `52789`. If connection fails:

- Close other RustyMail windows
- Windows: `netstat -ano | findstr :52789`
- Dev only: `RUSTYMAIL_OAUTH_ALLOW_EPHEMERAL_PORT=1` (Entra may reject a random port)

## CI release

[`.github/workflows/release.yml`](../.github/workflows/release.yml) passes repository secrets into the Tauri build when set:

- `RUSTYMAIL_GOOGLE_OAUTH_CLIENT_ID`
- `RUSTYMAIL_GOOGLE_OAUTH_CLIENT_SECRET`
- `RUSTYMAIL_MICROSOFT_OAUTH_CLIENT_ID`

## Token storage

- Primary: OS keyring (meta + access + refresh)
- Overflow: `oauth_tokens/` under app data if Microsoft token exceeds Windows keyring size (~2560 chars)

## Manual test checklist

1. Release or personal build **without** runtime `.env`: Google OAuth → discover → save → sync
2. Microsoft Outlook.com / M365: same + SMTP send
3. Regression: password account unchanged

**Never** log or paste access/refresh tokens in tickets.

## Related

- [ACCOUNTS.md](ACCOUNTS.md)
- [SECURITY.md](SECURITY.md)
