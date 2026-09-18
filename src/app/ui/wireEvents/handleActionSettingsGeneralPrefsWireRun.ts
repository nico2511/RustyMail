import {
  persistGeneralPrefsFromDom,
} from "../../mail/settingsGeneralPrefsPersistRun";
import {
  render,
  toast,
  tauriErrorMessage,
} from "./depsCore";
import {
  DEFAULT_ACCOUNT_PROMPT_DISMISS_KEY,
  persistDefaultAccountId,
  switchActiveAccount,
} from "./depsSettingsAccount";

export async function tryHandleSettingsGeneralPrefsWire(action: string, element?: HTMLElement): Promise<boolean> {
  switch (action) {
    case "save-default-account-prompt": {
      void (async () => {
        const sel = document.querySelector<HTMLSelectElement>("#default-account-prompt-select");
        const id = (sel?.value ?? "").trim();
        if (!id) {
          toast("Choisissez un compte.");
          return;
        }
        try {
          await persistDefaultAccountId(id);
          await switchActiveAccount(id);
          toast("Compte par défaut enregistré.");
          render();
        } catch (e) {
          toast(tauriErrorMessage(e));
        }
      })();
      return true;
    }
    case "dismiss-default-account-prompt": {
      try {
        window.localStorage.setItem(DEFAULT_ACCOUNT_PROMPT_DISMISS_KEY, "1");
      } catch {
        /* ignore */
      }
      render();
      return true;
    }
    case "save-general-prefs":
      void persistGeneralPrefsFromDom();
      return true;
    default:
      return false;
  }
}
