import { render, state } from "./depsCore";
import {
  accountFieldTouched,
  clearAccountOAuthWizard,
  clearDiscoveredServerSnap,
  deleteSettingsAccount,
  discoverMailServersAction,
  finishOAuthNewAccountAfterLogin,
  resetNewAccountSetupState,
} from "./depsSettingsAccount";
import {
  connectOAuthGoogleDesktop,
  connectOAuthMicrosoftDesktop,
} from "../../mail/accountOAuthDesktopConnectRun";
import { setSkipAccountIdentityCaptureOnce } from "./depsContext";

export async function tryHandleAccountSetupWire(action: string, element?: HTMLElement): Promise<boolean> {
  switch (action) {
    case "settings-select-account": {
      const id = element?.dataset.accountId?.trim();
      if (!id) return true;
      setSkipAccountIdentityCaptureOnce(true);
      clearDiscoveredServerSnap();
      state.settingsSelectedAccountId = id;
      accountFieldTouched.serverFields = false;
      state.accountServersPanelOpen = true;
      state.oauthLockedEmail = null;
      state.accountFormOAuthPrefill = null;
      resetNewAccountSetupState();
      render();
      return true;
    }
    case "settings-new-account":
      setSkipAccountIdentityCaptureOnce(true);
      clearDiscoveredServerSnap();
      state.settingsSelectedAccountId = "new";
      accountFieldTouched.serverFields = false;
      resetNewAccountSetupState();
      render();
      return true;
    case "discover-mail-servers":
      void discoverMailServersAction();
      return true;
    case "account-toggle-servers":
      state.accountServersPanelOpen = !state.accountServersPanelOpen;
      render();
      return true;
    case "oauth-google-connect":
      void connectOAuthGoogleDesktop();
      return true;
    case "oauth-microsoft-connect":
      void connectOAuthMicrosoftDesktop();
      return true;
    case "account-auth-password-mode":
      clearAccountOAuthWizard();
      state.accountPasswordSetupExpanded = true;
      state.accountFormAuthKind = "password";
      state.oauthLockedEmail = null;
      state.accountFormOAuthPrefill = null;
      state.accountServersPanelOpen = false;
      render();
      return true;
    case "oauth-wizard-retry": {
      const retry = state.accountOAuthWizardRetry;
      if (!retry || (retry.authKind !== "oauthGoogle" && retry.authKind !== "oauthMicrosoft")) return true;
      clearAccountOAuthWizard();
      void finishOAuthNewAccountAfterLogin(retry.authKind, retry.email, retry.displayName);
      return true;
    }
    case "delete-settings-account":
      void deleteSettingsAccount();
      return true;
    default:
      return false;
  }
}
