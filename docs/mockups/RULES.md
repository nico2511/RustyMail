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

Les HTML `clarity/*.html` (v2–v9) sont une **exploration historique** avec CSS fictif (`clarity.css`, teal, split inbox, palette ⌘K mock, etc.). **Ils ne respectent pas cette règle** tant qu’ils ne sont pas refondus sur les classes produit.

Toute **nouvelle** itération UX doit soit :

1. **Abandonner** `clarity.css` au profit d’un mockup qui importe `tokens.css` + extraits de `styles.css`, ou  
2. **Rester** dans la doc (wireframes) sans prétendre décrire le produit.

## Visuels

Chaque changement de mockup ou de doc UX livrable doit inclure une **capture à jour** (`docs/mockups/images/mockups-faithful-inbox.png`, `clarity-latest-*.png` ou capture app Tauri / `npm run dev`).

## Mockup inbox conforme

- Fichier : [`inbox-faithful.html`](inbox-faithful.html) — shell + sidebar + `listRender` (statique).
- Styles : `../../src/styles/tokens.css` + `../../src/styles.css` uniquement.
