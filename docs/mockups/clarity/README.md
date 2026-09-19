# Clarity v10 — direction mockups UX (officielle)

Itération **v10** : base unique pour les maquettes UX du repo — **classes et markup RustyMail** (`tokens.css`, `styles.css`), plus une couche **session longue durée**.

Voir aussi [`MOCKUP-DIRECTION.md`](MOCKUP-DIRECTION.md) et [`../README.md`](../README.md).

## Rôle de `clarity.css`

| Couche | Fichier | Rôle |
| ------ | ------- | ---- |
| Composants | `../../../src/styles/tokens.css` + `styles.css` (depuis `clarity/*.html`) | Boutons, inbox, fil, compose — identiques à l’app |
| Session mock | `clarity.css` | Barre nav mock + réglages couleur **longues sessions** |
| Toggles | `mockup.js` | Douce / Contraste+ / Lavande (localStorage, mock uniquement) |

## Modes session (mock)

- **Douce** (défaut) — crème basse luminance, bordures légères.
- **Contraste+** — texte et contours renforcés, **sauge produit** (`--sm-primary`), pas de teal Clarity.
- **Lavande** — variante `--btn-primary-fill` pour explorer un accent reposant.

Ces modes sont des **propositions UX** à brancher plus tard dans les préférences app si validées — pas de nouveau composant.

## Parcours

`index.html` → `inbox.html` → `thread.html` → `compose.html`

Barre du haut : basculer les modes session sur chaque page.

## Captures

Régénérer après changement :

- `images/clarity-latest-inbox.png`
- `images/clarity-latest-thread.png`
- `images/clarity-latest-compose.png`

## Historique v2–v9

Exploration non conforme (CSS fictif). Conservée dans git ; **ne pas** prolonger. Voir [`STATUS.md`](STATUS.md).
