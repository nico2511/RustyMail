import { accountFieldTouched } from "../../accountSetup";
import { clearDiscoveredServerSnap } from "../account/discoveredServerSnap";
import { render } from "../dispatch";
import { state } from "../state";
import { beginNavigation } from "./appNavigationStack";
import { clearThreadAiSummaryState } from "./threadAiSummaryState";

export function openSettingsView(): void {
  beginNavigation("settings", { resetStack: true });
  state.view = "settings";
  state.aiOpen = false;
  clearThreadAiSummaryState();
  state.settingsTab = "accounts";
  clearDiscoveredServerSnap();
  state.settingsSelectedAccountId =
    state.selectedAccountId && state.accounts.some((a) => a.id === state.selectedAccountId)
      ? state.selectedAccountId
      : (state.accounts[0]?.id ?? "new");
  accountFieldTouched.serverFields = false;
  state.accountServersPanelOpen = state.settingsSelectedAccountId !== "new";
  render();
}
