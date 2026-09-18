import { navCanGoBack } from "../../navigation";
import { goBack, navigateToInbox } from "./appNavActions";
import { currentAccount } from "../core/accountContext";
import { render } from "../dispatch";
import { state } from "../state";
import { loadContactsList } from "../../contactsView";
import { loadAddressBookSidebarCount, openContactDetailView } from "./addressBookWireActions";
import { openThread } from "./openThreadView";

export async function tryHandleContactsListWire(action: string, element?: HTMLElement): Promise<boolean> {
  switch (action) {
    case "contacts-back-list":
      if (navCanGoBack()) void goBack();
      else {
        state.view = "contacts";
        state.selectedContactEmail = undefined;
        render();
      }
      return true;
    case "contacts-back-inbox":
      navigateToInbox();
      return true;
    case "contacts-refresh-list": {
      const acc = currentAccount();
      if (acc?.id) {
        void loadContactsList(acc.id, { reset: true })
          .then(() => loadAddressBookSidebarCount())
          .then(() => render());
      }
      return true;
    }
    case "contacts-load-more": {
      const acc = currentAccount();
      if (acc?.id) void loadContactsList(acc.id).then(() => render());
      return true;
    }
    case "contacts-open-detail": {
      const email = element?.dataset.email?.trim();
      if (email) void openContactDetailView(email);
      return true;
    }
    case "contacts-open-thread": {
      const tid = element?.dataset.threadId?.trim();
      if (tid) void openThread(tid);
      return true;
    }
    default:
      return false;
  }
}
