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
  const inList = (id: string | undefined): id is string => !!id && state.threads.some((t) => t.id === id);
  // La sélection courante (fin de sync) prime sur celle capturée au début : l’utilisateur
  // a pu ouvrir un autre fil pendant la synchronisation.
  const current = state.selectedThreadId ?? keepThreadId;
  if (inList(current)) {
    state.selectedThreadId = current;
  } else if (state.view === "thread" && current) {
    // Fil ouvert absent de la page rechargée (pagination, filtre…) : ne jamais le remplacer
    // par un autre fil ; on le laisse affiché tel quel.
    return;
  } else if (mode === "sync") {
    state.selectedThreadId = state.threads[0]?.id;
  }

  if (state.view === "thread" && state.selectedThreadId) {
    const threadId = state.selectedThreadId;
    try {
      const refreshed = await withTimeout(
        invoke<DiscussionThreadView>("open_thread", { threadId }),
        BOOT_INVOKE_TIMEOUT_MS,
      );
      if (state.selectedThreadId === threadId) state.selectedThread = refreshed;
    } catch (error) {
      if (state.selectedThreadId !== threadId) return;
      if (mode === "sync") {
        console.error("open_thread after sync", error);
        toast.error(`Impossible d’ouvrir le fil : ${tauriErrorMessage(error)}`);
      }
      state.selectedThread = undefined;
    }
  }
}
