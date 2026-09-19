# Mockups UX vNext — « Focus Paper »

Proposition **visuelle uniquement** (non implémentée dans l’app v0.2.0). Objectif : garder l’esprit calme de RustyMail, réduire la charge cognitive, recentrer sur lire / écrire.

## Principes vs v0.2.0

| v0.2.0 (actuel) | vNext (mockup) |
| ---------------- | -------------- |
| 3 colonnes (dossiers + main + IA) | **Rail icônes** + panneau dossiers **repliable** + main large |
| Panneau IA toujours présent (repliable) | **Feuille latérale IA** + bouton flottant « Assist » |
| Recherche barre + modale | **Omnibox** centrale (⌘K) |
| Beaucoup de boutons toolbar | **Actions contextuelles** (survol fil / sélection) |
| Pastel crème uniforme | **Papier chaud** + encre + **un** accent sauge |

## Écrans mockup

Ouvrir dans un navigateur (fichiers locaux) :

1. [`index.html`](index.html) — hub + tokens
2. [`inbox.html`](inbox.html) — liste + brief dossier condensé
3. [`thread.html`](thread.html) — lecture fil (cartes + timeline)
4. [`compose.html`](compose.html) — rédaction split editor / preview

Images PNG de référence : [`images/`](images/) (inbox, fil, compose).

## Parcours cible

```
Rail Mail → Inbox (liste) → Fil (lecture) → [Assist] ou Répondre → Compose
                ↘ Omnibox recherche
Rail Réglages → comptes / IA (hors mockup détaillé)
```

## Suite possible

- Variante **dark « encre »** (même structure)
- Prototype Figma ou intégration progressive sur branche `ux/focus-paper`
