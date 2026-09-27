# Note UX — direction productivité

Guidance officielle pour la **prochaine** interface de RustyMail. Les écrans de référence sont les maquettes [`docs/mockups/productivity/`](mockups/productivity/README.md). Ouvrir `index.html` dans ce dossier, sans build.

**Vague 1 est dans `src/`.** Le chrome suit cette note : rail charbon, surface blanche, cuivre, Literata pour lire, IBM Plex Sans pour le chrome (`tokens.css`, `productivity-shell.css`, `appearance.css`). Crème, sauge et lavande ne sont plus le clair par défaut. Le sombre et Contraste+ restent, retintés cuivre. Encore maquette seulement (vague 2) : vue unifiée et teintes de compte, accordéon message par message, modales compte et contact. Ne pas traiter Clarity (v2–v10) comme la direction.

## Principes

- **Lire, trier, répondre.** Densité calme : une liste, un fil en discussion, une rédaction large.
- **Deux polices.** Literata pour l’objet, le corps et les aperçus. IBM Plex Sans pour le rail, les boutons, les filtres et les modales.
- **Cuivre rare.** Non-lu, Répondre, Envoyer, Nouveau message, focus. Pas la couleur d’un compte.
- **Premier plan / retrait.** Sujet, expéditeur, corps du message ouvert et actions principales restent visibles. Métadonnées, tags, DKIM, sync, compte, contact, aide, réécriture, raccourcis et compteurs secondaires passent en retrait — plus petits, plus gris, ou derrière un chevron, un onglet, une modale, un survol — et restent disponibles.
- **Multicompte.** Vue unifiée ou une boîte à la fois. Le nom du compte est toujours écrit. Teinte en plus : Perso ardoise, Atelier olive, Facturation prune.
- **Pas de costume.** Ni crème, ni sauge, ni lavande, ni teal Clarity.

## Shell

Fenêtre desktop (barre 40 px, barre d’état 28 px).

```
┌──────────┬─────────────────────────────────────┐
│ Rail     │  Liste, fil ou rédaction            │
│ charbon  │  surface blanche                    │
│ 232 px   │                          [Aide]     │
│ ou 56 px │                                     │
├──────────┴─────────────────────────────────────┤
│  Sync (point) · parcours                        │
└─────────────────────────────────────────────────┘
```

- **Rail repliable.** Bouton Réduire, ou `[` / `\`. En rédaction il est replié dès l’ouverture.
- **Compte hors du rail.** L’avatar, Paramètres ou le point de sync ouvrent une modale (identité, comptes IMAP, sync, déconnexion). `inbox.html?profil=1`.
- **Aide et réécriture.** Onglet de bord, fermé par défaut. Pas un panneau ouvert au centre.
- **Contact.** Clic sur un nom ou une adresse : modale (écrire, carnet), pas une page. `thread.html?contact=1`.

## Cartographie

| Écran | Dans les maquettes | Hors maquette (le produit existe déjà) |
| ----- | ------------------ | -------------------------------------- |
| Réception | `inbox.html` — unifiée ou filtrée, pastilles de compte, non-lus | — |
| Fil | `thread.html` — chaque message pliable, citation repliée, HTML nettoyé en badges, pièce jointe | — |
| Rédaction | `compose.html` — markdown, aperçu, historique, pièces jointes, envoyer | — |
| Compte | Modale (avatar) | Page réglages complète, OAuth |
| Contact | Modale depuis un nom | Page carnet |
| Dossiers | Rail + arborescence repliée | Gestionnaire de dossiers dédié |
| Recherche | Champ dans la réception | Résultats sémantiques / hybrides dessinés à part |
| Aide | Onglet fermé | Réglages des modèles |
| Organiser | — | Centre d’organisation (voir `ORGANISER_V2.md`) |

Les maquettes habillent des mécaniques déjà là (IMAP, fils, dossiers, recherche, markdown, pièces jointes, aide optionnelle). Elles n’ajoutent pas de produit.

## Parcours

Sommaire → réception → fil → rédaction.

- `inbox.html?compte=tous` — liste mélangée, pastille par ligne.
- `?compte=perso` · `?compte=atelier` · `?compte=facturation` — une boîte, teinte dans le titre et le rail.
- Fil de Camille Moreau → **Répondre** → rédaction, rail replié.

Détail et captures : [`docs/mockups/productivity/README.md`](mockups/productivity/README.md). Règles : [`docs/mockups/RULES.md`](mockups/RULES.md).

## Archive

Clarity v2–v10, Focus Paper (`vNext/`) et les alternatives couleur sont closes. L’inventaire [`APP-COMPONENT-INVENTORY.md`](mockups/APP-COMPONENT-INVENTORY.md) décrit le shell **livré**, pas la cible.

---

*Vague 1 (tokens, typo, shell) est dans `src/`. Cette note décrit encore la cible, dont ce que la vague 2 doit implémenter.*
