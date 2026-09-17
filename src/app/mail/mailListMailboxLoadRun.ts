import { invoke } from "@tauri-apps/api/core";
import {
  LOCAL_SAVED_DRAFTS_MAILBOX,
  SAVED_DRAFT_THREAD_PREFIX,
  isSavedDraftsVirtualMailbox,
  isUnifiedInboxMailbox,
} from "../../mailboxKinds";
import type { SavedDraftListItem, ThreadListItem } from "../types";
import { currentAccount } from "../core/accountContext";
import { BOOT_INVOKE_TIMEOUT_MS } from "../core/timeouts";
import { render } from "../dispatch";
import { tauriErrorMessage, withTimeout } from "../lib/tauriCommand";
import { isTauriRuntime } from "../lib/tauriRuntime";
import { toast } from "../lib/toast";
import { invalidateIdleAiCachePrefetch, scheduleIdleAiCachePrefetch } from "./idleAiCachePrefetch";
import { scheduleMailboxDigestRefresh } from "./mailboxDigest";
import { listThreadsPayload } from "./mailboxPanelContext";
import { state } from "../state";
import { loadInboxFilterCounts } from "./mailListSidebarRun";
import {
  applyServerThreadPage,
  syncSelectionAfterThreadPage,
} from "./mailListViewContext";

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
    applyServerThreadPage(page, append);
    syncSelectionAfterThreadPage(page.length);
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
        BOOT_INVOKE_TIMEOUT_MS,
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
    followedOnly: state.listFilter === "starred",
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
  applyServerThreadPage(page, append);
  syncSelectionAfterThreadPage(page.length);
  scheduleMailboxDigestRefresh();
  scheduleIdleAiCachePrefetch();
  void loadInboxFilterCounts().then(() => render());
}
