# Mockups UX — RustyMail

## Direction officielle : **Clarity v10**

Les maquettes UX suivent **`docs/mockups/clarity/`** (v10) :

- Composants et classes **identiques à l’app** (`../../../src/styles/tokens.css`, `styles.css`, markup des `*Render.ts`).
- **`clarity.css`** : uniquement la barre de navigation entre pages mock + **palette session longue durée** (Douce / Contraste+ / Lavande).

**Parcours** : [`clarity/index.html`](clarity/index.html) → `inbox.html` → `thread.html` → `compose.html`.

Captures de référence : `clarity/images/clarity-latest-*.png`.

## Règles & inventaire

- [`RULES.md`](RULES.md) — pas de widgets inventés ; composants produit d’abord.
- [`APP-COMPONENT-INVENTORY.md`](APP-COMPONENT-INVENTORY.md) — classes autorisées.
- [`clarity/STATUS.md`](clarity/STATUS.md) — v10 vs archive v2–v9.

## Autres fichiers

| Fichier | Rôle |
| ------- | ---- |
| [`inbox-faithful.html`](inbox-faithful.html) | Inbox statique sans couche session (même base que Clarity v10). |
| [`faithful-components-demo.html`](faithful-components-demo.html) | Planche composants isolée. |
| `clarity/` v2–v9 (git history) | Exploration historique — **ne pas prolonger**. |

Produit livré : refonte pastel **v0.2.0** sur `main` — voir [`../UX-NOTE.md`](../UX-NOTE.md).
