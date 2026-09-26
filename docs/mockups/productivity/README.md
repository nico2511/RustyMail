# Maquettes productivité

Direction UX **officielle** pour la suite de RustyMail. Ces écrans remplacent Clarity : le prochain travail d’interface implémente **cette** direction, pas Clarity (v2–v10 compris).

Ce ne sont pas des variantes de `tokens.css`, ni du costume crème-sauge, ni du teal. Le langage visuel part de zéro : rail charbon, surface blanche, encre foncée, accent cuivre seulement pour le non-lu, l’envoi et le focus. Le serif est réservé au courrier ; le chrome reste en sans.

## Principes

- **Productivité.** Parcourir, lire, répondre. La densité est calme : une liste, pas des cartes ; un fil en discussion, pas un empilement de panneaux.
- **Beau pour de longues sessions.** Contraste net, peu de couleurs, typographie de lecture (Literata) à côté d’un sans d’outil (IBM Plex Sans).
- **Vrai produit.** Client desktop local-first : IMAP/SMTP, fils, dossiers, recherche (lexicale, sémantique ou hybride), brouillon markdown, pièces jointes, dictée, suivi, tags, HTML nettoyé, images distantes bloquées. L’aide (résumé, traduction, réponses rapides) est un volet repliable, jamais le centre.
- **Validation, pas une boucle.** Trois écrans suffisent pour décider. Ensuite on code l’application.

## Ouvrir

Aucun build. Ouvrir `index.html` dans un navigateur (fichier local ou serveur statique) :

`docs/mockups/productivity/index.html`

Polices embarquées dans `fonts/` (pas d’appel réseau).

Parcours : sommaire → réception → fil → rédaction. La barre d’état reprend les trois liens. Dans la réception, le fil de Camille Moreau ouvre la discussion ; **Répondre** ouvre la rédaction. **Nouveau message** (`N`) ouvre une rédaction vide (`compose.html?nouveau=1`).

## Ce que chaque écran prouve

| Écran | Fichier | Preuve |
| ----- | ------- | ------ |
| Réception | `inbox.html` | Hiérarchie des non-lus, expéditeur / objet / aperçu / date, actions au survol et au clavier, dossiers en retrait, recherche atteignable, filtres Tous / Non lus / Suivis. |
| Fil | `thread.html` | Sujet, participants, pile de messages, citation repliée, fragment HTML nettoyé, pièce jointe, répondre / archiver / corbeille / déplacer. Volet Aide fermé par défaut. |
| Rédaction | `compose.html` | À / Cc / Cci, objet, markdown, aperçu, historique de brouillon, pièces jointes, envoyer. Réécriture en volet secondaire. |

## Captures

- `images/inbox.png`
- `images/thread.png`
- `images/compose.png`

## Hors périmètre

Pas de changement du runtime `src/`. Clarity reste dans le dépôt comme archive, à ne pas prolonger.
