# Clarity v9 — base v8, triage & clarté d’action

Itération **v9** : reprend **toute la v8** (Date/Contact, Contraste+, épingler, activité, ton, navigation) et ajoute le **flux « à traiter »**.

## Nouveautés v9 (vs v8)

| Zone | Mécanique |
| ---- | --------- |
| Inbox | Filtre **Triage** — non lus, échéances, épinglés, action requise |
| Inbox | Encart **Prochaine action** dans le panneau lecture |
| Sidebar | **Rappels** unifiés (reporter + échéances) |
| Inbox | ⌘K → **Vue triage** |
| Fil | **Réponses rapides** (puces) au-dessus de la suggestion |
| Compose | **Checklist** avant envoi (destinataire, ton, PJ) |
| v8 | Inchangé — tri, contraste, split, Focus, v7… |

## Parcours mockup

`inbox.html` → **Triage** → lire **Prochaine action** → fil réponses rapides → compose checklist

## Fichiers

- [`index.html`](index.html) · [`inbox.html`](inbox.html) · [`thread.html`](thread.html) · [`compose.html`](compose.html)
- [`clarity.css`](clarity.css) · [`mockup.js`](mockup.js) · [`images/clarity-v9-*.png`](images/)

## Boutons (v9+)

- **Taille** : compact (11px, padding réduit).
- **Couleur** : teal **plein** seulement pour **Envoyer** ; Nouveau / Répondre / Ouvrir = contour ou ghost teal.
- **Barre** : Focus, Contraste+, Sélection = pills neutres, état actif teal léger.

## Intent (inchangé)

Calme, utile, beau sans bruit — couleur pour **l’important** seulement.
