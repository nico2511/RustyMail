# Development

## Prerequisites

| Tool | Version / notes |
| ---- | ---------------- |
| **Node.js** | 22+ (matches CI) |
| **Rust** | Stable toolchain (`rustup default stable`) |
| **Tauri system deps** | [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/) for your OS |
| **Windows (optional)** | winget — for first-run llama-server install helper |

## Clone & install

```bash
git clone <repo-url> RustyMail2
cd RustyMail2
npm install
```

## Development commands

| Command | Purpose |
| ------- | ------- |
| `npm run dev` | Vite dev server (browser UI only, limited without Tauri) |
| `npm run tauri:dev` | Full desktop app (`tauri dev` with `tauri.dev.conf.json`) |
| `npm run verify:compile` | `cargo check -p rustymail` |
| `npm test` | Frontend unit tests (Vitest) |
| `npm run tauri:build` | Release installer (NSIS/MSI on Windows) |

## Rust workspace

Root `Cargo.toml` members:

- `crates/rustymail-domain`
- `crates/rustymail-application`
- `crates/rustymail-infrastructure`
- `crates/rustymail-modules`
- `crates/rustymail-llm`
- `crates/rustymail-semantic`
- `src-tauri` (package name `rustymail`)

Run crate tests:

```bash
cargo test -p rustymail-modules
cargo test -p rustymail-infrastructure
```

## Developer environment file

**Debug builds only** (`tauri dev`, `debug_assertions`): Rust loads `.env` from the repo root (see `load_developer_dotenv` in `src-tauri/src/lib.rs`). **Release installers never load `.env`.**

Copy [`.env.example`](../.env.example) → `.env` for OAuth client IDs during development. See [OAUTH.md](OAUTH.md).

## Logging

Default filter (see `lib.rs`):

```text
warn,rustymail::audit=info,rustymail_infrastructure=info,html5ever=error
```

Override with `RUST_LOG` when debugging.

## CI

| Workflow | Trigger | Action |
| -------- | ------- | ------ |
| [`.github/workflows/cargo-audit.yml`](../.github/workflows/cargo-audit.yml) | push/PR to main | `cargo audit` |
| [`.github/workflows/release.yml`](../.github/workflows/release.yml) | tag `v*` or manual | Windows Tauri build + GitHub Release |

See [RELEASE.md](RELEASE.md).

## Related

- [CONTRIBUTING.md](CONTRIBUTING.md)
- [ARCHITECTURE.md](ARCHITECTURE.md)
