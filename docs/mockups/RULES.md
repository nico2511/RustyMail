# Règles mockups UX — RustyMail

## Direction en cours

Les maquettes **[`productivity/`](productivity/)** sont la direction UX officielle. Elles sont **volontairement indépendantes** des classes de l’app, de `tokens.css` et de Clarity : validation visuelle d’abord, implémentation dans `src/` ensuite.

Le prochain travail d’interface implémente **cette** direction. Clarity (v2–v10) est une archive — ne pas la prolonger.

La règle « composants existants uniquement » ci-dessous reste vraie pour les fichiers historiques (`clarity/`, `inbox-faithful.html`). Elle **ne s’applique pas** à `productivity/`.

## Règle historique (fichiers fidèles)

**Les maquettes fidèles au shell livré reposent sur les composants et classes déjà présents dans l’application.**

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

## Dossier `clarity/` — archive

Clarity v2–v10 n’est **plus** la direction. Ne pas itérer ces pages. Voir [`productivity/README.md`](productivity/README.md).

## Visuels

Chaque changement des maquettes productivité doit inclure une capture à jour dans `productivity/images/` (`inbox.png`, `thread.png`, `compose.png`).

## Mockup inbox conforme

- Fichier : [`inbox-faithful.html`](inbox-faithful.html) — shell + sidebar + `listRender` (statique).
- Styles : `../../src/styles/tokens.css` + `../../src/styles.css` uniquement.
