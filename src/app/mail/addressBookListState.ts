import { invoke } from "@tauri-apps/api/core";
import type { AddressBookRow } from "../types";
import { currentAccount } from "../core/accountContext";
import { isTauriRuntime } from "../lib/tauriRuntime";

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
    const res = await invoke<{ items: AddressBookRow[]; total: number }>("list_address_contacts_cmd", {
      accountId: acc.id,
      query: addressBookListQuery,
      offset: 0,
      limit: 80,
    });
    addressBookRowsCache = res?.items ?? [];
  } catch {
    addressBookRowsCache = [];
  }
}
