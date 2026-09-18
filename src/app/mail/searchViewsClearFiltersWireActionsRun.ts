import type { Tag } from "../types";
import { render } from "../dispatch";
import { state } from "../state";
import { toast } from "../lib/toast";
import { threadMailboxListLabel } from "../../mailboxKinds";
import { applyListFilter, loadMailView, loadThreadsForSearchContext } from "./mailListView";
import { isSearchActive, usesSearchContextLoader } from "./searchQueryContext";
import { clearSearchAndReloadInbox, resetManualSearchNlFilters } from "./searchCommitQuery";
import { searchThreads } from "./searchThreadsRun";
import { dismissMailboxDigestPanel } from "./mailboxDigest";

export async function tryHandleSearchViewsClearFiltersWire(
  action: string,
  element?: HTMLElement
): Promise<boolean> {
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
          (t: Tag) => `${String(t.family).toLowerCase()}:${t.value}`.toLowerCase() !== raw
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
    case "toggle-search-scope":
      state.searchScope = state.searchScope === "account" ? "mailbox" : "account";
      state.searchMailboxPath = null;
      toast(
        state.searchScope === "account"
          ? "Portée : tout le compte (tous les dossiers)"
          : `Portée : dossier affiché — ${threadMailboxListLabel(state.selectedMailbox || "INBOX").full}`
      );
      if (isSearchActive()) {
        if (state.search.trim() || state.searchSenders.length) void searchThreads();
        else void loadThreadsForSearchContext(false).then(() => render());
      } else {
        render();
      }
      return true;
    default:
      return false;
  }
}

export async function tryHandleSearchViewsListWire(action: string): Promise<boolean> {
  switch (action) {
    case "load-more":
      if (usesSearchContextLoader()) await loadThreadsForSearchContext(true);
      else await loadMailView(true);
      render();
      return true;
    case "list-filter-all":
      void applyListFilter("all");
      return true;
    case "list-filter-unread":
      void applyListFilter("unread");
      return true;
    case "list-filter-starred":
      void applyListFilter("starred");
      return true;
    case "list-filter-focused":
      void applyListFilter("focused");
      return true;
    case "list-filter-auto":
      void applyListFilter("auto");
      return true;
    case "clear-mailbox-digest":
    case "dismiss-mailbox-digest":
      dismissMailboxDigestPanel();
      return true;
    default:
      return false;
  }
}
