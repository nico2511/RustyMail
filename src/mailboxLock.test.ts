import { describe, expect, it } from "vitest";
import {
  LOCK_ARCHIVE_MSG,
  LOCK_DELETE_CHILD_MSG,
  LOCK_DELETE_MSG,
  LOCK_RENAME_MSG,
  LOCK_RENAME_PARENT_MSG,
  archiveBlockedReason,
  deleteBlockedReason,
  isOwnLocked,
  mailboxCoveredByLock,
  renameBlockedReason,
} from "./mailboxLock";

const locks = ["Clients/Atelier", "Notes"];

describe("cadenas des dossiers", () => {
  it("couvre le dossier et ses enfants, pas un voisin", () => {
    expect(mailboxCoveredByLock(locks, "Clients/Atelier")).toBe(true);
    expect(mailboxCoveredByLock(locks, "INBOX.Clients.Atelier.2024")).toBe(true);
    expect(mailboxCoveredByLock(locks, "Clients")).toBe(false);
    expect(mailboxCoveredByLock(locks, "Notes/Perso")).toBe(true);
    expect(isOwnLocked(locks, "clients/atelier")).toBe(true);
    expect(isOwnLocked(locks, "Clients/Atelier/2024")).toBe(false);
  });

  it("bloque la suppression du parent quand un enfant est verrouillé", () => {
    expect(deleteBlockedReason(locks, "Clients")).toBe(LOCK_DELETE_CHILD_MSG);
    expect(deleteBlockedReason(locks, "Clients/Atelier")).toBe(LOCK_DELETE_MSG);
    expect(deleteBlockedReason(locks, "Factures")).toBeNull();
  });

  it("bloque le renommage du dossier et de ses enfants, pas du parent libre", () => {
    expect(renameBlockedReason(locks, "Clients/Atelier")).toBe(LOCK_RENAME_MSG);
    expect(renameBlockedReason(locks, "Clients/Atelier/2024")).toBe(LOCK_RENAME_PARENT_MSG);
    expect(renameBlockedReason(locks, "Clients")).toBeNull();
    expect(archiveBlockedReason(locks, "Notes/Perso")).toBe(LOCK_ARCHIVE_MSG);
    expect(archiveBlockedReason(locks, "Clients")).toBeNull();
  });
});
