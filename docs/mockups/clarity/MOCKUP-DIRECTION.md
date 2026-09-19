# Direction mockups — Clarity v10

**Décision** : toute itération UX documentée dans le repo part de **Clarity v10**, pas de l’exploration v2–v9 (teal, split, triage fictif).

Miroir app (livré) : [`../../../src/styles/appearance.css`](../../../src/styles/appearance.css) + defaults [`tokens.css`](../../../src/styles/tokens.css).

## Stack

1. **Markup** calqué sur `listRender.ts`, `threadViewRender.ts`, `composerRender.ts`, `sidebarRender.ts`, `appShellRenderMarkupRun.ts`.
2. **Styles** : `tokens.css` + `styles.css` (produit).
3. **Clarity** : `clarity.css` + `mockup.js` pour nav mock, thème clair/sombre/système et toggles session.

## Schéma clair / sombre

| Réglage mock | Classe body | Effet |
| ------------ | ----------- | ----- |
| Clair (défaut) | `clarity-session` | Crème basse luminance (Douce) |
| Sombre | `clarity-dark` | Nuit chaude charbon + texte crème, sauge atténuée |
| Système | (résolu au runtime) | `prefers-color-scheme` → clair ou sombre |

Contraste+ et Lavande : **clair uniquement** (désactivés en mock sombre).

### Tokens clair — Douce (`clarity-session`)

| Token | Valeur |
| ----- | ------ |
| `--deep` | `#d8d3cb` |
| `--base` | `#ded9d1` |
| `--surface` | `#e8e4dc` |
| `--elevated` | `#f0ece5` |
| `--surface-elevated` | `#f7f4ef` |
| `--text` | `#34362f` |

### Tokens sombre (`clarity-dark`)

| Token | Valeur |
| ----- | ------ |
| `--deep` | `#141312` |
| `--base` | `#1a1917` |
| `--surface` | `#242220` |
| `--elevated` | `#2c2a27` |
| `--text` | `#e7e2d9` |
| `--sm-primary` | `#8aab96` |

## Session longue durée (clair)

| Mode | Classe body | Effet |
| ---- | ----------- | ----- |
| Douce | `clarity-session` | Crème basse luminance, bordures légères |
| Contraste+ | `clarity-contrast-plus` | Texte/contours renforcés, sauge inchangée |
| Lavande | `clarity-accent-lavender` | Variante CTA `--btn-primary-fill` |

## Prochaines itérations

- Ajuster les overrides token dans `clarity.css` / `appearance.css` (documentés ici).
- Si un composant manque → **implémenter dans l’app**, puis mettre à jour le HTML Clarity.
- Régénérer `images/clarity-latest-*.png` après chaque changement visible.

## Archive

v2–v9 : voir [`STATUS.md`](STATUS.md). Les PNG `clarity-v*-*.png` restent illustratifs uniquement.
