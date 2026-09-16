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

### Rendu UI (`app/ui/render/`)

Pont **`registerRenderDeps()`** dans `renderDeps.ts` : callbacks laissés dans `application.ts` (fil d’Ariane, tags fil, etc.).

| Fichier | Contenu |
| ------- | ------- |
| `listChrome.ts` | Badges sidebar, bannières compte, fil d’Ariane |
| `searchBadgeChip.ts` | Puce critère de recherche |
| `searchRender.ts` | Barre recherche, badges, modale, actions vue enregistrée |
| `modalsRender.ts` | Déplacer, mailbox, citations, compose, image, split send, reprise brouillon |
| `statusFooterRender.ts` | Barre d’état globale, chips activité, progression inline |
| `aiQuickPanelRender.ts` | Panneau rapide fonctionnalités IA (sidebar + barre) |
| `aiFeatureTogglesRender.ts` | HTML toggles IA (compact / paramètres) |
| `sidebarRender.ts` | Barre latérale dossiers / vues |
| `mainViewRender.ts` | Routage vue principale (`renderMain`) |
| `listRender.ts` | Liste inbox (`renderList`, lignes fil) |
| `threadViewRender.ts` | Vue fil (`renderThread`, messages, sécurité) |
| `composerRender.ts` | Compositeur (`renderComposer`, historique brouillon) |
| `settingsRender.ts` | Paramètres (onglets, modale IA réglages) |
| `aiPanelRender.ts` | Panneau Détails / brief dossier / agent IA |
| `orgSampleRowRender.ts` | Ligne échantillon vue Organiser |
| `threadTagsRender.ts` | Modale / chips tags fil |
| `actionBriefHtml.ts` | HTML brief d’action IA |

Libs associées : `attachmentSize.ts`, `searchBadgeLabel.ts`, …

Outils : `tools/degrade-extract-lib-modals.mjs`, `tools/degrade-extract-batch2.mjs`, `tools/degrade-extract-batch3.mjs`.

## Prochaines extractions (ordre suggéré)

1. **`wireEvents`** → `app/ui/wireEvents.ts` (dernier gros bloc couplé)

`npm run verify:ts` · `npm test`
