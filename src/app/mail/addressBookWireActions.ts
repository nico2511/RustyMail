import { openContactDetailView as openContactDetailViewImpl } from "./contactsViewNavigation";
import { loadAddressBookSidebarCount as loadAddressBookSidebarCountImpl } from "./loadAddressBookSidebarCount";
import { refreshAddressBookList as refreshAddressBookListImpl } from "./addressBookListState";

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
  return refreshAddressBookListImpl();
}
