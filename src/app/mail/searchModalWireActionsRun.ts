import { commitSearchQuery } from "./searchCommitQuery";
import { closeSearchModal, openSearchModal } from "./searchBarUi";
import { searchNlAssist } from "./searchNlAssistRun";

export async function tryHandleSearchModalWire(action: string, _element?: HTMLElement): Promise<boolean> {
  switch (action) {
    case "open-search-modal":
      openSearchModal();
      return true;
    case "close-search-modal":
      closeSearchModal();
      return true;
    case "search-modal-commit":
      commitSearchQuery({ fromModal: true });
      return true;
    case "search-nl-assist":
      void searchNlAssist();
      return true;
    default:
      return false;
  }
}
