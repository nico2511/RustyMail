# Audit — cadenas des dossiers personnels

Le cadenas (loquet dans l’interface) est une préférence **locale**. Il n’est pas un drapeau IMAP. Il empêche deux commandes RustyMail, sur le **nom exact** du dossier. Il ne protège pas le dossier sur le serveur, ni sur une autre machine, ni contre toutes les commandes de l’application.

## Où est l’état

- Champ `general.lockedMailboxesByAccount` : `HashMap<String, Vec<String>>` dans `crates/rustymail-infrastructure/src/app_prefs.rs`.
- Fichier `app_prefs.json`, à côté de la base SQLite (`prefs_path_from_db_dir`).
- Clé de compte : la chaîne IPC **trimée**, comparaison exacte (pas de casse ignorée).
- Nom de dossier : comparaison `eq_ignore_ascii_case` après trim. La casse Unicode (`É` / `é`) ne compte pas comme le même nom.
- `list_mailbox_tree` relit cette liste et l’envoie au front dans `lockedMailboxes`. Le front compare aussi en ASCII, insensible à la casse.

Écrire le loquet : `set_mailbox_locked` charge le JSON, ajoute ou retire le nom, réécrit **tout** le fichier de préférences.

## IPC

| Commande | Contrôle le cadenas |
| --- | --- |
| `set_mailbox_locked_cmd` | Écrit la liste. Valide `accountId` et le nom de boîte (`ipc_guard`). Ne résout pas le compte en base : la clé est l’identifiant reçu. |
| `list_mailbox_tree_cmd` | Lit la liste du compte. |
| `archive_mailbox_threads_cmd` | Refuse si le nom exact est verrouillé. Message : « Dossier verrouillé — déverrouillez-le pour archiver. » |
| `delete_imap_mailbox_with_contents_cmd` | Refuse si le nom exact est verrouillé, après l’accusé `delete-mailbox-with-contents`. Message : « Dossier verrouillé — déverrouillez-le pour supprimer. » |
| `rename_imap_mailbox` | **Aucun** contrôle. Ne réécrit pas les clés. |
| `delete_imap_mailbox` | **Aucun** contrôle. Accusé `delete-mailbox` seulement. |
| `rename_mailbox_subtree_retag_cmd` | Cache et tags seulement. Ne touche pas au cadenas. |

Le bouton du loquet (`data-action="fm-toggle-lock"`) appelle `setMailboxLocked` puis remplace `report.lockedMailboxes` par la liste renvoyée.

## Ce qui est vraiment bloqué

Dans la vue Dossiers, loquet fermé :

- le bouton supprimer n’a plus `data-action` (il est `disabled`) ;
- l’archivage de la ligne, « Archiver tout » et « Archiver maintenant » sont `disabled` ;
- la poignée de déplacement n’est plus `draggable`.

Côté Rust, seules `archive_mailbox_threads` et `delete_imap_mailbox_with_contents` relisent le fichier et refusent le **nom demandé**.

La synchro du dossier n’est pas bloquée. Créer un sous-dossier non plus.

## Trous

1. **Renommage et déplacement.** `fmRenameMailbox`, `fmMoveFolder` et la gestion de boîte « renommer » passent par `rename_imap_mailbox`. Le cadenas n’est pas consulté. Le cache local est renommé, la clé de verrou reste sur l’ancien chemin. Après rafraîchissement, le dossier affiché est libre, et l’ancienne clé reste orpheline dans le JSON.
2. **Autre suppression.** `mailboxManageKindInvokeRun` (kind `delete`) appelle `delete_imap_mailbox`, qui ne lit pas les cadenas. Un dossier protégé dans la vue Dossiers peut être supprimé depuis cette autre action.
3. **Enfants.** `delete_imap_mailbox_with_contents` ne vérifie que le dossier demandé, puis efface les descendants. Un parent libre entraîne un enfant verrouillé. Un parent verrouillé n’empêche pas de supprimer l’enfant par son propre nom.
4. **Pas de drapeau serveur.** Un autre client IMAP, ou RustyMail sur une autre machine, ne voit pas `app_prefs.json`. La synchro ne propage pas le cadenas.
5. **Lecture des préférences en échec ouvert.** Fichier absent, illisible ou JSON invalide : `load_app_prefs` renvoie les préférences par défaut, donc une liste vide. Les commandes gardées laissent alors passer. Un enregistrement ensuite réécrit le fichier à partir de cet état par défaut.
6. **Clé de compte non canonique.** L’écriture utilise l’`accountId` IPC. La lecture (archivage, suppression avec contenu) utilise `account.id` trouvé par égalité stricte. La vue envoie le même identifiant des deux côtés, donc le chemin normal tient. Un appel qui enregistrerait une autre casse (`Nom@example.com` contre `nom@example.com`) créerait une entrée que les commandes gardées ne consultent pas : la résolution du compte échoue avant, sur l’égalité stricte.
7. **Le commentaire historique promettait trop.** Il parlait de bloquer aussi le glisser et le renommage. Le glisser est seulement masqué dans cette vue. Le renommage ne l’est pas. Le commentaire du champ a été aligné sur le comportement réel ; le comportement, lui, n’a pas été changé par cet audit.

## Ce que cette PR ne corrige pas

L’interface recommandée (loquet) rend lisible ce que le serveur vérifie déjà dans cette vue. Elle ne ferme pas les trous 1 à 6.
