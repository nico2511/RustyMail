// @ts-nocheck — DOM wiring; tighten types incrementally.
import { wireAtAutocompleteFields } from "./searchAtAutocompleteWire";
import { wireComposeRecipientChips } from "./composeComposerBridge";
import { wireEventsContext } from "../ui/wireEvents/wireEventsContext";
import { wireEventsDomSettingsAi } from "../ui/wireEvents/wireEventsDomSettingsAiRun";
import { wireEventsDomContactsAgent } from "../ui/wireEvents/wireEventsDomContactsAgentRun";
import { wireEventsDomInboxThread } from "../ui/wireEvents/wireEventsDomInboxThreadRun";
import {
  wireEventsDomComposeSearchAccount,
  wireEventsDomThreadQaInput,
} from "../ui/wireEvents/wireEventsDomComposeSearchAccountRun";

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
