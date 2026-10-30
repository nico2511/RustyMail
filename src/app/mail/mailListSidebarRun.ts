import { invoke } from "@tauri-apps/api/core";
import type { InboxFilterCounts, MailboxFolderStatsRow } from "../types";
import {
  isSavedDraftsVirtualMailbox,
} from "../../mailboxKinds";
import { currentAccount } from "../core/accountContext";
import { BOOT_INVOKE_TIMEOUT_MS } from "../core/timeouts";
import { safeInvoke, withTimeout } from "../lib/tauriCommand";
import { isTauriRuntime } from "../lib/tauriRuntime";
import { state } from "../state";
import { refreshAccountInboxUnreads } from "./accountInboxUnreadRun";
import { folderManagerPanelMailbox } from "./mailboxPanelContext";
import { mergeMailboxFolderStatsForUi, sidebarFolderNamesForCounts } from "./mailboxSidebarStats";

let inboxFilterCountsInflight: { key: string; promise: Promise<void> } | null = null;
let inboxFilterCountsGeneration = 0;

export async function loadInboxFilterCounts(): Promise<void> {
  const account = currentAccount();
  const mb = state.view === "folderManager" ? folderManagerPanelMailbox() : state.selectedMailbox;
  if (!account?.id || !mb || isSavedDraftsVirtualMailbox(mb) || !isTauriRuntime()) {
    state.inboxFilterCounts = null;
    return;
  }
  const key = `${account.id}:${mb}`;
  if (inboxFilterCountsInflight?.key === key) {
    return inboxFilterCountsInflight.promise;
  }
  const gen = ++inboxFilterCountsGeneration;
  const scopeKey = key;
  const promise = (async () => {
    try {
      const fc = await withTimeout(
        invoke<InboxFilterCounts>("mailbox_inbox_filter_counts", {
          accountId: account.id,
          mailbox: mb,
        }),
        BOOT_INVOKE_TIMEOUT_MS,
      );
      const accountNow = currentAccount();
      const mbNow =
        state.view === "folderManager" ? folderManagerPanelMailbox() : state.selectedMailbox;
      if (gen !== inboxFilterCountsGeneration) return;
      if (!accountNow?.id || !mbNow || `${accountNow.id}:${mbNow}` !== scopeKey) return;
      state.inboxFilterCounts = {
        all: Math.max(0, Math.floor(Number(fc.all)) || 0),
        unread: Math.max(0, Math.floor(Number(fc.unread)) || 0),
        starred: Math.max(0, Math.floor(Number(fc.starred)) || 0),
        focused: Math.max(0, Math.floor(Number(fc.focused)) || 0),
        auto: Math.max(0, Math.floor(Number(fc.auto)) || 0),
      };
    } catch (e) {
      if (gen !== inboxFilterCountsGeneration) return;
      console.warn("mailbox_inbox_filter_counts", e);
      state.inboxFilterCounts = null;
    }
  })();
  inboxFilterCountsInflight = { key, promise };
  try {
    await promise;
  } finally {
    if (inboxFilterCountsInflight?.key === key) {
      inboxFilterCountsInflight = null;
    }
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
  await refreshAccountInboxUnreads();
  void loadInboxFilterCounts();
}
