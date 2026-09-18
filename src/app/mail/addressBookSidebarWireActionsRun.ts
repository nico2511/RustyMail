import { tryHandleAddressBookSidebarCrudWire } from "./addressBookSidebarCrudWireRun";
import { tryHandleAddressBookSidebarSyncWire } from "./addressBookSidebarSyncWireRun";

export async function tryHandleAddressBookSidebarWire(action: string, element?: HTMLElement): Promise<boolean> {
  if (await tryHandleAddressBookSidebarSyncWire(action)) return true;
  if (await tryHandleAddressBookSidebarCrudWire(action, element)) return true;
  return false;
}
