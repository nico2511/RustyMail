# Statut dossier Clarity

## v10+ (actuel)

Les pages `*.html` importent **`tokens.css` + `styles.css`** et reprennent le markup des renderers produit (`listRender.ts`, `threadViewRender.ts`, `composerRender.ts`).

`clarity.css` est une **couche fine** :

- barre de navigation entre mockups ;
- classes body `clarity-session`, `clarity-contrast-plus`, `clarity-accent-lavender` pour **couleurs longues sessions** (override de variables `:root`, pas de design parallèle).

`mockup.js` ne pilote que ces toggles — pas de split inbox, ⌘K, triage, etc.

## v2–v9 (archive)

Itérations avec `clarity.css` teal, widgets et layouts **non présents** dans l’app. Les PNG `clarity-v*-*.png` illustrent cette phase d’exploration uniquement.

Politique globale : [`../RULES.md`](../RULES.md).
