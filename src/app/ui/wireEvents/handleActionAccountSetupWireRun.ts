import {
  render,
  state,
  toast,
  invoke,
  isTauriRuntime,
  OAUTH_DESKTOP_LOGIN_TIMEOUT_MS,
  withTimeout,
  tauriErrorMessage,
  setSkipAccountIdentityCaptureOnce,
} from "./depsCore";
import type {
  OAuthDesktopLoginOutcome,
} from "./depsCore";
import {
  accountFieldTouched,
  clearDiscoveredServerSnap,
  resetNewAccountSetupState,
  clearAccountOAuthWizard,
  discoverMailServersAction,
  warnOAuthEphemeralRedirect,
  finishOAuthNewAccountAfterLogin,
  deleteSettingsAccount,
} from "./depsSettingsAccount";

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
    case "oauth-google-connect": {
      void (async () => {
        if (!isTauriRuntime()) {
          toast("OAuth2 : lancez l’application bureau Tauri.");
          return;
        }
        try {
          const o = await withTimeout(
            invoke<OAuthDesktopLoginOutcome>("oauth_google_desktop_login_cmd", {}),
            OAUTH_DESKTOP_LOGIN_TIMEOUT_MS,
          );
          warnOAuthEphemeralRedirect(o);
          const email = (o.email ?? "").trim();
          if (!email.includes("@")) {
            toast("OAuth Google : adresse e-mail absente ou invalide.");
            return;
          }
          setSkipAccountIdentityCaptureOnce(true);
          await finishOAuthNewAccountAfterLogin("oauthGoogle", email, (o.displayName ?? "").trim());
        } catch (e) {
          toast(tauriErrorMessage(e));
        }
      })();
      return true;
    }
    case "oauth-microsoft-connect": {
      void (async () => {
        if (!isTauriRuntime()) {
          toast("OAuth2 : lancez l’application bureau Tauri.");
          return;
        }
        try {
          const o = await withTimeout(
            invoke<OAuthDesktopLoginOutcome>("oauth_microsoft_desktop_login_cmd", {}),
            OAUTH_DESKTOP_LOGIN_TIMEOUT_MS,
          );
          warnOAuthEphemeralRedirect(o);
          const email = (o.email ?? "").trim();
          if (!email.includes("@")) {
            toast("OAuth Microsoft : adresse e-mail absente ou invalide.");
            return;
          }
          setSkipAccountIdentityCaptureOnce(true);
          await finishOAuthNewAccountAfterLogin("oauthMicrosoft", email, (o.displayName ?? "").trim());
        } catch (e) {
          toast(tauriErrorMessage(e));
        }
      })();
      return true;
    }
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
