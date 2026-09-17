/** UI refs and constants wired from application.ts before wireEvents() runs. */
export type WireEventsContext = {
  composeInteractionsAbortRef: { current?: AbortController };
  AI_PREFS_IMMEDIATE_CHECKBOX_IDS: Set<string>;
  skipAccountIdentityCaptureOnceRef: { current: boolean };
  addressBookEditEmailRef: { current: string | null };
  addressBookRowsCache: () => unknown[];
};

let wireEventsCtx: WireEventsContext | null = null;

export function registerWireEventsContext(deps: WireEventsContext): void {
  wireEventsCtx = deps;
}

export function wireEventsContext(): WireEventsContext {
  if (!wireEventsCtx) throw new Error("registerWireEventsContext not called");
  return wireEventsCtx;
}
