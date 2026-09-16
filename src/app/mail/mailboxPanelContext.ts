import { currentAccount } from "../core/accountContext";
import { state } from "../state";

export function folderManagerPanelMailbox(): string | null {
  if (state.view !== "folderManager") return null;
  const mb = state.folderManager.selectedMailbox?.trim();
  return mb || null;
}

export function listMailboxForPanel(): string {
  return folderManagerPanelMailbox() ?? state.selectedMailbox?.trim() ?? "INBOX";
}

export function listThreadsPayload(): { accountId: string; mailbox: string } | undefined {
  const account = currentAccount();
  if (!account) return undefined;
  if (state.view === "folderManager") {
    const mb = state.folderManager.selectedMailbox?.trim();
    if (!mb) return undefined;
    return { accountId: account.id, mailbox: mb };
  }
  return { accountId: account.id, mailbox: state.selectedMailbox || "INBOX" };
}
