// @ts-nocheck — DOM wiring; tighten types incrementally.
import { wireAtAutocompleteFields } from "./searchAtAutocompleteWire";
import { wireComposeRecipientChips } from "./composeComposerBridge";
import { wireEventsContext } from "./wireEventsContext";
import { wireEventsDomSettingsAi } from "./wireEventsDomSettingsAiRun";
import { wireEventsDomContactsAgent } from "./wireEventsDomContactsAgentRun";
import { wireEventsDomInboxThread } from "./wireEventsDomInboxThreadRun";
import {
  wireEventsDomComposeSearchAccount,
  wireEventsDomThreadQaInput,
} from "./wireEventsDomComposeSearchAccountRun";

export function wireEvents(): void {
  const composeAbortRef = wireEventsContext().composeInteractionsAbortRef;
  composeAbortRef.current?.abort();
  composeAbortRef.current = new AbortController();
  const composeSig = composeAbortRef.current.signal;
  wireComposeRecipientChips();
  wireAtAutocompleteFields();

  wireEventsDomThreadQaInput(composeSig);
  wireEventsDomSettingsAi(composeSig);
  wireEventsDomContactsAgent(composeSig);
  wireEventsDomInboxThread(composeSig);
  wireEventsDomComposeSearchAccount(composeSig);
}
