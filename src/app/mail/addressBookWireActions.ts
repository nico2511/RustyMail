import { openContactDetailView as openContactDetailViewImpl } from "./contactsViewNavigation";
import { loadAddressBookSidebarCount as loadAddressBookSidebarCountImpl } from "./loadAddressBookSidebarCount";

export type AddressBookWireActionsDeps = {
  refreshAddressBookList: () => Promise<void>;
};

let addressBookWireActionsDeps: AddressBookWireActionsDeps | null = null;

export function registerAddressBookWireActionsDeps(deps: AddressBookWireActionsDeps): void {
  addressBookWireActionsDeps = deps;
}

function addressBook(): AddressBookWireActionsDeps {
  if (!addressBookWireActionsDeps) throw new Error("registerAddressBookWireActionsDeps not called");
  return addressBookWireActionsDeps;
}

export function openContactDetailView(
  email: string,
  opts?: { skipHistory?: boolean },
): Promise<void> {
  return openContactDetailViewImpl(email, opts);
}

export function loadAddressBookSidebarCount(): Promise<void> {
  return loadAddressBookSidebarCountImpl();
}

export function refreshAddressBookList(): Promise<void> {
  return addressBook().refreshAddressBookList();
}
