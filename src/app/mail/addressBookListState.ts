import { invoke } from "@tauri-apps/api/core";
import { contactRowFromItem, type AddressContactListRow, type AddressContactRow } from "../../contactsView";
import type { AddressBookRow } from "../types";
import { currentAccount } from "../core/accountContext";
import { isTauriRuntime } from "../lib/tauriRuntime";
import { state } from "../state";

let addressBookListQuery = "";
let addressBookRowsCache: AddressBookRow[] = [];

export function getAddressBookListQuery(): string {
  return addressBookListQuery;
}

export function setAddressBookListQuery(query: string): void {
  addressBookListQuery = query;
}

export function getAddressBookRowsCache(): AddressBookRow[] {
  return addressBookRowsCache;
}

export async function refreshAddressBookList(): Promise<void> {
  const acc = currentAccount();
  if (!acc?.id || !isTauriRuntime()) {
    addressBookRowsCache = [];
    return;
  }
  try {
    const res = await invoke<{
      items: Array<AddressContactListRow & Partial<AddressContactRow>>;
      total: number;
    }>("list_address_contacts_scoped_cmd", {
      accountId: acc.id,
      query: addressBookListQuery,
      offset: 0,
      limit: 80,
      globalScope: Boolean(state.appPrefs.general.addressBookGlobalScope),
    });
    addressBookRowsCache = (res?.items ?? []).map((item) => contactRowFromItem(item));
  } catch {
    addressBookRowsCache = [];
  }
}
