import { tryHandleContactsAddressBookWire } from "./contactsWireActionsAddressBookRun";
import { tryHandleContactsDetailWire } from "./contactsWireActionsDetailRun";
import { tryHandleContactsListWire } from "./contactsWireActionsListRun";

export async function tryHandleContactsWire(action: string, element?: HTMLElement): Promise<boolean> {
  if (await tryHandleContactsListWire(action, element)) return true;
  if (await tryHandleContactsDetailWire(action, element)) return true;
  return tryHandleContactsAddressBookWire(action);
}
