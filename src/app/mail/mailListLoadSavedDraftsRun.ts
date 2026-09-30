import { invoke } from "@tauri-apps/api/core";
import {
  LOCAL_SAVED_DRAFTS_MAILBOX,
  SAVED_DRAFT_THREAD_PREFIX,
  isSavedDraftsVirtualMailbox,
} from "../../mailboxKinds";
import { filterRecentlyRemovedThreads } from "../../recentlyRemovedThreads";
import type { SavedDraftListItem, ThreadListItem } from "../types";
import { currentAccount } from "../core/accountContext";
import { BOOT_INVOKE_TIMEOUT_MS } from "../core/timeouts";
import { tauriErrorMessage, withTimeout } from "../lib/tauriCommand";
import { isTauriRuntime } from "../lib/tauriRuntime";
import { toast } from "../lib/toast";
import { state } from "../state";

let savedDraftListGeneration = 0;

export function isSavedDraftsMailboxSelected(): boolean {
  return isSavedDraftsVirtualMailbox(state.selectedMailbox);
}

/** Liste Sauvés affichable : masque les suppressions locales, puis le filtre de la barre. */
export function visibleSavedDraftThreads(rows: ThreadListItem[]): ThreadListItem[] {
  const withoutRemoved = filterRecentlyRemovedThreads(rows);
  const q = state.search.trim().toLowerCase();
  if (!q) return withoutRemoved;
  return withoutRemoved.filter((t) => {
    const subj = t.subject.toLowerCase();
    const who = (t.participants[0] ?? "").toLowerCase();
    return subj.includes(q) || who.includes(q);
  });
}

export async function loadSavedDraftsAsThreadList(): Promise<void> {
  const gen = ++savedDraftListGeneration;
  const account = currentAccount();
  if (!account || !isTauriRuntime()) {
    if (gen !== savedDraftListGeneration) return;
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
    if (gen !== savedDraftListGeneration) return;
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
    const visible = visibleSavedDraftThreads(mapped);
    state.threads = visible;
    state.threadOffset = visible.length;
    state.hasMoreThreads = false;
    if (state.selectedThreadId && !state.threads.some((t) => t.id === state.selectedThreadId)) {
      state.selectedThreadId = state.threads[0]?.id;
      state.selectedThread = undefined;
    }
  } catch (error) {
    if (gen !== savedDraftListGeneration) return;
    console.error("saved_draft_list", error);
    toast.error(`Liste des brouillons : ${tauriErrorMessage(error)}`);
    state.threads = [];
    state.threadOffset = 0;
    state.hasMoreThreads = false;
  }
}
