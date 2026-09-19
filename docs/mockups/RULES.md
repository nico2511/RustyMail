# Règles mockups UX — RustyMail

## Règle absolue

**Toute UX proposée ou mockée doit reposer exclusivement sur les composants et classes déjà présents dans l’application.**

- **Aucune hallucination** : pas de widgets, palettes, modes ou layouts inventés qui n’existent pas dans le code produit.
- **Source de vérité** : rendu HTML (`src/app/ui/render/*`), styles (`src/styles.css`, `src/styles/tokens.css`), actions `data-action` câblées dans `wireEventsDom*`.
- **Tokens** : palette **pastel v0.2.0** (`--sm-primary`, `--btn-primary-fill`, etc.) — pas de design parallèle non branché.

Si un besoin UX n’est pas couvert par un composant existant, il faut **d’abord** l’implémenter dans l’app (ou ouvrir une issue explicite), **ensuite** le mockup/documenter — jamais l’inverse.

## Fichiers de référence

| Besoin | Où regarder |
| ------ | ------------- |
| Boutons | `.primary-button`, `.ghost-button`, `.icon-pill`, `.icon-button` — `src/styles.css` |
| Liste inbox | `.thread-row`, `.inbox-thread-row`, `listRender.ts` |
| Sidebar | `sidebarRender.ts`, `.sidebar` |
| Brief / digest | `actionBriefHtml.ts`, `mailboxDigest`, classes `inbox-brief-*` |
| Recherche | `searchRender.ts`, modale `#search-modal` |
| Compose | `composerRender.ts`, `.composer-mail-shell`, `[data-tone]` |
| Shell | `appShellRenderMarkupRun.ts`, `docs/UX-NOTE.md` |
| Inventaire détaillé | [`APP-COMPONENT-INVENTORY.md`](APP-COMPONENT-INVENTORY.md) |

## Dossier `clarity/`

**v10+** : mockups sur **composants produit** (`tokens.css`, `styles.css`) + `clarity.css` pour **couleurs session longue durée** (Douce / Contraste+ / Lavande). Pas de widgets inventés.

Les itérations **v2–v9** (teal, split, triage mock…) restent une exploration historique — ne pas les prolonger.

Toute **nouvelle** idée UX doit soit :

1. **S’appuyer** sur les classes existantes dans Clarity v10 (ou `inbox-faithful.html`), avec des overrides token documentés, ou  
2. **Implémenter d’abord** dans l’app, puis mockup.

## Visuels

Chaque changement de mockup ou de doc UX livrable doit inclure une **capture à jour** (`docs/mockups/images/mockups-faithful-inbox.png`, `clarity-latest-*.png` ou capture app Tauri / `npm run dev`).

## Mockup inbox conforme

- Fichier : [`inbox-faithful.html`](inbox-faithful.html) — shell + sidebar + `listRender` (statique).
- Styles : `../../src/styles/tokens.css` + `../../src/styles.css` uniquement.
