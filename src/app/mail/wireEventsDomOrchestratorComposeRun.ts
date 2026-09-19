// @ts-nocheck — DOM wiring; tighten types incrementally.
import { wireAtAutocompleteFields } from "./searchAtAutocompleteWire";
import { wireComposeRecipientChips } from "./composeComposerBridge";
import { wireEventsContext } from "./wireEventsContext";

/** Abort prior compose listeners and return a fresh signal for this render. */
export function beginComposeWireSignal(): AbortSignal {
  const composeAbortRef = wireEventsContext().composeInteractionsAbortRef;
  composeAbortRef.current?.abort();
  composeAbortRef.current = new AbortController();
  return composeAbortRef.current.signal;
}

export function wireComposeGlobalInputs(): void {
  wireComposeRecipientChips();
  wireAtAutocompleteFields();
}
