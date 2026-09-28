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
  if (mode !== "off" && mode !== "local" && mode !== "cloud" && mode !== "hybrid" && mode !== "ollama") return true;
  state.aiEngineSettingsTab = mode;
  applyEngineConnectionMode(state.appPrefs.ai, mode);
  syncLlmEnginePrefsToDom(state.appPrefs.ai);
  render();
  document.querySelector<HTMLElement>(".settings-body")?.scrollTo({ top: 0 });
  void (async () => {
    try {
      await withTimeout(invoke("set_app_prefs", { prefs: state.appPrefs }), MAIL_ACTION_TIMEOUT_MS);
    } catch (e) {
      toast(tauriErrorMessage(e));
      return;
    }
    toast(
      mode === "off"
        ? "IA désactivée."
        : mode === "local"
          ? "Mode llama-server."
          : mode === "cloud"
            ? "Mode OpenRouter."
            : mode === "ollama"
              ? "Mode Ollama."
              : "Mode hybride.",
    );
    await refreshLlmRuntimeStatus(false);
    render();
  })();
  return true;
}
