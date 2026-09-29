# Audit — cadenas des dossiers personnels

Le cadenas (loquet dans l’interface) est une préférence **locale**. Il n’est pas un drapeau IMAP. Il ne suit pas une autre machine ni un autre client de messagerie. La synchro ne le propage pas.

## Où est l’état

- Champ `general.lockedMailboxesByAccount` dans `crates/rustymail-infrastructure/src/app_prefs.rs`.
- Fichier `app_prefs.json`, **le même** que le reste des préférences : à côté de la base SQLite (`prefs_path_from_db_dir` sur le fichier sqlite, soit `paths.prefs_path`).
- Les commandes de la vue Dossiers lisaient auparavant le parent de ce dossier. Elles lisent et écrivent maintenant ce fichier. La clé de compte écrite par `set_mailbox_locked_cmd` est l’identifiant du compte résolu (`account.id`), pas une autre casse reçue par IPC.
- Nom de dossier : chemin logique (segments sur `/` et `.`, `INBOX` de tête ignoré, casse ASCII ignorée). `Clients/Atelier` et `INBOX.Clients.Atelier` sont le même dossier.

## Ce qui est bloqué

Un loquet couvre **le dossier et tout ce qui est en dessous**.

| Action | Règle |
| --- | --- |
| Supprimer (`delete_imap_mailbox_with_contents` et `delete_imap_mailbox`) | Refus si le dossier, un ancêtre ou un descendant est verrouillé. |
| Archiver | Refus si le dossier ou un ancêtre est verrouillé. L’archivage ne descend pas dans les enfants : un enfant verrouillé ne bloque pas l’archivage du parent. |
| Renommer ou déplacer (`rename_imap_mailbox`) | Refus si le dossier ou un ancêtre est verrouillé. Si le dossier est libre et qu’un descendant est verrouillé, le renommage a lieu et **la clé du descendant est réécrite** sur le nouveau chemin. |
| Synchro, création d’un sous-dossier | Pas bloquées. |

Les messages sont dans `app_prefs.rs` (`LOCK_DELETE_MSG`, `LOCK_DELETE_CHILD_MSG`, `LOCK_ARCHIVE_MSG`, `LOCK_RENAME_MSG`, `LOCK_RENAME_PARENT_MSG`). Le front (`src/mailboxLock.ts`) reprend les mêmes phrases pour barrer les boutons et refuser le geste avant l’IPC.

Lecture des préférences pour ces commandes, pour poser le loquet, et pour lister l’arbre : `load_app_prefs_required`. Fichier absent = aucun cadenas. Fichier illisible ou JSON invalide = **erreur**, l’opération ne part pas. Le chargement général de l’app (`load_app_prefs`) reste en échec ouvert, pour ne pas bloquer le démarrage.

## Interface

- Loquet du dossier : son propre état (Libre / Protégé).
- Un enfant d’un dossier protégé affiche « Couvert ». Suppression, archivage et déplacement y sont barrés.
- Un parent libre dont un enfant est protégé garde le déplacement (la clé suivra) mais la suppression est barrée.
- Le dialogue Mailbox (renommer / supprimer) et les actions de la vue Dossiers utilisent les mêmes règles. Le serveur reste la barrière si la liste de cadenas n’est pas encore chargée.

## Hors scope, toujours vrai

Un autre client IMAP, ou RustyMail sur une autre machine, ne voit pas ce fichier. Rien n’est écrit comme drapeau sur le serveur.

## Tests

- `mailbox_lock_tests` dans `app_prefs.rs` : hiérarchie, migration des clés, délimiteur point, JSON invalide.
- `src/mailboxLock.test.ts` : les mêmes décisions côté interface.
