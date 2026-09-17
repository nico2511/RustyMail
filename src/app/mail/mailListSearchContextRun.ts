import { invoke } from "@tauri-apps/api/core";
import { isSavedDraftsVirtualMailbox } from "../../mailboxKinds";
import type { ThreadListItem } from "../types";
import { BOOT_INVOKE_TIMEOUT_MS } from "../core/timeouts";
import { tauriErrorMessage, withTimeout } from "../lib/tauriCommand";
import { isTauriRuntime } from "../lib/tauriRuntime";
import { state } from "../state";
import { listMailboxForPanel } from "./mailboxPanelContext";
import {
  effectiveSearchMailboxPath,
  searchAccountIdForQuery,
  searchQueryMailboxForList,
} from "./searchQueryContext";
import { scheduleIdleAiCachePrefetch } from "./idleAiCachePrefetch";
import { scheduleMailboxDigestRefresh } from "./mailboxDigest";
import { loadMailView } from "./mailListMailboxLoadRun";
import {
  applyServerThreadPage,
  syncSelectionAfterThreadPage,
} from "./mailListViewContext";

/** Liste threads en contexte recherche / vue enregistrée. */
export async function loadThreadsForSearchContext(append = false): Promise<void> {
  if (isSavedDraftsVirtualMailbox(listMailboxForPanel())) {
    await loadMailView(append);
    return;
  }
  const accountId = searchAccountIdForQuery();
  if (!accountId || !isTauriRuntime()) {
    state.threads = [];
    state.threadOffset = 0;
    state.hasMoreThreads = false;
    return;
  }
  const payload: Record<string, unknown> = {
    accountId,
    pageSize: state.threadPageSize,
    pageOffset: append ? state.threadOffset : 0,
    followedOnly: state.listFilter === "starred",
  };
  const explicitMb = effectiveSearchMailboxPath() ?? state.searchMailboxPath?.trim();
  if (state.searchScope === "account" && !explicitMb) {
    payload.accountWide = true;
  } else {
    payload.mailbox = searchQueryMailboxForList();
  }
  let page: ThreadListItem[];
  try {
    page = await withTimeout(invoke<ThreadListItem[]>("list_threads", payload), BOOT_INVOKE_TIMEOUT_MS);
    state.mailListError = "";
  } catch (error) {
    const detail = tauriErrorMessage(error);
    console.error("list_threads (search context)", error);
    state.mailListError = `Impossible de charger les conversations : ${detail}`;
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
}
