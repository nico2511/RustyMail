import { clearDiscoveredServerSnap } from "./discoveredServerSnap";
import { state } from "../state";

export function clearAccountOAuthWizard(): void {
  state.accountOAuthWizardPhase = null;
  state.accountOAuthWizardMessage = "";
  state.accountOAuthWizardError = null;
  state.accountOAuthWizardRetry = null;
}

export function resetNewAccountSetupState(): void {
  clearAccountOAuthWizard();
  state.accountPasswordSetupExpanded = false;
  state.accountFormAuthKind = "password";
  state.oauthLockedEmail = null;
  state.accountFormOAuthPrefill = null;
  state.accountServersPanelOpen = false;
}

export function clearAccountSetupForSettingsNavigation(): void {
  clearDiscoveredServerSnap();
}
