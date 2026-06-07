# Contributing

Thank you for improving RustyMail. This guide covers repo layout and common contributor workflows.

## Project layout

```text
RustyMail2/
├── README.md                 Entry point
├── docs/                     Detailed documentation (English)
├── src/                      Frontend (Vite + TypeScript)
│   ├── main.ts               Main UI (large monolith)
│   ├── i18n.ts               Locale resolution
│   ├── locales/              fr.json, en.json
│   ├── setupWizard.ts        First-run dialog
│   └── prefs_defaults.ts     Default preference shape
├── src-tauri/                Tauri shell + invoke commands
├── crates/
│   ├── rustymail-domain/
│   ├── rustymail-application/
│   ├── rustymail-infrastructure/
│   ├── rustymail-modules/
│   ├── rustymail-llm/
│   └── rustymail-semantic/
├── tools/                    Contributor scripts & mail sample workflow
├── .env.example              OAuth placeholders (copy to .env locally)
└── .github/workflows/        CI: audit + release
```

## Getting started

See [DEVELOPMENT.md](DEVELOPMENT.md):

```bash
npm install
npm run tauri:dev
```

## Code conventions

- **Rust:** layered crates — keep domain pure; I/O in infrastructure
- **Front end:** no mail business logic in TypeScript; call Tauri commands
- **UI strings:** add keys to both `src/locales/fr.json` and `en.json`
- **Secrets:** never commit `.env`, tokens, or real credentials in fixtures

## Tests

```bash
npm test                          # Vitest (frontend)
cargo test -p rustymail-modules   # Mail cleaning / security modules
cargo test -p rustymail-infrastructure
npm run verify:compile            # Fast Rust compile check
```

## Mail cleaning fixtures

To add or improve provider-specific HTML cleaning, see [tools/contributor-mail-samples.md](../tools/contributor-mail-samples.md).

## Documentation

When changing behavior, update the relevant guide listed in [README.md](README.md) — especially [CAPABILITIES.md](CAPABILITIES.md) for user-visible features.

## Security

Run `cargo audit` before release-related PRs. Follow [SECURITY.md](SECURITY.md) for IPC and privacy expectations.

## Pull requests

- Focused diffs; match existing style in touched files
- Describe user-visible changes and test steps
- Do not include `target/`, `node_modules/`, or personal `.eml` files

## License

MIT — see workspace `Cargo.toml`.
