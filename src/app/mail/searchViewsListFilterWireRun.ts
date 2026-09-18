import { render } from "../dispatch";
import { applyListFilter, loadMailView, loadThreadsForSearchContext } from "./mailListView";
import { usesSearchContextLoader } from "./searchQueryContext";

export async function tryHandleSearchViewsListLoadWire(action: string): Promise<boolean> {
  if (action !== "load-more") return false;
  if (usesSearchContextLoader()) await loadThreadsForSearchContext(true);
  else await loadMailView(true);
  render();
  return true;
}

export async function tryHandleSearchViewsListFilterWire(action: string): Promise<boolean> {
  switch (action) {
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
    default:
      return false;
  }
}
