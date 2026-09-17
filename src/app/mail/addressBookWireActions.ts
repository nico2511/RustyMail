export type AddressBookWireActionsDeps = {
  openContactDetailView: (email: string, opts?: { skipHistory?: boolean }) => void | Promise<void>;
  loadAddressBookSidebarCount: () => Promise<void>;
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
): void | Promise<void> {
  return addressBook().openContactDetailView(email, opts);
}

export function loadAddressBookSidebarCount(): Promise<void> {
  return addressBook().loadAddressBookSidebarCount();
}

export function refreshAddressBookList(): Promise<void> {
  return addressBook().refreshAddressBookList();
}
