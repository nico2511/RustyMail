import { invoke } from "@tauri-apps/api/core";
import { currentAccount } from "../core/accountContext";
import { toast } from "../lib/toast";
import { tauriErrorMessage } from "../lib/tauriCommand";
import { refreshAddressBookList } from "./addressBookWireActions";

export async function tryHandleContactsAddressBookWire(action: string): Promise<boolean> {
  switch (action) {
    case "address-book-export-vcard": {
      const acc = currentAccount();
      if (!acc?.id) {
        toast("Sélectionnez un compte.");
        return true;
      }
      void (async () => {
        try {
          const path = await invoke<string>("export_address_contacts_vcard_cmd", {
            accountId: acc.id,
          });
          toast(`Carnet exporté : ${path}`);
        } catch (e) {
          const msg = tauriErrorMessage(e);
          if (!msg.toLowerCase().includes("annul")) toast(msg);
        }
      })();
      return true;
    }
    case "address-book-import-vcard": {
      const acc = currentAccount();
      if (!acc?.id) {
        toast("Sélectionnez un compte.");
        return true;
      }
      void (async () => {
        try {
          const res = await invoke<{ imported: number; skippedDuplicates: number; errors: string[] }>(
            "import_address_contacts_vcard_cmd",
            { payload: { accountId: acc.id, merge: true } }
          );
          await refreshAddressBookList();
          const errN = res.errors?.length ?? 0;
          toast(
            `Import : ${res.imported} contact(s), ${res.skippedDuplicates} ignoré(s)${errN ? `, ${errN} erreur(s)` : ""}.`
          );
        } catch (e) {
          const msg = tauriErrorMessage(e);
          if (!msg.toLowerCase().includes("annul")) toast(msg);
        }
      })();
      return true;
    }
    default:
      return false;
  }
}
