// @ts-nocheck — DOM wiring; tighten types incrementally.
import { invoke } from "@tauri-apps/api/core";
import { MAIL_ACTION_TIMEOUT_MS } from "../core/timeouts";
import { isTauriRuntime } from "../lib/tauriRuntime";
import { tauriErrorMessage, withTimeout } from "../lib/tauriCommand";
import { toast } from "../lib/toast";
import { render } from "../dispatch";
import { state } from "../state";
import { refreshLlmRuntimeStatus } from "./settingsWireActions";

function persistLlamaServerPrefAndRefresh(
  applyPref: () => void,
  successToast: string,
): void {
  applyPref();
  if (!isTauriRuntime()) return;
  void (async () => {
    try {
      await withTimeout(invoke("set_app_prefs", { prefs: state.appPrefs }), MAIL_ACTION_TIMEOUT_MS);
      toast(successToast);
      void refreshLlmRuntimeStatus(false).then(() => {
        if (state.settingsAiModal === "engines") render();
      });
    } catch (e) {
      toast(tauriErrorMessage(e));
    }
  })();
}

export function wireSettingsAiDomLlamaServerListeners(signal: AbortSignal): void {
  document
    .querySelector<HTMLInputElement>("#prefs-llama-server-cpu-override")
    ?.addEventListener(
      "change",
      (ev) => {
        const next = Boolean((ev.currentTarget as HTMLInputElement | null)?.checked);
        persistLlamaServerPrefAndRefresh(
          () => {
            state.appPrefs.ai.llamaServerAllowCpuOverride = next;
          },
          next ? "Override CPU autorisé (llama-server)." : "Override CPU désactivé.",
        );
      },
      { signal },
    );

  document
    .querySelector<HTMLInputElement>("#prefs-llama-server-spawn-enabled")
    ?.addEventListener(
      "change",
      (ev) => {
        const next = Boolean((ev.currentTarget as HTMLInputElement | null)?.checked);
        persistLlamaServerPrefAndRefresh(
          () => {
            state.appPrefs.ai.llamaServerSpawnEnabled = next;
          },
          next ? "Lancement llama-server par l’app activé." : "Lancement llama-server par l’app désactivé.",
        );
      },
      { signal },
    );
}
