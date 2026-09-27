# Règles mockups UX — RustyMail

## Direction officielle

Les maquettes **[`productivity/`](productivity/)** sont la direction UX. Charcoal, blanc, cuivre, Literata pour la lecture, IBM Plex Sans pour le chrome. Elles ne reprennent pas les classes de l’app, ni `tokens.css`, ni Clarity.

Toute **nouvelle** proposition d’interface s’itère dans `productivity/` (HTML statique, captures dans `productivity/images/`). L’implémentation dans `src/` viendra dans une PR séparée. D’ici là, le CSS livré reste le shell pastel Clarity v10 — ce n’est pas la cible.

Clarity (v2–v10) est une **archive**. Ne pas la prolonger, ne pas s’en servir comme base.

## Ce qui ne s’applique plus comme direction

L’ancienne règle « maquettes = composants et tokens déjà dans l’app » (palette pastel v0.2.0, classes `.primary-button` / `.thread-row`, pas de design parallèle) **ne guide plus** les nouvelles maquettes.

Elle reste vraie seulement pour les fichiers historiques qui gèlent le shell livré :

- [`inbox-faithful.html`](inbox-faithful.html), [`faithful-components-demo.html`](faithful-components-demo.html)
- le dossier [`clarity/`](clarity/)

Là, pas de widget inventé : le rendu vient de `src/app/ui/render/*` et les styles de `src/styles.css` + `src/styles/tokens.css`. Cet inventaire est dans [`APP-COMPONENT-INVENTORY.md`](APP-COMPONENT-INVENTORY.md). Il décrit l’app d’aujourd’hui, pas `productivity/`.

## Dossier `clarity/` — archive

Ne pas itérer ces pages. Voir [`productivity/README.md`](productivity/README.md) et [`../UX-NOTE.md`](../UX-NOTE.md).

## Visuels

Chaque changement visible de `productivity/` met à jour les captures dans `productivity/images/` (`inbox.png`, `inbox-facturation.png`, `thread.png`, `compose.png`, `profile-modal.png`, `contact-modal.png`).

## Mockup fidèle (historique)

- Fichier : [`inbox-faithful.html`](inbox-faithful.html).
- Styles : `../../src/styles/tokens.css` + `../../src/styles.css` uniquement.
- Pas la direction suivante.
