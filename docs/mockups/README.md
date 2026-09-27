# Mockups UX — RustyMail

## Direction officielle : productivité

Les maquettes à suivre sont dans **[`productivity/`](productivity/)** :

- [`index.html`](productivity/index.html) → [`inbox.html`](productivity/inbox.html) → [`thread.html`](productivity/thread.html) → [`compose.html`](productivity/compose.html)
- Rail charbon repliable, surface blanche, accent cuivre. Literata pour lire le courrier, IBM Plex Sans pour les menus.
- Réception multi-compte : Perso **ardoise**, Atelier **olive**, Facturation **prune**. Le nom du compte reste écrit. Le cuivre n’est pas une couleur de compte.
- Le prochain travail d’interface **implémente cette direction**. Il ne prolonge pas Clarity.

Détail : [`productivity/README.md`](productivity/README.md). Principes : [`../UX-NOTE.md`](../UX-NOTE.md) et [`../DESIGN.md`](../DESIGN.md). Captures : `productivity/images/`.

Le CSS dans `src/` est encore le shell pastel Clarity v10. Ces maquettes disent quoi construire ensuite. Elles ne décrivent pas le CSS déjà livré, et cette PR ne le modifie pas.

## Clarity — archive, ne pas continuer

[`clarity/`](clarity/) (v2–v10, y compris Douce / Contraste+ / Lavande) est **clos**. Ne pas l’itérer, ne pas s’en servir comme base visuelle.

## Autres fichiers

| Fichier | Rôle |
| ------- | ---- |
| [`RULES.md`](RULES.md) | Nouvelles maquettes = `productivity/`. La règle « classes de l’app » ne vaut que pour l’historique fidèle. |
| [`APP-COMPONENT-INVENTORY.md`](APP-COMPONENT-INVENTORY.md) | Inventaire du shell **livré**. Pas la cible. |
| [`inbox-faithful.html`](inbox-faithful.html), [`faithful-components-demo.html`](faithful-components-demo.html) | Gel du shell livré. |
| `alternatives/`, `vNext/` | Explorations anciennes (crème, sauge, autres palettes). Closes. |
