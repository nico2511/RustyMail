import { invoke } from "@tauri-apps/api/core";
import { mergeServerThreadPage } from "../../mailListPage";
import {
  LOCAL_SAVED_DRAFTS_MAILBOX,
  SAVED_DRAFT_THREAD_PREFIX,
  isSavedDraftsVirtualMailbox,
  isUnifiedInboxMailbox,
} from "../../mailboxKinds";
import type { InboxFilterCounts, MailboxFolderStatsRow, SavedDraftListItem, ThreadListItem } from "../types";
import { currentAccount } from "../core/accountContext";
import { BOOT_INVOKE_TIMEOUT_MS } from "../core/timeouts";
import { render } from "../dispatch";
import { safeInvoke, tauriErrorMessage, withTimeout } from "../lib/tauriCommand";
import { isTauriRuntime } from "../lib/tauriRuntime";
import { toast } from "../lib/toast";
import { invalidateIdleAiCachePrefetch, scheduleIdleAiCachePrefetch } from "./idleAiCachePrefetch";
import { scheduleMailboxDigestRefresh } from "./mailboxDigest";
import {
  folderManagerPanelMailbox,
  listMailboxForPanel,
  listThreadsPayload,
} from "./mailboxPanelContext";
import { mergeMailboxFolderStatsForUi, sidebarFolderNamesForCounts } from "./mailboxSidebarStats";
import { state } from "../state";

export type MailListDeps = {
  isSearchActive: () => boolean;
  searchQueryUsesThreadsApi: () => boolean;
  usesSearchContextLoader: () => boolean;
  searchThreads: () => Promise<void>;
  loadThreadsForSearchContext: (append: boolean) => Promise<void>;
};

let mailListDeps: MailListDeps = {
  isSearchActive: () => false,
  searchQueryUsesThreadsApi: () => false,
  usesSearchContextLoader: () => false,
  searchThreads: async () => {},
  loadThreadsForSearchContext: async () => {},
};

export function registerMailListDeps(next: Partial<MailListDeps>): void {
  mailListDeps = { ...mailListDeps, ...next };
}

/** Liste threads en contexte recherche / vue enregistrée (impl. enregistrée via registerMailListDeps). */
export async function loadThreadsForSearchContext(append = false): Promise<void> {
  await mailListDeps.loadThreadsForSearchContext(append);
}

function applyServerThreadPage(page: ThreadListItem[], append: boolean): void {
  const { threads, threadOffsetReset } = mergeServerThreadPage(state.threads, page, append);
  state.threads = threads;
  if (threadOffsetReset) state.threadOffset = 0;
}

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
      BOOT_INVOKE_TIMEOUT_MS
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

export async function reloadCurrentThreadList(append = false): Promise<void> {
  if (isSavedDraftsVirtualMailbox(listMailboxForPanel())) {
    await loadMailView(append);
    return;
  }
  if (mailListDeps.searchQueryUsesThreadsApi()) {
    await mailListDeps.searchThreads();
    return;
  }
  if (mailListDeps.usesSearchContextLoader() || mailListDeps.isSearchActive()) {
    await mailListDeps.loadThreadsForSearchContext(append);
    return;
  }
  await loadMailView(append);
}
export async function applyListFilter(next: typeof state.listFilter): Promise<void> {
  state.listFilter = next;
  state.searchNewsletterRule = null;
  if (state.view !== "folderManager") {
    state.searchScope = "mailbox";
  }
  const mb = listMailboxForPanel();
  if (state.view === "folderManager" && !folderManagerPanelMailbox()) {
    render();
    return;
  }
  if (!isSavedDraftsVirtualMailbox(mb) && isTauriRuntime()) {
    if (mailListDeps.isSearchActive()) {
      await mailListDeps.searchThreads();
    } else {
      await loadMailView(false);
    }
    void loadInboxFilterCounts();
  }
  render();
}
export async function loadMailView(append: boolean = false) {
  if (!append) invalidateIdleAiCachePrefetch();
  if (isUnifiedInboxMailbox(state.selectedMailbox)) {
    if (!isTauriRuntime() || state.accounts.length === 0) {
      if (!append) {
        state.threads = [];
        state.threadOffset = 0;
        state.hasMoreThreads = false;
      }
      return;
    }
    let page: ThreadListItem[];
    try {
      page = await withTimeout(
        invoke<ThreadListItem[]>("list_threads", {
          unified: true,
          pageSize: state.threadPageSize,
          pageOffset: append ? state.threadOffset : 0,
          followedOnly: state.listFilter === "starred",
        }),
        BOOT_INVOKE_TIMEOUT_MS,
      );
      state.mailListError = "";
    } catch (error) {
      const detail = tauriErrorMessage(error);
      console.error("list_threads (unified)", error);
      state.mailListError = `Boîte unifiée : ${detail}`;
      if (!append) {
        state.threads = [];
        state.threadOffset = 0;
        state.hasMoreThreads = false;
      }
      return;
    }
    if (append) applyServerThreadPage(page, true);
    else applyServerThreadPage(page, false);
    state.threadOffset = state.threads.length;
    state.hasMoreThreads = page.length >= state.threadPageSize;
    if (state.selectedThreadId && !state.threads.some((t) => t.id === state.selectedThreadId)) {
      state.selectedThreadId = state.threads[0]?.id;
      state.selectedThread = undefined;
    }
    scheduleMailboxDigestRefresh();
    scheduleIdleAiCachePrefetch();
    return;
  }
  if (isSavedDraftsVirtualMailbox(state.selectedMailbox)) {
    if (append) return;
    const account = currentAccount();
    if (!account || !isTauriRuntime()) {
      state.threads = [];
      state.threadOffset = 0;
      state.hasMoreThreads = false;
      state.selectedThreadId = undefined;
      state.selectedThread = undefined;
      return;
    }
    try {
      const rows = await withTimeout(
        invoke<SavedDraftListItem[]>("saved_draft_list", { accountId: account.id, limit: 200 }),
        BOOT_INVOKE_TIMEOUT_MS
      );
      const mapped: ThreadListItem[] = rows.map((r) => ({
        id: `${SAVED_DRAFT_THREAD_PREFIX}${r.id}`,
        subject: r.title || "Sans objet",
        preview: "",
        participants: ["Brouillon"],
        lastActivity: r.updatedAt,
        messageCount: 0,
        unread: false,
        followed: false,
        pinned: false,
        tags: [],
        mailbox: LOCAL_SAVED_DRAFTS_MAILBOX,
        savedRevisionCount: Math.max(0, Number(r.revisionCount) || 0),
        savedCreatedAt: r.createdAt,
      }));
      state.threads = mapped;
      state.threadOffset = mapped.length;
      state.hasMoreThreads = false;
      if (state.selectedThreadId && !state.threads.some((t) => t.id === state.selectedThreadId)) {
        state.selectedThreadId = state.threads[0]?.id;
        state.selectedThread = undefined;
      }
    } catch (error) {
      console.error("saved_draft_list", error);
      toast(`Liste des brouillons : ${tauriErrorMessage(error)}`);
      state.threads = [];
      state.threadOffset = 0;
      state.hasMoreThreads = false;
    }
    return;
  }

  const base = listThreadsPayload();
  if (!base) {
    if (!append) {
      state.threads = [];
      state.threadOffset = 0;
      state.hasMoreThreads = false;
    }
    return;
  }
  const payload = {
    ...base,
    pageSize: state.threadPageSize,
    pageOffset: append ? state.threadOffset : 0,
    /** Fils suivis : requête SQLite dédiée (tous dossiers), pas seulement la page du dossier courant. */
    followedOnly: state.listFilter === "starred"
  };
  let page: ThreadListItem[];
  if (!isTauriRuntime()) {
    state.mailListError =
      state.mailListError ||
      "Mode navigateur : les boîtes mail se chargent dans l’application Tauri (`npm run tauri:dev`).";
    page = [];
  } else {
    try {
      page = await withTimeout(invoke<ThreadListItem[]>("list_threads", payload), BOOT_INVOKE_TIMEOUT_MS);
      state.mailListError = "";
    } catch (error) {
      const detail = tauriErrorMessage(error);
      console.error("list_threads", error);
      state.mailListError = `Impossible de charger les conversations : ${detail}`;
      toast(state.mailListError);
      if (append) return;
      state.threads = [];
      state.threadOffset = 0;
      state.hasMoreThreads = false;
      if (state.selectedThreadId && !state.threads.some((t) => t.id === state.selectedThreadId)) {
        state.selectedThreadId = state.threads[0]?.id;
        state.selectedThread = undefined;
      }
      return;
    }
  }
  if (append) {
    applyServerThreadPage(page, true);
  } else {
    applyServerThreadPage(page, false);
  }
  state.threadOffset = state.threads.length;
  state.hasMoreThreads = page.length >= state.threadPageSize;
  if (state.selectedThreadId && !state.threads.some((t) => t.id === state.selectedThreadId)) {
    state.selectedThreadId = state.threads[0]?.id;
    state.selectedThread = undefined;
  }
  scheduleMailboxDigestRefresh();
  scheduleIdleAiCachePrefetch();
  void loadInboxFilterCounts().then(() => render());
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
      BOOT_INVOKE_TIMEOUT_MS
    );
  } catch (error) {
    console.warn("mailbox_unread_counts (sidebar)", error);
    rows = await safeInvoke<MailboxFolderStatsRow[]>(
      "mailbox_unread_counts",
      { accountId: account.id },
      [],
      BOOT_INVOKE_TIMEOUT_MS
    );
  }
  const { unread, total } = mergeMailboxFolderStatsForUi(folderList, rows);
  state.mailboxUnread = unread;
  state.mailboxTotal = total;
  void loadInboxFilterCounts();
}
