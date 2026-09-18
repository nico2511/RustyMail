import { render } from "../dispatch";
import { state } from "../state";
import {
  acceptSuggestedSavedView,
  applySavedSearchView,
  deleteSavedSearchView,
  dismissSuggestedSavedView,
  markActiveSavedSearchSeen,
  saveCurrentSearchView,
} from "./savedSearchViews";
import {
  bulkArchiveSearchViewThreads,
  bulkMarkReadSearchViewThreads,
  runFluxAffinerFromSearchView,
} from "./searchViewBatch";
import { openOrganizationV2View } from "./orgFolderWireActions";
import { clearSearchAndReloadInbox } from "./searchCommitQuery";

export async function tryHandleSearchViewsSavedWire(action: string, element?: HTMLElement): Promise<boolean> {
  switch (action) {
    case "save-saved-search":
      void saveCurrentSearchView();
      return true;
    case "clear-search-exit":
      void clearSearchAndReloadInbox();
      return true;
    case "apply-saved-search": {
      const sid = element?.dataset.savedSearchId?.trim();
      if (sid) void applySavedSearchView(sid);
      return true;
    }
    case "delete-saved-search": {
      const sid = element?.dataset.savedSearchId?.trim();
      if (sid) void deleteSavedSearchView(sid);
      return true;
    }
    case "search-view-mark-read":
      void bulkMarkReadSearchViewThreads();
      return true;
    case "search-view-archive":
      void bulkArchiveSearchViewThreads();
      return true;
    case "search-view-open-organizer":
      void openOrganizationV2View();
      return true;
    case "search-view-affiner":
      void runFluxAffinerFromSearchView();
      return true;
    case "accept-view-suggestion": {
      const email = element?.dataset.senderEmail?.trim();
      if (email) void acceptSuggestedSavedView(email);
      return true;
    }
    case "dismiss-view-suggestion": {
      const email = element?.dataset.senderEmail?.trim();
      if (email) void dismissSuggestedSavedView(email, "dismiss");
      return true;
    }
    case "snooze-view-suggestion": {
      const email = element?.dataset.senderEmail?.trim();
      if (email) void dismissSuggestedSavedView(email, "snooze");
      return true;
    }
    case "saved-search-mark-seen":
      void markActiveSavedSearchSeen({ toast: true });
      return true;
    default:
      return false;
  }
}
