/** UI refs and constants wired at startup via appShellRender before wireEvents() runs. */
import type { AddressBookRow } from "../../types";

export type WireEventsContext = {
  composeInteractionsAbortRef: { current?: AbortController };
  AI_PREFS_IMMEDIATE_CHECKBOX_IDS: Set<string>;
  skipAccountIdentityCaptureOnceRef: { current: boolean };
  addressBookEditEmailRef: { current: string | null };
  addressBookRowsCache: () => AddressBookRow[];
};

let wireEventsCtx: WireEventsContext | null = null;

export function registerWireEventsContext(deps: WireEventsContext): void {
  wireEventsCtx = deps;
}

export function wireEventsContext(): WireEventsContext {
  if (!wireEventsCtx) throw new Error("registerWireEventsContext not called");
  return wireEventsCtx;
}
