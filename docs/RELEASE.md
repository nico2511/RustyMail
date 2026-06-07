# Releases & CI

## GitHub Actions

### Release workflow

File: [`.github/workflows/release.yml`](../.github/workflows/release.yml)

**Triggers:**

- Push tag matching `v*` (e.g. `v0.1.1`)
- Manual `workflow_dispatch`

**Jobs:**

1. **build-windows** (`windows-latest`)
   - Node 22, Rust stable, `npm ci`
   - `npm run tauri:build`
   - Upload artifacts: NSIS `.exe`, MSI `.msi`, `rustymail.exe`

2. **publish** (`ubuntu-latest`)
   - Download artifacts
   - Create GitHub Release with `softprops/action-gh-release@v2`
   - Attach built files; auto-generate release notes

### Cargo audit

File: [`.github/workflows/cargo-audit.yml`](../.github/workflows/cargo-audit.yml)

Runs on push/PR to `main` / `master`: `cargo audit`

## Local release build

```bash
npm run tauri:build
```

Outputs (Cargo **workspace** → repo-root `target/release/`; fallback `src-tauri/target/release/` if isolated):

- `bundle/nsis/` — Windows installer (`*-setup.exe`)
- `bundle/msi/` — `.msi` (local Windows + WiX only; CI uses `--bundles nsis`)
- `rustymail.exe` — standalone binary

## Versioning

- Package version in `package.json`, `src-tauri/tauri.conf.json`, and workspace `Cargo.toml` (currently `0.1.1`)
- Tag format: `v0.1.1` (must match release workflow pattern)

## Pre-release checklist

Complete [SECURITY.md](SECURITY.md) release checklist before tagging.

## First-run behavior in shipped builds

- MiniLM + Whisper bootstrap downloads on first launch (no OAuth env in installer)
- Chat GGUF downloads only when user enables local LLM in Settings
- OAuth requires developer-provided client IDs via `.env` in **dev only** — not bundled

## Related

- [DEVELOPMENT.md](DEVELOPMENT.md)
- [SECURITY.md](SECURITY.md)
