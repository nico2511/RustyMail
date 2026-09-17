/** Wire-events context mutators (domain deps barrel). */
import { wireEventsContext } from "./wireEventsContext";
import type { AddressBookRow } from "../../types";

export function setSkipAccountIdentityCaptureOnce(value: boolean): void {
  wireEventsContext().skipAccountIdentityCaptureOnceRef.current = value;
}

export function setAddressBookEditEmail(value: string | null): void {
  wireEventsContext().addressBookEditEmailRef.current = value;
}

export function addressBookRowsCache(): AddressBookRow[] {
  return wireEventsContext().addressBookRowsCache();
}
