import { DEFAULT_ACCOUNT_PROMPT_DISMISS_KEY } from "../lib/appUiConstants";
import { render } from "../dispatch";
import { toast } from "../lib/toast";
import { tauriErrorMessage } from "../lib/tauriCommand";
import { state } from "../state";
import { persistGeneralPrefsFromDom } from "./settingsGeneralPrefsPersistRun";
import { persistDefaultAccountId, switchActiveAccount } from "./settingsWireActions";
import {
  checkForDesktopUpdate,
  installDesktopUpdate,
  relaunchDesktopApp,
} from "./desktopUpdate";
import { openStatusBarModelSwitch } from "./statusBarModelSwitch";

export async function tryHandleSettingsGeneralPrefsWire(action: string, element?: HTMLElement): Promise<boolean> {
  switch (action) {
    case "save-default-account-prompt": {
      void (async () => {
        const sel = document.querySelector<HTMLSelectElement>("#default-account-prompt-select");
        const id = (sel?.value ?? "").trim();
        if (!id) {
          toast.warning("Choisissez un compte.");
          return;
        }
        try {
          await persistDefaultAccountId(id);
          await switchActiveAccount(id);
          toast.success("Compte par défaut enregistré.");
          render();
        } catch (e) {
          toast.error(tauriErrorMessage(e));
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
    case "desktop-update-open":
      state.view = "settings";
      state.settingsTab = "general";
      render();
      return true;
    case "desktop-update-check":
      void checkForDesktopUpdate();
      return true;
    case "desktop-update-install":
      void installDesktopUpdate();
      return true;
    case "desktop-update-relaunch":
      void relaunchDesktopApp().catch((error) => toast.error(tauriErrorMessage(error)));
      return true;
    case "status-bar-model-open":
      void openStatusBarModelSwitch(element);
      return true;
    default:
      return false;
  }
}
