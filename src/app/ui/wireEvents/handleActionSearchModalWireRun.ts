import {
  commitSearchQuery,
  closeSearchModal,
  openSearchModal,
  searchNlAssist,
} from "./depsSearchMail";

export async function tryHandleSearchModalWire(action: string, element?: HTMLElement): Promise<boolean> {
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
