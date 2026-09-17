import { orgScanAccount } from "../../organizationView";
import { orgV2ScanAccount } from "../../organizationViewV2";
import { render } from "../dispatch";
import { currentAccount } from "../core/accountContext";
import { tauriErrorMessage } from "../lib/tauriCommand";
import { toast } from "../lib/toast";
import { state } from "../state";

export async function refreshOrganizationReport(): Promise<void> {
  if (state.view !== "organization") return;
  const acc = currentAccount();
  if (!acc?.id) return;
  state.organization.applyMessage = "Mise à jour des propositions…";
  render();
  try {
    const report = await orgScanAccount(acc.id, Boolean(state.appPrefs.ai.featureOrgProposalsEnabled));
    state.organization.report = report;
    state.organization.applyMessage = `${report.proposals.length} proposition(s) à jour.`;
    const llmMsg = report.llmStatus?.message?.trim();
    if (llmMsg) toast(llmMsg);
  } catch (e) {
    toast(tauriErrorMessage(e));
  } finally {
    if (state.view === "organization") render();
  }
}

export async function refreshOrganizationV2Report(): Promise<void> {
  if (state.view !== "organizationV2") return;
  const acc = currentAccount();
  if (!acc?.id) return;
  state.organizationV2.applyMessage = "Mise à jour…";
  render();
  try {
    const report = await orgV2ScanAccount(acc.id);
    state.organizationV2.report = report;
    state.organizationV2.applyMessage = `${report.proposals.length} action(s) en file.`;
  } catch (e) {
    toast(tauriErrorMessage(e));
  } finally {
    if (state.view === "organizationV2") render();
  }
}
