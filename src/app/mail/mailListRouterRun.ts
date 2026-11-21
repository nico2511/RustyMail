import { isSavedDraftsVirtualMailbox } from "../../mailboxKinds";
import { render } from "../dispatch";
import { isTauriRuntime } from "../lib/tauriRuntime";
import { state } from "../state";
import {
  folderManagerPanelMailbox,
  listMailboxForPanel,
} from "./mailboxPanelContext";
import { loadMailView } from "./mailListMailboxLoadRun";
import { loadThreadsForSearchContext } from "./mailListSearchContextRun";
import { requireMailListDeps } from "./mailListViewContext";
import {
  applyFolderListCacheEntry,
  currentFolderListCacheKey,
  persistCurrentFolderListCache,
  restoreListScrollYAfterRender,
  tryReadFolderListCacheForKey,
} from "./mailListFolderCacheBridge";
import { beginFolderListLoad, clearFolderListLoadContext } from "./mailListFolderCacheLoadContext";

export async function reloadCurrentThreadList(append = false): Promise<void> {
  const deps = requireMailListDeps();
  if (isSavedDraftsVirtualMailbox(listMailboxForPanel())) {
    await loadMailView(append);
    return;
  }
  if (deps.searchQueryUsesThreadsApi()) {
    await deps.searchThreads();
    return;
  }
  if (deps.usesSearchContextLoader() || deps.isSearchActive()) {
    await loadThreadsForSearchContext(append);
    return;
  }
  await loadMailView(append);
}

export async function applyListFilter(next: typeof state.listFilter): Promise<void> {
  const deps = requireMailListDeps();
  const prevFilter = state.listFilter;
  persistCurrentFolderListCache(undefined, prevFilter === "starred");
  state.listFilter = next;
  state.searchNewsletterRule = null;
  if (state.view !== "folderManager") {
    state.searchScope = "mailbox";
  }
  const mb = listMailboxForPanel();
  if (state.view === "folderManager" && !folderManagerPanelMailbox()) {
    render();
    return;
  }
  const starredChanged = (prevFilter === "starred") !== (next === "starred");
  let cacheHit = false;
  let pendingScrollY = 0;
  if (
    !isSavedDraftsVirtualMailbox(mb) &&
    isTauriRuntime() &&
    starredChanged &&
    !deps.isSearchActive()
  ) {
    const loadKey = currentFolderListCacheKey(mb, next === "starred");
    const cached = tryReadFolderListCacheForKey(loadKey);
    if (cached) {
      cacheHit = true;
      applyFolderListCacheEntry(cached);
      pendingScrollY = cached.listScrollY;
    } else {
      state.threads = [];
      state.threadOffset = 0;
      state.hasMoreThreads = false;
      state.selectedThreadId = undefined;
      state.selectedThread = undefined;
      state.mailListLoading = true;
    }
    beginFolderListLoad(loadKey, cacheHit);
  }
  render();
  if (cacheHit) restoreListScrollYAfterRender(pendingScrollY);
  if (!isSavedDraftsVirtualMailbox(mb) && isTauriRuntime()) {
    if (deps.isSearchActive()) {
      await deps.searchThreads();
    } else if (starredChanged) {
      await loadMailView(false);
      clearFolderListLoadContext();
    }
  }
}