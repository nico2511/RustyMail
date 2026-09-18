import { render } from "../dispatch";
import { state } from "../state";
import { toast } from "../lib/toast";
import { threadMailboxListLabel } from "../../mailboxKinds";
import { isSearchActive } from "./searchQueryContext";
import { searchThreads } from "./searchThreadsRun";
import { loadThreadsForSearchContext } from "./mailListView";

export async function tryHandleSearchViewsClearFiltersScopeWire(action: string): Promise<boolean> {
  if (action !== "toggle-search-scope") return false;
  state.searchScope = state.searchScope === "account" ? "mailbox" : "account";
  state.searchMailboxPath = null;
  toast(
    state.searchScope === "account"
      ? "Portée : tout le compte (tous les dossiers)"
      : `Portée : dossier affiché — ${threadMailboxListLabel(state.selectedMailbox || "INBOX").full}`,
  );
  if (isSearchActive()) {
    if (state.search.trim() || state.searchSenders.length) void searchThreads();
    else void loadThreadsForSearchContext(false).then(() => render());
  } else {
    render();
  }
  return true;
}
