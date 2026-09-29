/**
 * Même découpage que `mailbox_logical_path_key` (Rust) :
 * segments sur `/` et `.`, `INBOX` de tête ignoré, casse ASCII ignorée.
 * Les messages doivent rester ceux de `app_prefs.rs`.
 */

export const LOCK_DELETE_MSG = "Dossier verrouillé — déverrouillez-le pour supprimer.";
export const LOCK_DELETE_CHILD_MSG =
  "Un sous-dossier est verrouillé — déverrouillez-le avant de supprimer ce dossier.";
export const LOCK_ARCHIVE_MSG = "Dossier verrouillé — déverrouillez-le pour archiver.";
export const LOCK_RENAME_MSG =
  "Dossier verrouillé — déverrouillez-le pour le renommer ou le déplacer.";
export const LOCK_RENAME_PARENT_MSG =
  "Dossier couvert par un loquet parent — déverrouillez le parent pour le renommer ou le déplacer.";

export function mailboxLogicalSegments(name: string): string[] {
  const parts = name
    .split(/[/.]/)
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0)
    .map((segment) => segment.toLowerCase());
  if (parts[0] === "inbox") parts.shift();
  return parts;
}

function sameKey(a: string[], b: string[]): boolean {
  return a.length > 0 && a.length === b.length && a.every((segment, index) => segment === b[index]);
}

function isStrictPrefix(prefix: string[], full: string[]): boolean {
  return prefix.length > 0 && prefix.length < full.length && prefix.every((segment, index) => segment === full[index]);
}

export function isOwnLocked(locks: readonly string[], mailbox: string): boolean {
  const mb = mailboxLogicalSegments(mailbox);
  return locks.some((lock) => sameKey(mailboxLogicalSegments(lock), mb));
}

export function mailboxCoveredByLock(locks: readonly string[], mailbox: string): boolean {
  const mb = mailboxLogicalSegments(mailbox);
  if (mb.length === 0) return false;
  return locks.some((lock) => {
    const key = mailboxLogicalSegments(lock);
    return sameKey(key, mb) || isStrictPrefix(key, mb);
  });
}

export function mailboxHasLockedDescendant(locks: readonly string[], mailbox: string): boolean {
  const mb = mailboxLogicalSegments(mailbox);
  if (mb.length === 0) return false;
  return locks.some((lock) => isStrictPrefix(mb, mailboxLogicalSegments(lock)));
}

export function deleteBlockedReason(locks: readonly string[], mailbox: string): string | null {
  if (mailboxCoveredByLock(locks, mailbox)) return LOCK_DELETE_MSG;
  if (mailboxHasLockedDescendant(locks, mailbox)) return LOCK_DELETE_CHILD_MSG;
  return null;
}

export function archiveBlockedReason(locks: readonly string[], mailbox: string): string | null {
  return mailboxCoveredByLock(locks, mailbox) ? LOCK_ARCHIVE_MSG : null;
}

export function renameBlockedReason(locks: readonly string[], mailbox: string): string | null {
  const mb = mailboxLogicalSegments(mailbox);
  if (mb.length === 0) return null;
  if (locks.some((lock) => sameKey(mailboxLogicalSegments(lock), mb))) return LOCK_RENAME_MSG;
  if (locks.some((lock) => isStrictPrefix(mailboxLogicalSegments(lock), mb))) return LOCK_RENAME_PARENT_MSG;
  return null;
}
