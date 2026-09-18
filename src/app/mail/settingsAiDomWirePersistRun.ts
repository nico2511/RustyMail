import { invoke } from "@tauri-apps/api/core";
import { MAIL_ACTION_TIMEOUT_MS } from "../core/timeouts";
import { isTauriRuntime } from "../lib/tauriRuntime";
import { tauriErrorMessage, withTimeout } from "../lib/tauriCommand";
import { toast } from "../lib/toast";
import { state } from "../state";

export function persistAiPrefsImmediateFromDom(): void {
  if (!isTauriRuntime()) return;
  void (async () => {
    try {
      await withTimeout(invoke("set_app_prefs", { prefs: state.appPrefs }), MAIL_ACTION_TIMEOUT_MS);
      toast("Réglage IA enregistré.");
    } catch (e) {
      toast(tauriErrorMessage(e));
    }
  })();
}
