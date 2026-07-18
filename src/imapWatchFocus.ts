import { invoke } from "@tauri-apps/api/core";
import { isSavedDraftsVirtualMailbox, isVirtualMailbox } from "./mailboxKinds";

/**
 * Informe la veille IDLE du dossier affiché (sync hors INBOX en arrière-plan).
 * No-op hors runtime Tauri.
 */
export function notifyImapWatchFocusedMailbox(opts: {
  isTauri: boolean;
  accountId: string | undefined;
  mailbox: string;
}): void {
  if (!opts.isTauri) return;
  const accountId = opts.accountId?.trim();
  if (!accountId) return;
  const mb = String(opts.mailbox ?? "").trim();
  if (!mb || isVirtualMailbox(mb) || isSavedDraftsVirtualMailbox(mb)) {
    void invoke("imap_set_focused_mailbox", { accountId, mailbox: "" }).catch(() => {});
    return;
  }
  void invoke("imap_set_focused_mailbox", { accountId, mailbox: mb }).catch(() => {});
}
