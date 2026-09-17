import type { MicActionOpts } from "../types";

export type AccountWireActionsDeps = {
  micAction: (opts?: MicActionOpts) => void | Promise<void>;
  saveAccount: () => void | Promise<void>;
  saveDraftToSavedListNow: (opts?: { silentToast?: boolean }) => Promise<boolean>;
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
  return accountWire().micAction(opts);
}

export function saveAccount(): void | Promise<void> {
  return accountWire().saveAccount();
}

export function saveDraftToSavedListNow(opts?: { silentToast?: boolean }): Promise<boolean> {
  return accountWire().saveDraftToSavedListNow(opts);
}

export function refreshSavedDraftsMailboxCount(): Promise<void> {
  return accountWire().refreshSavedDraftsMailboxCount();
}
