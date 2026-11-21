import { filterRecentlyRemovedThreads } from "../../recentlyRemovedThreads";
import type { ThreadListItem } from "../types";
import { render } from "../dispatch";
import { state } from "../state";
import { buildFolderListCacheEntryFromState } from "./mailListFolderCacheBridge";
import {
  folderListCaptureForGen,
  folderListLoadHadCacheHit,
  releaseFolderListCaptureForGen,
} from "./mailListFolderCacheLoadContext";
import { threadListFirstPagesEquivalent, writeFolderListCache } from "./mailListFolderCache";
import type { MailListLoadToken } from "./mailListLoadGeneration";

export function writeFolderListCacheAfterSuccessfulPage(
  page: ThreadListItem[],
  append: boolean,
  token?: MailListLoadToken,
): void {
  if (append) return;
  const captured = token ? folderListCaptureForGen(token.gen) : undefined;
  const key = captured?.key;
  if (!key) return;
  const filtered = filterRecentlyRemovedThreads(page);
  const fromState = buildFolderListCacheEntryFromState();
  writeFolderListCache(key, {
    threads: structuredClone(filtered),
    hasMoreThreads: filtered.length >= state.threadPageSize,
    threadOffset: filtered.length,
    selectedThreadId: fromState?.selectedThreadId ?? state.selectedThreadId,
    listScrollY: fromState?.listScrollY ?? 0,
    updatedAt: Date.now(),
  });
  if (token) releaseFolderListCaptureForGen(token.gen);
}

/** @returns true si la page affichée n’a pas besoin d’être réécrite (revalidate silencieux). */
export function applyFirstPageWithSilentRevalidate(
  page: ThreadListItem[],
  append: boolean,
  hadCacheHit?: boolean,
): boolean {
  const hit = hadCacheHit ?? folderListLoadHadCacheHit();
  if (append || !hit) return false;
  const filtered = filterRecentlyRemovedThreads(page);
  if (threadListFirstPagesEquivalent(state.threads, filtered)) {
    return true;
  }
  const keepSelection = state.selectedThreadId;
  const prevScroll =
    document.querySelector<HTMLElement>(".inbox-thread-list")?.scrollTop ?? 0;
  const prevTopId = state.threads[0]?.id;
  state.threads = filtered;
  state.threadOffset = filtered.length;
  state.hasMoreThreads = filtered.length >= state.threadPageSize;
  if (keepSelection && filtered.some((t) => t.id === keepSelection)) {
    state.selectedThreadId = keepSelection;
  } else {
    state.selectedThreadId = filtered[0]?.id;
    state.selectedThread = undefined;
  }
  const el = document.querySelector<HTMLElement>(".inbox-thread-list");
  if (el) {
    const insertedAtTop =
      filtered.length > 0 && prevTopId && filtered[0]?.id !== prevTopId;
    if (insertedAtTop && prevScroll < 8) {
      el.scrollTop = 0;
    } else if (prevScroll > 0) {
      el.scrollTop = prevScroll;
    }
  }
  render();
  return false;
}