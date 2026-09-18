import { render } from "../dispatch";
import { applyListFilter, loadMailView, loadThreadsForSearchContext } from "./mailListView";
import { usesSearchContextLoader } from "./searchQueryContext";
import { dismissMailboxDigestPanel } from "./mailboxDigest";

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
