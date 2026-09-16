# Front-end (`src/`)

Découpage progressif du monolithe historique. **`application.ts` reste le cœur** (logique métier) ; le rendu et le câblage DOM sont extraits progressivement.

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
| `app/lib/tauriCommand.ts` | `withTimeout`, `tauriErrorMessage`, `safeInvoke` |
| `app/lib/toast.ts` | Notifications toast |
| `app/lib/appUiConstants.ts` | Constantes UI (filtres liste, prompt compte par défaut, vue message) |
| `app/account/discoveredServerSnap.ts` | Snapshot serveurs IMAP/SMTP découverts (formulaire compte) |
| `app/account/accountWizardState.ts` | État assistant OAuth / nouveau compte |
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
| `app/mail/searchQueryContext.ts` | Payload recherche, `isSearchActive`, critères engagés, dossier effectif |
| `app/mail/searchThreadsRun.ts` | Exécution `searchThreads()` |
| `app/mail/fetchOpenThread.ts` | `fetchOpenThreadOrNotify()` |
| `app/mail/openThreadView.ts` | `openThread()` + `registerOpenThreadDeps()` |
| `app/mail/searchCommitQuery.ts` | `commitSearchQuery`, barre, NL + `registerSearchCommitDeps()` |
| `app/mail/searchBarUi.ts` | Modale recherche, `syncSearchBarChrome` |
| `app/mail/savedSearchViews.ts` | Vues enregistrées (CRUD, marquer vu, suggestions) + `registerSavedSearchViewsDeps()` |
| `app/mail/searchLaunchQueries.ts` | Lancements recherche (tag, contact, domaine, hash) + `registerSearchLaunchDeps()` |
| `app/mail/searchTagCatalog.ts` | `refreshSearchTagCatalog` + `registerSearchTagCatalogDeps()` |
| `app/mail/searchAtAutocompleteWire.ts` | Câblage `@` / `#` (recherche + compose) + `registerSearchAtAutocompleteWireDeps()` |
| `app/mail/searchViewContext.ts` | Critères vue enregistrée / contexte recherche inbox + `registerSearchViewContextDeps()` |
| `app/mail/searchViewBatch.ts` | Actions lot recherche / vue (lu, archive, Affiner) + `registerSearchViewBatchDeps()` |
| `app/lib/tagFamilyForInvoke.ts` | Normalisation famille tag pour invoke Rust |
| `app/mail/bulkTrashList.ts` | Corbeille lot (liste visible) + `registerBulkTrashListDeps()` |
| `app/mail/emptyTrashMailbox.ts` | Vider corbeille dossier + `registerEmptyTrashMailboxDeps()` |
| `app/mail/appNavActions.ts` | `goBack` / `navigateToInbox` (facade deps) + `registerAppNavActionsDeps()` |
| `app/mail/mailListView.ts` | `loadMailView` + `registerMailListDeps()` |
| `app/mail/mailboxPanelContext.ts` | Contexte dossier (gestionnaire, payload `list_threads`) |
| `app/mail/mailboxSidebarStats.ts` | Compteurs non lus sidebar |
| `app/core/accountContext.ts` | `currentAccount()` |
| `app/lib/threadIdsMatch.ts` | Comparaison d’identifiants fil |
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
| `wireEvents.ts` | `wireEvents()` (câblage DOM) |
| `wireEvents/handleAction*.ts` | `handleAction()` découpé (settings, thread/compose, org/dossiers, inbox/recherche) |
| `wireEvents/deps.ts` | Imports partagés + accès pont (refs compte, carnet, etc.) |
| `wireEventsBridge.ts` | Registre runtime des handlers laissés dans `application.ts` |
| `threadTagsRender.ts` | Modale / chips tags fil |
| `actionBriefHtml.ts` | HTML brief d’action IA |

Libs associées : `attachmentSize.ts`, `searchBadgeLabel.ts`, …

Outils : `tools/degrade-extract-lib-modals.mjs`, `tools/degrade-extract-batch2.mjs`, `tools/degrade-extract-batch3.mjs`.

## Prochaines extractions (ordre suggéré)

1. Extraire d’autres handlers pont (`isSearchActive`, navigation, compose…) hors de `application.ts`
2. Typage progressif de **`deps.ts`** / retrait de `@ts-nocheck` sur les dispatchers

`npm run verify:ts` · `npm test`
