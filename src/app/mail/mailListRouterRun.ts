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
  render();
  if (!isSavedDraftsVirtualMailbox(mb) && isTauriRuntime()) {
    const starredChanged = (prevFilter === "starred") !== (next === "starred");
    if (deps.isSearchActive()) {
      await deps.searchThreads();
    } else if (starredChanged) {
      await loadMailView(false);
    }
  }
}
