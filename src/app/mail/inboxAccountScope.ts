import { isInboxLikeMailbox, isUnifiedInboxMailbox, preferredInboxMailboxName, UNIFIED_INBOX_MAILBOX } from "../../mailboxKinds";
import {
  inboxUnreadForAccount,
  resolveInboxScope,
  sumInboxUnread,
  type InboxUnreadLookup,
} from "../lib/accountHue";
import { render } from "../dispatch";
import { state } from "../state";
import { switchActiveAccount } from "./switchActiveAccountAction";
import { switchMailbox } from "./switchMailboxRun";

export function inboxUnreadLookup(): InboxUnreadLookup {
  return {
    selectedAccountId: state.selectedAccountId,
    mailboxes: state.mailboxes,
    mailboxUnread: state.mailboxUnread,
    accountInboxUnread: state.accountInboxUnread,
  };
}

export function currentInboxScope(): "all" | string {
  return resolveInboxScope({
    accountCount: state.accounts.length,
    selectedMailbox: state.selectedMailbox,
    selectedAccountId: state.selectedAccountId,
  });
}

export function accountInboxUnreadCount(accountId: string): number {
  return inboxUnreadForAccount(accountId, inboxUnreadLookup());
}

export function allAccountsInboxUnread(): number {
  return sumInboxUnread(
    state.accounts.map((a) => a.id),
    inboxUnreadLookup(),
  );
}

export function closeAccountChrome(): void {
  state.inboxAccountMenuOpen = false;
  state.accountModalOpen = false;
}

export async function applyInboxScopeAll(): Promise<void> {
  closeAccountChrome();
  if (isUnifiedInboxMailbox(state.selectedMailbox) && state.view === "list") {
    render();
    return;
  }
  await switchMailbox(UNIFIED_INBOX_MAILBOX);
}

export async function applyInboxScopeAccount(accountId: string): Promise<void> {
  closeAccountChrome();
  const id = accountId.trim();
  if (!id || !state.accounts.some((a) => a.id === id)) {
    render();
    return;
  }
  const onThisInbox =
    state.selectedAccountId === id &&
    !isUnifiedInboxMailbox(state.selectedMailbox) &&
    isInboxLikeMailbox(state.selectedMailbox) &&
    state.view === "list";
  if (onThisInbox) {
    render();
    return;
  }
  if (state.selectedAccountId !== id) {
    await switchActiveAccount(id);
    render();
    return;
  }
  const inbox = preferredInboxMailboxName(state.mailboxes) ?? "INBOX";
  await switchMailbox(inbox);
}
