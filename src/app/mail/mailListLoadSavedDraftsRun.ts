import { invoke } from "@tauri-apps/api/core";
import {
  LOCAL_SAVED_DRAFTS_MAILBOX,
  SAVED_DRAFT_THREAD_PREFIX,
  isSavedDraftsVirtualMailbox,
} from "../../mailboxKinds";
import type { SavedDraftListItem, ThreadListItem } from "../types";
import { currentAccount } from "../core/accountContext";
import { BOOT_INVOKE_TIMEOUT_MS } from "../core/timeouts";
import { tauriErrorMessage, withTimeout } from "../lib/tauriCommand";
import { isTauriRuntime } from "../lib/tauriRuntime";
import { toast } from "../lib/toast";
import { state } from "../state";

export function isSavedDraftsMailboxSelected(): boolean {
  return isSavedDraftsVirtualMailbox(state.selectedMailbox);
}

export async function loadSavedDraftsAsThreadList(): Promise<void> {
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
}
