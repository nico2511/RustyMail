# RustyMail documentation

English documentation for the RustyMail desktop mail client. Start at the [repository README](../README.md) for a quick overview.

## Getting started

| Document | Contents |
| -------- | -------- |
| [DEVELOPMENT.md](DEVELOPMENT.md) | Prerequisites, npm/cargo commands, `.env`, logging, CI |
| [CONFIGURATION.md](CONFIGURATION.md) | `app_prefs.json`, mother language, AI prefs summary |
| [ACCOUNTS.md](ACCOUNTS.md) | IMAP/SMTP accounts, sync, OAuth usage |
| [OAUTH.md](OAUTH.md) | Google/Microsoft developer setup (no secrets in repo) |

## Architecture & product

| Document | Contents |
| -------- | -------- |
| [ARCHITECTURE.md](ARCHITECTURE.md) | Crates, layers, data paths, frontend boundaries |
| [PRODUCT.md](PRODUCT.md) | Vision, goals, version history summary |
| [CAPABILITIES.md](CAPABILITIES.md) | Feature matrix (what works today) |
| [DESIGN.md](DESIGN.md) | UI tokens and visual guidance |

## AI & security

| Document | Contents |
| -------- | -------- |
| [AI_AND_MODELS.md](AI_AND_MODELS.md) | Bootstrap, llama-server, OpenRouter, dictation, feature flags |
| [LLM_CONTRACTS.md](LLM_CONTRACTS.md) | JSON shapes, GBNF, Rust validators |
| [SECURITY.md](SECURITY.md) | SQLCipher, keyring, redaction, release checklist |
| [IPC_SECURITY.md](IPC_SECURITY.md) | Tauri `invoke` surface, guards, AI cache rules |

## Release & contribution

| Document | Contents |
| -------- | -------- |
| [RELEASE.md](RELEASE.md) | GitHub Actions, tagging, local `tauri:build` |
| [CONTRIBUTING.md](CONTRIBUTING.md) | Layout, tests, PR expectations |

## Assets

| File | Purpose |
| ---- | ------- |
| [guidance-color.png](guidance-color.png) | Color reference for [DESIGN.md](DESIGN.md) |

App icons: generate with `scripts/generate-app-icon.ps1` then `npx tauri icon src-tauri/app-icon.png` (envelope, transparent background).
