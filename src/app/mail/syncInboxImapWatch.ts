import { notifyImapWatchFocusedMailbox as notifyImapWatchFocusedMailboxCore } from "../../imapWatchFocus";
import { currentAccount } from "../core/accountContext";
import { isTauriRuntime } from "../lib/tauriRuntime";
import { state } from "../state";

export function notifyImapWatchFocusedMailbox(mailbox?: string): void {
  notifyImapWatchFocusedMailboxCore({
    isTauri: isTauriRuntime(),
    accountId: currentAccount()?.id,
    mailbox: mailbox ?? state.selectedMailbox ?? "",
  });
}
