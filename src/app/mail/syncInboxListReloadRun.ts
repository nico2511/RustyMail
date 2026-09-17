import { invoke } from "@tauri-apps/api/core";

import { BOOT_INVOKE_TIMEOUT_MS } from "../core/timeouts";
import { tauriErrorMessage, withTimeout } from "../lib/tauriCommand";
import { toast } from "../lib/toast";
import { state } from "../state";
import type { DiscussionThreadView } from "../types";
import {
  loadMailView,
  loadMailboxUnread,
  loadThreadsForSearchContext,
} from "./mailListView";
import { isSearchActive, usesSearchContextLoader } from "./searchQueryContext";
import { searchThreads } from "./searchThreadsRun";

export async function reloadMailListAfterImapChange(): Promise<void> {
  if (isSearchActive()) {
    await searchThreads();
  } else if (usesSearchContextLoader()) {
    await loadThreadsForSearchContext(false);
  } else {
    await loadMailView();
  }
  await loadMailboxUnread();
}

export async function restoreThreadSelectionAfterReload(options: {
  keepThreadId?: string;
  mode: "push" | "sync";
}): Promise<void> {
  const { keepThreadId, mode } = options;
  if (mode === "sync") {
    if (keepThreadId && state.threads.some((t) => t.id === keepThreadId)) {
      state.selectedThreadId = keepThreadId;
    } else {
      state.selectedThreadId = state.threads[0]?.id;
    }
  } else if (keepThreadId && state.threads.some((t) => t.id === keepThreadId)) {
    state.selectedThreadId = keepThreadId;
  }

  if (state.view === "thread" && state.selectedThreadId) {
    try {
      state.selectedThread = await withTimeout(
        invoke<DiscussionThreadView>("open_thread", { threadId: state.selectedThreadId }),
        BOOT_INVOKE_TIMEOUT_MS,
      );
    } catch (error) {
      if (mode === "sync") {
        console.error("open_thread after sync", error);
        toast(`Impossible d’ouvrir le fil : ${tauriErrorMessage(error)}`);
      }
      state.selectedThread = undefined;
    }
  }
}
