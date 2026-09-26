# Mockups UX — RustyMail

## Direction officielle : productivité

Les maquettes à suivre sont dans **[`productivity/`](productivity/)** :

- [`index.html`](productivity/index.html) → [`inbox.html`](productivity/inbox.html) → [`thread.html`](productivity/thread.html) → [`compose.html`](productivity/compose.html)
- Langage visuel **neuf** (rail charbon, surface blanche, accent cuivre). Pas les tokens pastel, pas Clarity.
- Le prochain travail d’interface **implémente cette direction**, il ne prolonge pas Clarity.

Détail : [`productivity/README.md`](productivity/README.md). Captures : `productivity/images/`.

## Clarity — archive, ne pas continuer

[`clarity/`](clarity/) (v2–v10, y compris la couche session Douce / Contraste+ / Lavande) est **clos**. Ne pas l’itérer, ne pas s’en servir comme base visuelle.

## Autres fichiers

| Fichier | Rôle |
| ------- | ---- |
| [`RULES.md`](RULES.md) | Périmètre des maquettes. La règle « classes de l’app uniquement » vaut pour l’historique fidèle, pas pour `productivity/`. |
| [`APP-COMPONENT-INVENTORY.md`](APP-COMPONENT-INVENTORY.md) | Inventaire du shell actuel — référence de ce qui existe, pas la cible visuelle. |
| [`inbox-faithful.html`](inbox-faithful.html), [`faithful-components-demo.html`](faithful-components-demo.html) | Gel du shell livré. Pas la direction suivante. |
| `alternatives/`, `vNext/` | Explorations anciennes. |

L’app sur `main` a encore le shell pastel. Ces maquettes disent quoi construire ensuite, elles ne décrivent pas le CSS déjà livré.
