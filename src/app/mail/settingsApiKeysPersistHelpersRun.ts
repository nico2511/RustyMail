import { isTauriRuntime } from "../lib/tauriRuntime";
import { toast } from "../lib/toast";
import { render } from "../dispatch";
import { state } from "../state";
import { refreshLlmRuntimeStatus } from "./settingsLlmRuntime";

export async function requireTauriForSecretSave(): Promise<boolean> {
  if (!isTauriRuntime()) {
    toast.warning("Enregistrement : lancez l’app Tauri.");
    return false;
  }
  return true;
}

export async function requireTauriForSecretClear(): Promise<boolean> {
  if (!isTauriRuntime()) {
    toast.warning("Lancez l’app Tauri.");
    return false;
  }
  return true;
}

function aiSettingsVisible(): boolean {
  return state.settingsAiModal === "engines" || (state.view === "settings" && state.settingsTab === "ai");
}

export function refreshEnginesModalIfOpen(): void {
  void refreshLlmRuntimeStatus(false).then(() => {
    if (aiSettingsVisible()) render();
  });
}
