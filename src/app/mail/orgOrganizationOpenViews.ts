import { orgV2ScanAccount } from "../../organizationViewV2";
import { render } from "../dispatch";
import { currentAccount } from "../core/accountContext";
import { tauriErrorMessage } from "../lib/tauriCommand";
import { toast } from "../lib/toast";
import { state } from "../state";
import { beginNavigation } from "./appNavigationStack";
import { loadNewsletterRules } from "./newsletterRulesLoad";

export async function openOrganizationView(): Promise<void> {
  const acc = currentAccount();
  if (!acc?.id) {
    toast("Configurez un compte pour organiser la boîte.");
    return;
  }
  await loadNewsletterRules();
  beginNavigation("organization", { resetStack: true });
  state.view = "organization";
  state.mailboxDigestPanelOpen = false;
  state.aiOpen = false;
  render();
}

export async function openOrganizationV2View(): Promise<void> {
  const acc = currentAccount();
  if (!acc?.id) {
    toast("Configurez un compte pour organiser la boîte.");
    return;
  }
  beginNavigation("organizationV2", { resetStack: true });
  state.view = "organizationV2";
  state.mailboxDigestPanelOpen = false;
  state.aiOpen = false;
  render();
  state.organizationV2.scanning = true;
  render();
  try {
    const report = await orgV2ScanAccount(acc.id);
    state.organizationV2.report = report;
    state.organizationV2.applyMessage = `${report.proposals.length} action(s).`;
  } catch (e) {
    toast(tauriErrorMessage(e));
  } finally {
    state.organizationV2.scanning = false;
    if (state.view === "organizationV2") render();
  }
}
