// @ts-nocheck — DOM wiring; tighten types incrementally.
/** Event wiring — DOM listeners; business logic via app/mail facades. */
import { wireAtAutocompleteFields } from "../mail/searchAtAutocompleteWire";
import { wireComposeRecipientChips } from "../mail/composeComposerBridge";
import { wireEventsContext } from "./wireEvents/wireEventsContext";
import { wireEventsDomSettingsAi } from "./wireEvents/wireEventsDomSettingsAiRun";
import { wireEventsDomContactsAgent } from "./wireEvents/wireEventsDomContactsAgentRun";
import { wireEventsDomInboxThread } from "./wireEvents/wireEventsDomInboxThreadRun";
import {
  wireEventsDomComposeSearchAccount,
  wireEventsDomThreadQaInput,
} from "./wireEvents/wireEventsDomComposeSearchAccountRun";

export function wireEvents() {
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

export { handleAction } from "./wireEvents/handleAction";
