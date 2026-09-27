# Organiser v2 — état des mécaniques

Relevé après relecture du scan, de l’apply IMAP et de l’UI (`organizationViewV2`, `org_v2_scan`, `org_apply`).

La vue Organiser utile **passe par le LLM**. Les heuristiques préparent le contexte (candidats, compteurs, ids). La sortie affichée est une **orientation** : diagnostic, recommandations, actions proposées. Le cœur mail (IMAP, lecture, envoi) ne dépend pas de ce module. Si le LLM n’est pas joignable, ou si « Propositions Organiser » est désactivé, l’écran affiche un message d’état et **n’invente pas** d’orientation.

## Ce qui fonctionne

| Mécanique | Détail |
| --- | --- |
| Contexte | `org_v2_scan_account` filtre le scan heuristique puis la mémoire. Ce contexte est envoyé au modèle, il n’est pas la file affichée. |
| Orientation | JSON `diagnosis` + `recommendations` + `actions`, validé dans `validate_org_orientation_shape` (`docs/LLM_CONTRACTS.md`). |
| Actions | Cartes issues des `actions` LLM (ids du catalogue ou des candidats, sinon mots-clés). Apply inchangé : archive, corbeille, déplacement. |
| Apply | Archive `Archive/AAAA/MM-mois` selon les préférences, corbeille, déplacement, suppression de dossiers vides. |
| Confirmations | Corbeille : modale + case + jeton `bulk-trash-org`. Dossiers vides : modale + case + jeton `delete-mailbox`. Archive / déplacement : confirmation avant le lot. |
| Sans LLM | Message explicite. File d’actions vide. |
| Undo | Un apply V2 en plusieurs paquets partage un `batchId`. L’annulation ne marque le lot fait que pour les fils réellement revenus en arrière. |

L’action d’une carte porte sur **tous** les fils détectés (plafond de scan 500). L’écran n’en liste qu’un échantillon et le signale.

## Correctifs de cette passe

- Le compteur et l’apply ne s’arrêtent plus à 20 fils alors que le scan en avait trouvé davantage.
- Les dates RFC3339 des doublons servent à choisir la copie canonique (plus un `parse::<i64>` toujours à 0).
- Une erreur de sélection IMAP sur un dossier vide ne purge plus le cache local.
- L’aperçu d’archive calcule le dossier cible fil par fil, filtré par compte.

## Volontairement hors de cette passe

- Carte « tags périmés » : le scan existe (`scan_stale_tags`) mais reste sur Organiser v1. V2 ne l’affiche pas, pour ne pas ajouter une action de retag sans le même parcours de confirmation.
- Pas de refonte visuelle, pas de fusion v1/v2, pas de reprise des maquettes.
- `OrphanThreadRepair` et `SemanticTagRefresh` n’ont pas de scanner.
- La corbeille d’une **ligne** d’échantillon passe encore par l’action fil habituelle, pas par la modale de lot. Le lot « tout mettre en corbeille » reste confirmé.
- Un dossier absent du LIST IMAP (cache fantôme) a encore son cache local retiré. Une erreur de sélection IMAP ne purge plus ce cache et n’est pas comptée comme un succès.
