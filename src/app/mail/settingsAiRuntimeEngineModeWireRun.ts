import { invoke } from "@tauri-apps/api/core";
import { applyEngineConnectionMode } from "../../settingsAiPanel";
import { syncLlmEnginePrefsToDom } from "../../aiPrefsPersist";
import { MAIL_ACTION_TIMEOUT_MS } from "../core/timeouts";
import { render } from "../dispatch";
import { state } from "../state";
import { toast } from "../lib/toast";
import { tauriErrorMessage, withTimeout } from "../lib/tauriCommand";
import { refreshLlmRuntimeStatus } from "./settingsWireActions";

export async function tryHandleSettingsAiRuntimeEngineModeWire(
  action: string,
  element?: HTMLElement,
): Promise<boolean> {
  if (action !== "ai-engine-mode") return false;
  const mode = element?.dataset.engineMode?.trim();
  if (mode !== "local" && mode !== "cloud" && mode !== "hybrid") return true;
  state.aiEngineSettingsTab = mode;
  if (mode === "local") {
    applyEngineConnectionMode(state.appPrefs.ai, "local");
  } else if (mode === "hybrid") {
    applyEngineConnectionMode(state.appPrefs.ai, "hybrid");
  }
  syncLlmEnginePrefsToDom(state.appPrefs.ai);
  render();
  void (async () => {
    if (mode === "local" || mode === "hybrid") {
      try {
        await withTimeout(invoke("set_app_prefs", { prefs: state.appPrefs }), MAIL_ACTION_TIMEOUT_MS);
      } catch (e) {
        toast(tauriErrorMessage(e));
        return;
      }
    }
    toast(
      mode === "local" ? "Mode Sur mon PC." : mode === "cloud" ? "Mode Cloud." : "Mode Hybride enregistré.",
    );
    await refreshLlmRuntimeStatus(false);
    render();
  })();
  return true;
}
