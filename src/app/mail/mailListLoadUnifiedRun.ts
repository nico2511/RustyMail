import { invoke } from "@tauri-apps/api/core";
import { isUnifiedInboxMailbox } from "../../mailboxKinds";
import type { ThreadListItem } from "../types";
import { BOOT_INVOKE_TIMEOUT_MS } from "../core/timeouts";
import { tauriErrorMessage, withTimeout } from "../lib/tauriCommand";
import { isTauriRuntime } from "../lib/tauriRuntime";
import { invalidateIdleAiCachePrefetch, scheduleIdleAiCachePrefetch } from "./idleAiCachePrefetch";
import { scheduleMailboxDigestRefresh } from "./mailboxDigest";
import { state } from "../state";
import {
  applyServerThreadPage,
  syncSelectionAfterThreadPage,
} from "./mailListViewContext";

export async function loadUnifiedInboxThreadPage(append: boolean): Promise<boolean> {
  if (!isTauriRuntime() || state.accounts.length === 0) {
    if (!append) {
      state.threads = [];
      state.threadOffset = 0;
      state.hasMoreThreads = false;
    }
    return false;
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
    return false;
  }
  applyServerThreadPage(page, append);
  syncSelectionAfterThreadPage(page.length);
  scheduleMailboxDigestRefresh();
  scheduleIdleAiCachePrefetch();
  return true;
}

export function shouldLoadUnifiedInbox(): boolean {
  return isUnifiedInboxMailbox(state.selectedMailbox);
}
