import { invoke } from "@tauri-apps/api/core";
import { isUnifiedInboxMailbox } from "../../mailboxKinds";
import type { ThreadListItem } from "../types";
import { BOOT_INVOKE_TIMEOUT_MS } from "../core/timeouts";
import { DB_LOCKED_MESSAGE, tauriErrorMessage, withTimeout } from "../lib/tauriCommand";
import { isTauriRuntime } from "../lib/tauriRuntime";
import { invalidateIdleAiCachePrefetch, scheduleIdleAiCachePrefetch } from "./idleAiCachePrefetch";
import { scheduleMailboxDigestRefresh } from "./mailboxDigest";
import { state } from "../state";
import {
  applyServerThreadPage,
  syncSelectionAfterThreadPage,
} from "./mailListViewContext";
import { beginMailListLoad, isMailListLoadCurrent } from "./mailListLoadGeneration";
import { clearFolderListCache } from "./mailListFolderCache";
import {
  applyFirstPageWithSilentRevalidate,
  writeFolderListCacheAfterSuccessfulPage,
} from "./mailListFolderCacheApply";
import { folderListLoadHadCacheHit } from "./mailListFolderCacheLoadContext";

function handleListThreadsLockedError(detail: string): void {
  if (detail.includes("Base verrouillée")) {
    state.dbLockedMessage = DB_LOCKED_MESSAGE;
    clearFolderListCache();
  }
}

export async function loadUnifiedInboxThreadPage(append: boolean): Promise<boolean> {
  if (!isTauriRuntime() || state.accounts.length === 0) {
    if (!append) {
      state.threads = [];
      state.threadOffset = 0;
      state.hasMoreThreads = false;
    }
    return false;
  }
  const token = beginMailListLoad(append);
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
    if (!isMailListLoadCurrent(token)) return false;
    state.mailListError = "";
  } catch (error) {
    if (!isMailListLoadCurrent(token)) return false;
    const raw = tauriErrorMessage(error);
    handleListThreadsLockedError(raw);
    const detail = /timeout/i.test(raw)
      ? "délai dépassé pendant la préparation locale après mise à jour — réessayez dans un instant"
      : raw;
    console.error("list_threads (unified)", error);
    if (folderListLoadHadCacheHit()) {
      state.mailListError = state.mailListError || "";
      return false;
    }
    state.mailListError = `Boîte unifiée : ${detail}`;
    if (!append) {
      state.threads = [];
      state.threadOffset = 0;
      state.hasMoreThreads = false;
    }
    return false;
  }
  if (!append && applyFirstPageWithSilentRevalidate(page, append)) {
    writeFolderListCacheAfterSuccessfulPage(page, append);
  } else {
    applyServerThreadPage(page, append);
    syncSelectionAfterThreadPage(page.length);
  }
  if (!append) {
    writeFolderListCacheAfterSuccessfulPage(page, append);
  }
  scheduleMailboxDigestRefresh();
  scheduleIdleAiCachePrefetch();
  return true;
}

export function shouldLoadUnifiedInbox(): boolean {
  return isUnifiedInboxMailbox(state.selectedMailbox);
}