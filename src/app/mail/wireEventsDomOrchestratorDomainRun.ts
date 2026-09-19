// @ts-nocheck — DOM wiring; tighten types incrementally.
import { wireEventsDomSettingsAi } from "./wireEventsDomSettingsAiRun";
import { wireEventsDomContactsAgent } from "./wireEventsDomContactsAgentRun";
import { wireEventsDomInboxThread } from "./wireEventsDomInboxThreadRun";
import { wireEventsDomComposeSearchAccount } from "./wireEventsDomComposeSearchAccountRun";
import { wireEventsDomThreadQaInput } from "./wireEventsDomThreadQaRun";

export function wireEventsDomDomains(composeSig: AbortSignal): void {
  wireEventsDomThreadQaInput(composeSig);
  wireEventsDomSettingsAi(composeSig);
  wireEventsDomContactsAgent(composeSig);
  wireEventsDomInboxThread(composeSig);
  wireEventsDomComposeSearchAccount(composeSig);
}
