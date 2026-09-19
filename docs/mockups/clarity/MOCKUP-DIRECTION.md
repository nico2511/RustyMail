# Direction mockups — Clarity v10

**Décision** : toute itération UX documentée dans le repo part de **Clarity v10**, pas de l’exploration v2–v9 (teal, split, triage fictif).

## Stack

1. **Markup** calqué sur `listRender.ts`, `threadViewRender.ts`, `composerRender.ts`, `sidebarRender.ts`, `appShellRenderMarkupRun.ts`.
2. **Styles** : `tokens.css` + `styles.css` (produit).
3. **Clarity** : `clarity.css` + `mockup.js` pour nav mock et toggles session.

## Session longue durée

Proposition UX (mock) à valider avant implémentation app :

| Mode | Classe body | Effet |
| ---- | ----------- | ----- |
| Douce | `clarity-session` | Crème basse luminance, bordures légères |
| Contraste+ | `clarity-contrast-plus` | Texte/contours renforcés, sauge inchangée |
| Lavande | `clarity-accent-lavender` | Variante CTA `--btn-primary-fill` |

## Prochaines itérations

- Ajuster les overrides token dans `clarity.css` (documentés ici).
- Si un composant manque → **implémenter dans l’app**, puis mettre à jour le HTML Clarity.
- Régénérer `images/clarity-latest-*.png` après chaque changement visible.

## Archive

v2–v9 : voir [`STATUS.md`](STATUS.md). Les PNG `clarity-v*-*.png` restent illustratifs uniquement.
