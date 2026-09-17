import type { MicActionOpts } from "../types";
import { saveDraftToSavedListNow as saveDraftToSavedListNowImpl } from "./composeDraftLocalSave";
import { micAction as micActionImpl } from "./composeMicDictation";

export type AccountWireActionsDeps = {
  saveAccount: () => void | Promise<void>;
  refreshSavedDraftsMailboxCount: () => Promise<void>;
};

let accountWireActionsDeps: AccountWireActionsDeps | null = null;

export function registerAccountWireActionsDeps(deps: AccountWireActionsDeps): void {
  accountWireActionsDeps = deps;
}

function accountWire(): AccountWireActionsDeps {
  if (!accountWireActionsDeps) throw new Error("registerAccountWireActionsDeps not called");
  return accountWireActionsDeps;
}

export function micAction(opts?: MicActionOpts): void | Promise<void> {
  return micActionImpl(opts);
}

export function saveAccount(): void | Promise<void> {
  return accountWire().saveAccount();
}

export function saveDraftToSavedListNow(opts?: { silentToast?: boolean }): Promise<boolean> {
  return saveDraftToSavedListNowImpl(opts);
}

export function refreshSavedDraftsMailboxCount(): Promise<void> {
  return accountWire().refreshSavedDraftsMailboxCount();
}
