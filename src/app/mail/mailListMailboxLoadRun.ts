import { invoke } from "@tauri-apps/api/core";
import type { ThreadListItem } from "../types";
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
import {
  isSavedDraftsMailboxSelected,
  loadSavedDraftsAsThreadList,
} from "./mailListLoadSavedDraftsRun";
import { loadUnifiedInboxThreadPage, shouldLoadUnifiedInbox } from "./mailListLoadUnifiedRun";

export async function loadMailView(append: boolean = false) {
  if (!append) invalidateIdleAiCachePrefetch();
  if (shouldLoadUnifiedInbox()) {
    await loadUnifiedInboxThreadPage(append);
    return;
  }
  if (isSavedDraftsMailboxSelected()) {
    if (append) return;
    await loadSavedDraftsAsThreadList();
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
    } catch (firstError) {
      const firstDetail = tauriErrorMessage(firstError);
      if (/timeout/i.test(firstDetail) && !append) {
        try {
          page = await withTimeout(
            invoke<ThreadListItem[]>("list_threads", payload),
            BOOT_INVOKE_TIMEOUT_MS,
          );
          state.mailListError = "";
        } catch (retryError) {
          const raw = tauriErrorMessage(retryError);
          const detail = /timeout/i.test(raw)
            ? "délai dépassé pendant la préparation locale — réessayez dans un instant"
            : raw;
          console.error("list_threads", firstError, retryError);
          state.mailListError = `Impossible de charger les conversations : ${detail}`;
          toast.error(state.mailListError);
          state.threads = [];
          state.threadOffset = 0;
          state.hasMoreThreads = false;
          if (state.selectedThreadId && !state.threads.some((t) => t.id === state.selectedThreadId)) {
            state.selectedThreadId = state.threads[0]?.id;
            state.selectedThread = undefined;
          }
          return;
        }
      } else {
        console.error("list_threads", firstError);
        state.mailListError = `Impossible de charger les conversations : ${firstDetail}`;
        toast.error(state.mailListError);
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
  }
  applyServerThreadPage(page, append);
  syncSelectionAfterThreadPage(page.length);
  scheduleMailboxDigestRefresh();
  scheduleIdleAiCachePrefetch();
  void loadInboxFilterCounts().then(() => {
    if (state.view === "list") render();
  });
}
