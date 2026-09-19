# Statut dossier Clarity — non conforme composants produit

Les fichiers `*.html` + `clarity.css` de ce dossier **ne sont pas** une description fidèle de RustyMail v0.2.0.

Ils contiennent des éléments **non implémentés** ou **styles fictifs**, par exemple :

| Mock Clarity | Équivalent produit (si existe) |
| ------------ | ------------------------------ |
| `clarity.css`, teal `#0f766e` | `tokens.css` pastel / `--sm-primary` |
| `.btn-primary`, `.btn-ghost` | `.primary-button`, `.ghost-button` |
| Split inbox + read-pane | Liste seule ; ouverture fil plein écran |
| Palette ⌘K HTML mock | Modale recherche `searchRender.ts` (pas palette commandes générique) |
| Focus / Contraste+ / Triage chips | Non présents tels quels |
| Épingler ☆ custom | `toggle-thread-follow` + `icon-pill` étoile |
| Envoi différé 5 s bandeau | Non présent (split send = PJ, autre modale) |
| Sidebar rail « RM » | `.sidebar-collapsed` produit |

**Politique actuelle** : voir [`../RULES.md`](../RULES.md). Les prochaines maquettes **valides** doivent réutiliser le markup/classes du repo, pas prolonger `clarity.css`.

Les PNG `clarity-latest-*.png` illustrent l’exploration Clarity uniquement.
