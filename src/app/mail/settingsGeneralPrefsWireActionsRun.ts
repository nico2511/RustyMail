import { DEFAULT_ACCOUNT_PROMPT_DISMISS_KEY } from "../lib/appUiConstants";
import { render } from "../dispatch";
import { toast } from "../lib/toast";
import { tauriErrorMessage } from "../lib/tauriCommand";
import { persistGeneralPrefsFromDom } from "./settingsGeneralPrefsPersistRun";
import { persistDefaultAccountId, switchActiveAccount } from "./settingsWireActions";

export async function tryHandleSettingsGeneralPrefsWire(action: string, _element?: HTMLElement): Promise<boolean> {
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
