// @ts-nocheck — DOM wiring; tighten types incrementally.
import {
  beginComposeWireSignal,
  wireComposeGlobalInputs,
} from "./wireEventsDomOrchestratorComposeRun";
import { wireEventsDomDomains } from "./wireEventsDomOrchestratorDomainRun";

export function wireEvents(): void {
  const composeSig = beginComposeWireSignal();
  wireComposeGlobalInputs();
  wireEventsDomDomains(composeSig);
}
