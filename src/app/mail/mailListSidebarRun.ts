import { invoke } from "@tauri-apps/api/core";
import type { InboxFilterCounts, MailboxFolderStatsRow } from "../types";
import {
  isSavedDraftsVirtualMailbox,
} from "../../mailboxKinds";
import { currentAccount } from "../core/accountContext";
import { BOOT_INVOKE_TIMEOUT_MS } from "../core/timeouts";
import { render } from "../dispatch";
import { safeInvoke, withTimeout } from "../lib/tauriCommand";
import { isTauriRuntime } from "../lib/tauriRuntime";
import { state } from "../state";
import { folderManagerPanelMailbox } from "./mailboxPanelContext";
import { mergeMailboxFolderStatsForUi, sidebarFolderNamesForCounts } from "./mailboxSidebarStats";

export async function loadInboxFilterCounts(): Promise<void> {
  const account = currentAccount();
  const mb = state.view === "folderManager" ? folderManagerPanelMailbox() : state.selectedMailbox;
  if (!account?.id || !mb || isSavedDraftsVirtualMailbox(mb) || !isTauriRuntime()) {
    state.inboxFilterCounts = null;
    return;
  }
  try {
    const fc = await withTimeout(
      invoke<InboxFilterCounts>("mailbox_inbox_filter_counts", {
        accountId: account.id,
        mailbox: mb,
      }),
      BOOT_INVOKE_TIMEOUT_MS,
    );
    state.inboxFilterCounts = {
      all: Math.max(0, Math.floor(Number(fc.all)) || 0),
      unread: Math.max(0, Math.floor(Number(fc.unread)) || 0),
      starred: Math.max(0, Math.floor(Number(fc.starred)) || 0),
      focused: Math.max(0, Math.floor(Number(fc.focused)) || 0),
      auto: Math.max(0, Math.floor(Number(fc.auto)) || 0),
    };
  } catch (e) {
    console.warn("mailbox_inbox_filter_counts", e);
    state.inboxFilterCounts = null;
  }
}

export async function loadMailboxUnread() {
  const account = currentAccount();
  if (!account) {
    state.mailboxUnread = {};
    state.mailboxTotal = {};
    return;
  }
  const folderList = sidebarFolderNamesForCounts();
  let rows: MailboxFolderStatsRow[] = [];
  try {
    rows = await withTimeout(
      invoke<MailboxFolderStatsRow[]>("mailbox_unread_counts", {
        accountId: account.id,
        mailboxes: folderList,
      }),
      BOOT_INVOKE_TIMEOUT_MS,
    );
  } catch (error) {
    console.warn("mailbox_unread_counts (sidebar)", error);
    rows = await safeInvoke<MailboxFolderStatsRow[]>(
      "mailbox_unread_counts",
      { accountId: account.id },
      [],
      BOOT_INVOKE_TIMEOUT_MS,
    );
  }
  const { unread, total } = mergeMailboxFolderStatsForUi(folderList, rows);
  state.mailboxUnread = unread;
  state.mailboxTotal = total;
  void loadInboxFilterCounts();
}
