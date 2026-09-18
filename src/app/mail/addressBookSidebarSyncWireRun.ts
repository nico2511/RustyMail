import { invoke } from "@tauri-apps/api/core";
import { currentAccount } from "../core/accountContext";
import { render } from "../dispatch";
import { toast } from "../lib/toast";
import { isTauriRuntime } from "../lib/tauriRuntime";
import { tauriErrorMessage } from "../lib/tauriCommand";
import { loadAddressBookSidebarCount, refreshAddressBookList } from "./addressBookWireActions";

export async function tryHandleAddressBookSidebarSyncWire(action: string): Promise<boolean> {
  switch (action) {
    case "address-book-refresh":
      void refreshAddressBookList().then(() => render());
      return true;
    case "reindex-address-book": {
      void (async () => {
        const acc = currentAccount();
        if (!acc?.id || !isTauriRuntime()) {
          toast("Réindexation : compte ou Tauri requis.");
          return;
        }
        try {
          const res = await invoke<{ messagesProcessed: number }>("reindex_address_contacts_cmd", {
            accountId: acc.id,
          });
          toast(`Carnet réindexé (${res?.messagesProcessed ?? 0} messages traités).`);
          await refreshAddressBookList();
          await loadAddressBookSidebarCount();
          render();
        } catch (e) {
          toast(tauriErrorMessage(e));
        }
      })();
      return true;
    }
    default:
      return false;
  }
}
