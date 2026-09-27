# Maquettes productivité

Direction UX **officielle** pour la suite de RustyMail. Ces écrans remplacent Clarity : le prochain travail d’interface implémente **cette** direction, pas Clarity (v2–v10 compris).

Ce ne sont pas des variantes de `tokens.css`, ni du costume crème-sauge, ni du teal. Le langage visuel part de zéro : rail charbon, surface blanche, encre foncée, accent cuivre seulement pour le non-lu, l’envoi et le focus. **Literata sert à lire le courrier** (objet, corps, aperçus de liste) ; **IBM Plex Sans sert aux menus et au chrome** (rail, boutons, filtres, modales). Ce qui compte reste visible — sujet, expéditeur, corps du message actif, Répondre, Envoyer, Nouveau, non-lus — et le reste (métadonnées, tags, sync, compte, contact, aide, réécriture, raccourcis, compteurs) passe en retrait, toujours à un clic, un survol ou un raccourci.

## Principes

- **Productivité.** Parcourir, lire, répondre. La densité est calme : une liste, pas des cartes ; un fil en discussion, pas un empilement de panneaux.
- **Beau pour de longues sessions.** Contraste net, peu de couleurs, typographie de lecture (Literata) à côté d’un sans d’outil (IBM Plex Sans).
- **Vrai produit.** Client desktop local-first : IMAP/SMTP, fils, dossiers, recherche (lexicale, sémantique ou hybride), brouillon markdown, pièces jointes, dictée, suivi, tags, HTML nettoyé, images distantes bloquées. L’aide (résumé, traduction, réponses rapides) est un volet repliable, jamais le centre.
- **Validation, pas une boucle.** Trois écrans suffisent pour décider. Ensuite on code l’application.

## Ouvrir

Aucun build. Ouvrir `index.html` dans un navigateur (fichier local ou serveur statique) :

`docs/mockups/productivity/index.html`

Polices embarquées dans `fonts/` (pas d’appel réseau).

Parcours : sommaire → réception → fil → rédaction. La barre d’état reprend les trois liens. Dans la réception, le fil de Camille Moreau ouvre la discussion ; **Répondre** ouvre la rédaction, rail déjà replié. **Nouveau message** (`N`) ouvre une rédaction vide (`compose.html?nouveau=1`).

## Rail replié

Le volet dossiers se replie sur une barre d’icônes (bouton **Réduire**, ou touche `[` — `\` fait la même bascule). En **rédaction**, le rail est replié dès l’ouverture pour laisser presque toute la largeur à l’écriture. Le rouvrir : même touche, ou le chevron en bas du rail.

## Infos à la demande

Le compte ne reste pas affiché dans le rail. L’avatar (ou **Paramètres**, ou le point de synchro) ouvre une modale : identité, comptes IMAP, raccourcis, déconnexion. Lien direct : `inbox.html?profil=1`.

Dans le fil, **Détails** ouvre les propriétés du message (sécurité, tags, copie). Le volet Aide / Réécriture reste un onglet de bord, fermé par défaut.

## Réception multi-compte

Trois boîtes : **Perso** (`nicolas@exemple.fr`), **Atelier** (`atelier@exemple.fr`), **Facturation** (`facturation@exemple.fr`).

`inbox.html` et `inbox.html?compte=tous` montrent le courrier mélangé, du plus récent au plus ancien. Chaque ligne garde le nom du compte, teinté pour le scan : **Perso en ardoise**, **Atelier en olive**, **Facturation en prune**. La pastille reprend la même teinte. Le cuivre reste l’accent de l’interface (non-lu, Répondre, Envoyer), pas la couleur d’un compte.

Le rail, le titre de la liste ou la modale compte choisit une boîte, avec la même couleur. Sur une seule boîte, la teinte passe dans le titre et le rail ; la liste elle-même reste blanche. Les non-lus suivent. Les compteurs restent alignés : 6 au total, 1 en Perso, 3 à l’Atelier, 2 en Facturation.

Liens : `inbox.html?compte=tous`, `?compte=perso`, `?compte=atelier`, `?compte=facturation`. `inbox.html?profil=1` ouvre la modale sur la vue active, avec la synchro de chaque compte et **Ajouter un compte** en retrait. L’avatar reste Nicolas : le compte n’est pas affiché en permanence dans le rail.

## Chaque message se plie

Chaque message du fil est pliable, pas seulement les plus anciens. Un chevron sur la ligne le développe ; le message déjà ouvert se replie (un seul à la fois). Le non-lu garde son trait cuivre, même replié. **Tout replier** et **Tout développer** sont dans la barre du fil.

## Modale contact

Un clic sur un nom ou une adresse — dans le fil ou dans la liste — ouvre une modale : nom, adresses, notes locales s’il y en a, **Écrire**, et **Ajouter au carnet** ou **Voir dans le carnet**. Lien direct : `thread.html?contact=1`. La modale compte (avatar) reste séparée.

## Ce que chaque écran prouve

| Écran | Fichier | Preuve |
| ----- | ------- | ------ |
| Réception | `inbox.html` | Vue unifiée ou filtrée. Perso ardoise, Atelier olive, Facturation prune — le nom du compte reste écrit. |
| Fil | `thread.html` | Chaque message pliable (chevron, accordéon), non-lu marqué cuivre, citation repliée, HTML nettoyé en badges, pièce jointe. Nom ou adresse → modale contact. |
| Rédaction | `compose.html` | Rail replié, À / Cc / Cci, markdown, aperçu, historique, pièces jointes, envoyer. Réécriture en onglet. |

## Captures

- `images/inbox.png` — réception unifiée, compte sur chaque ligne
- `images/inbox-facturation.png` — boîte Facturation seule
- `images/profile-modal.png` — modale compte, trois IMAP
- `images/thread.png` — fil, messages pliables
- `images/contact-modal.png` — modale contact
- `images/compose.png` — rédaction, rail replié

## Hors périmètre

Pas de changement du runtime `src/`. Clarity reste dans le dépôt comme archive, à ne pas prolonger.
