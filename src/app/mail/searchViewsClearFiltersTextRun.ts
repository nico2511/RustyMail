import { render } from "../dispatch";
import { state } from "../state";
import { isSearchActive } from "./searchQueryContext";
import { clearSearchAndReloadInbox, resetManualSearchNlFilters } from "./searchCommitQuery";
import { searchThreads } from "./searchThreadsRun";
import { loadThreadsForSearchContext } from "./mailListView";

export async function tryHandleSearchViewsClearFiltersTextWire(action: string): Promise<boolean> {
  switch (action) {
    case "clear-search-text":
      state.search = "";
      state.searchDraft = "";
      if (!isSearchActive()) {
        void clearSearchAndReloadInbox();
      } else {
        void loadThreadsForSearchContext(false).then(() => render());
      }
      return true;
    case "clear-search-list-filter":
      state.listFilter = "all";
      if (state.search.trim()) {
        void searchThreads();
      } else if (isSearchActive()) {
        void loadThreadsForSearchContext(false).then(() => render());
      } else {
        render();
      }
      return true;
    case "clear-search-nl-filters":
      resetManualSearchNlFilters();
      if (!isSearchActive()) {
        void clearSearchAndReloadInbox();
      } else if (state.search.trim()) {
        void searchThreads();
      } else {
        void loadThreadsForSearchContext(false).then(() => render());
      }
      return true;
    default:
      return false;
  }
}
