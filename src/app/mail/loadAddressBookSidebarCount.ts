import { invoke } from "@tauri-apps/api/core";
import { currentAccount } from "../core/accountContext";
import { isTauriRuntime } from "../lib/tauriRuntime";
import { state } from "../state";

export async function loadAddressBookSidebarCount(): Promise<void> {
  if (!isTauriRuntime()) {
    state.addressBookSidebarCount = null;
    return;
  }
  const acc = currentAccount();
  if (!acc?.id) {
    state.addressBookSidebarCount = null;
    return;
  }
  try {
    const n = await invoke<number>("count_address_contacts_scoped_cmd", { accountId: acc.id });
    state.addressBookSidebarCount = Math.max(0, Math.floor(Number(n)) || 0);
  } catch {
    state.addressBookSidebarCount = null;
  }
}
