import type { Tag } from "../types";
import { render } from "../dispatch";
import { state } from "../state";
import { isSearchActive } from "./searchQueryContext";
import { clearSearchAndReloadInbox } from "./searchCommitQuery";
import { searchThreads } from "./searchThreadsRun";
import { loadThreadsForSearchContext } from "./mailListView";

export async function tryHandleSearchViewsClearFiltersCriteriaWire(
  action: string,
  element?: HTMLElement,
): Promise<boolean> {
  switch (action) {
    case "clear-search-sender":
      state.searchSenders = [];
      if (!isSearchActive()) {
        void clearSearchAndReloadInbox();
      } else if (state.search.trim() || state.searchTags.length > 0) {
        void searchThreads();
      } else {
        void loadThreadsForSearchContext(false).then(() => render());
      }
      return true;
    case "clear-search-sender-one": {
      const email = element?.dataset.email?.trim().toLowerCase();
      if (email) state.searchSenders = state.searchSenders.filter((s: string) => s.toLowerCase() !== email);
      if (!isSearchActive()) void clearSearchAndReloadInbox();
      else if (state.search.trim() || state.searchSenders.length || state.searchTags.length) void searchThreads();
      else void loadThreadsForSearchContext(false).then(() => render());
      return true;
    }
    case "clear-search-mailbox":
      state.searchMailboxPath = null;
      state.searchDraft = state.searchDraft
        .replace(/#(?:local|dossier|ici):(?:"[^"]*"|'[^']*'|[^\s#]+)/gi, "")
        .replace(/\s{2,}/g, " ")
        .trim();
      {
        const searchInClear = document.querySelector<HTMLInputElement>("#search-input");
        if (searchInClear) searchInClear.value = state.searchDraft;
      }
      if (!isSearchActive()) void clearSearchAndReloadInbox();
      else if (state.search.trim() || state.searchSenders.length || state.searchTags.length) void searchThreads();
      else void loadThreadsForSearchContext(false).then(() => render());
      return true;
    case "clear-search-account":
      state.searchAccountOverrideId = null;
      if (!isSearchActive()) void clearSearchAndReloadInbox();
      else if (state.search.trim() || state.searchSenders.length || state.searchTags.length) void searchThreads();
      else void loadThreadsForSearchContext(false).then(() => render());
      return true;
    case "clear-search-tag-one": {
      const raw = element?.dataset.tag?.trim().toLowerCase();
      if (raw) {
        state.searchTags = state.searchTags.filter(
          (t: Tag) => `${String(t.family).toLowerCase()}:${t.value}`.toLowerCase() !== raw,
        );
      }
      if (!isSearchActive()) void clearSearchAndReloadInbox();
      else if (state.search.trim() || state.searchSenders.length || state.searchTags.length) void searchThreads();
      else void loadThreadsForSearchContext(false).then(() => render());
      return true;
    }
    case "clear-search-newsletter-rule":
      state.searchNewsletterRule = null;
      if (state.search.trim()) {
        void searchThreads();
      } else {
        void loadThreadsForSearchContext(false).then(() => render());
      }
      return true;
    default:
      return false;
  }
}
