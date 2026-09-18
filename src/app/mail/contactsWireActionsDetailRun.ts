import { handleContactsComposeFromDetail } from "./contactsDetailComposeWireRun";
import {
  handleContactsLlmProfile,
  handleContactsSearchDomain,
  handleContactsToggleFavorite,
} from "./contactsDetailProfileWireRun";
import { handleContactsSearchFromDetail, isContactsSearchWireAction } from "./contactsDetailSearchWireRun";

export async function tryHandleContactsDetailWire(action: string, element?: HTMLElement): Promise<boolean> {
  switch (action) {
    case "contacts-compose":
      handleContactsComposeFromDetail();
      return true;
    case "contacts-toggle-fav":
      void handleContactsToggleFavorite(element);
      return true;
    case "contacts-llm-profile":
      void handleContactsLlmProfile(element);
      return true;
    case "contacts-search-domain":
      handleContactsSearchDomain(element);
      return true;
    default:
      if (isContactsSearchWireAction(action)) {
        handleContactsSearchFromDetail(action);
        return true;
      }
      return false;
  }
}
