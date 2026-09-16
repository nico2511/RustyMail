# Front-end (`src/`)

Découpage progressif du monolithe historique. **`application.ts` reste le cœur** (logique + `wireEvents`) ; on en retire des morceaux autonomes au fil des itérations.

## Point d’entrée

| Fichier | Rôle |
| ------- | ---- |
| `main.ts` | Lance `boot()` |
| `app/application.ts` | Comportement UI (sync, compose, IA, événements…) |
| `app/state.ts` | État global `state` |
| `app/dispatch.ts` | `render()` / `registerRender()` |
| `app/dom.ts` | Élément racine `#app` |
| `app/types/` | Types TypeScript |

## Modules extraits (dégraissage en cours)

| Dossier | Contenu |
| ------- | ------- |
| `app/lib/toast.ts` | Notifications toast |
| `app/lib/domForm.ts` | Lecture champs formulaire DOM |
| `app/lib/textFormat.ts` | Liens / texte IA |
| `app/lib/tags.ts` | `initials`, tags bruit |
| `app/lib/iconSvg.ts` | Icônes SVG inline |
| `app/lib/htmlMessage.ts` | Base64 / montage HTML mail |
| `app/modals/promptConfirm.ts` | Modales prompt + confirm |
| `app/core/composeTone.ts` | Tons compositeur |
| `app/core/timeouts.ts` | Constantes délais Tauri / debounces IA & digest |
| `app/lib/tauriRuntime.ts` | Détection runtime Tauri |
| `app/ui/briefMailShell.ts` | Coquille HTML brief dossier |
| `app/mail/mailboxDigest.ts` | Brief d’action dossier (debounce, fetch, bouton toolbar) |
| `app/mail/idleAiCachePrefetch.ts` | Préchargement cache LLM au idle |

Outils : `tools/degrade-extract-lib-modals.mjs`, `tools/degrade-extract-batch2.mjs`, `tools/degrade-extract-batch3.mjs`.

## Prochaines extractions (ordre suggéré)

1. **`render*.ts`** → plusieurs fichiers sous `app/ui/render/` avec pont `renderDeps` (registre rempli par `application.ts`) — évite les imports circulaires
2. **`wireEvents`** → `app/ui/wireEvents.ts` en dernier (très couplé)

## Tests

`npm run verify:ts` · `npm test`
