# Releases & CI

## GitHub Actions

### Release workflow

File: [`.github/workflows/release.yml`](../.github/workflows/release.yml)

**Triggers:**

- Push tag matching `v*` (e.g. `v0.1.1`)
- Manual `workflow_dispatch`

**Jobs:**

1. **verify** (`ubuntu-latest`) — `cargo fmt`, `cargo clippy`, `cargo test --workspace --all-targets`, `tsc`, Vitest. Required by the Windows build.
2. **build-windows** (`windows-latest`)
   - Node 22, Rust stable, `npm ci`
   - On a tag push, fails immediately if `TAURI_SIGNING_PRIVATE_KEY` is absent
   - `npm run tauri:build`
   - Upload artifacts: NSIS `.exe`, `rustymail.exe`, and updater files when signed
3. **publish** (`ubuntu-latest`)
   - Download artifacts
   - Requires `latest.json` and a `.sig` before creating the release
   - Create GitHub Release with `softprops/action-gh-release@v2` (`make_latest: true`)
   - Attach built files; auto-generate release notes

### PR quality gates

File: [`.github/workflows/ci.yml`](../.github/workflows/ci.yml)

Runs on push/PR to `main` / `master`:

- Rust: `cargo fmt --check`, `cargo clippy`, `cargo test --workspace --all-targets`
- Frontend: `tsc --noEmit`, `npm test` (Vitest)

Local equivalent: `npm run verify:ci`.

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

- Package version in `package.json`, `src-tauri/tauri.conf.json`, and workspace `Cargo.toml` (currently `0.4.8`) — **all three must match**; the release workflow publishes `v{tauri.conf.version}`
- Tag format: `v0.4.8` (must match release workflow pattern)

## Mises à jour automatiques (Windows)

Le client installé interroge les GitHub Releases déjà publiées par ce workflow. Rien n’est téléchargé tant que l’utilisateur ne le demande pas (Paramètres → Général, ou un toast discret au démarrage s’il existe une version plus récente).

| Élément | Emplacement |
| --- | --- |
| Plugin | `tauri-plugin-updater` + `tauri-plugin-process` (`process:allow-restart` seulement) |
| Endpoint | `https://github.com/nico2511/RustyMail/releases/latest/download/latest.json` |
| Clé publique | `plugins.updater.pubkey` dans `src-tauri/tauri.conf.json` |
| Artefacts signés | uniquement si le secret de signature est présent, via `src-tauri/tauri.updater.release.json` (`createUpdaterArtifacts: true`) |
| Manifeste | `scripts/write-updater-latest-json.mjs` écrit `latest.json` à côté du NSIS (`windows-x86_64`) |

`createUpdaterArtifacts` n’est **pas** activé dans la config par défaut : un `npm run tauri:build` local sans clé privée produit l’installeur NSIS comme avant. Le job de release ajoute la config updater seulement quand `TAURI_SIGNING_PRIVATE_KEY` est défini. Sans ce secret, l’installeur est quand même publié, sans `.sig` ni `latest.json`.

Mode d’installation Windows : `passive` (barre de progression), compatible avec le NSIS `currentUser`. Le mode `quiet` n’est pas utilisé : il ne peut pas demander de privilèges et échoue si l’installeur n’est pas limité à l’utilisateur courant.

### Générer la paire de clés (une fois)

La clé privée ne doit **jamais** être commitée. `.gitignore` ignore `*.key`.

```bash
npm run tauri signer generate -- -w "$HOME/.tauri/rustymail.key"
```

La commande affiche la clé publique et écrit :

- `$HOME/.tauri/rustymail.key` — **privée**, à mettre dans le secret GitHub puis à garder hors du dépôt (coffre, pas le clone)
- `$HOME/.tauri/rustymail.key.pub` — publique ; coller son **contenu** (une seule ligne minisign) dans `plugins.updater.pubkey`

Secrets du dépôt (Settings → Secrets and variables → Actions) :

| Secret | Contenu |
| --- | --- |
| `TAURI_SIGNING_PRIVATE_KEY` | contenu du fichier `.key` (ou son chemin sur un runner qui l’a déjà — en CI, coller le contenu) |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | mot de passe si la clé en a un ; sinon laisser vide |

Les variables d’environnement de signature ne sont **pas** lues depuis un `.env` du dépôt au moment du bundle Tauri.

La clé publique embarquée dans un binaire doit être la paire de la clé privée qui signe cette release. Pour **0.3.1**, le placeholder `REMPLACER_PAR_LA_CLE_PUBLIQUE_MINISIGN` a été remplacé dans `plugins.updater.pubkey` (clé publique minisign uniquement ; la clé privée n’est pas dans le dépôt). Le secret GitHub Actions `TAURI_SIGNING_PRIVATE_KEY` doit contenir cette clé privée, sinon le job de release publie l’installeur sans `.sig` ni `latest.json`.

### Fichiers publiés

Pour `windows-x86_64`, la release doit contenir :

- l’installeur `*-setup.exe`
- sa signature `*-setup.exe.sig`
- `latest.json`, dont le champ `platforms.windows-x86_64.url` pointe vers cet exe sur `releases/download/vX.Y.Z/` et dont `signature` est le contenu du `.sig`

Le endpoint `releases/latest/download/latest.json` ne fonctionne que si `latest.json` est une pièce jointe de la release marquée latest (`make_latest: true`, déjà le cas).

## Pre-release checklist

Complete [SECURITY.md](SECURITY.md) release checklist before tagging.

## First-run behavior in shipped builds

- MiniLM + Whisper bootstrap downloads on first launch
- Chat GGUF downloads only when user enables local LLM in Settings
- OAuth Google/Microsoft works when public client credentials were embedded at build (CI secrets or local `.env`); otherwise password auth only — see [OAUTH.md](OAUTH.md)

## Related

- [DEVELOPMENT.md](DEVELOPMENT.md)
- [SECURITY.md](SECURITY.md)
