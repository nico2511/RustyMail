import { isTauriRuntime } from "../lib/tauriRuntime";
import { toast } from "../lib/toast";
import { render } from "../dispatch";
import { state } from "../state";
import { refreshLlmRuntimeStatus } from "./settingsLlmRuntime";

export async function requireTauriForSecretSave(): Promise<boolean> {
  if (!isTauriRuntime()) {
    toast("Enregistrement : lancez l’app Tauri.");
    return false;
  }
  return true;
}

export async function requireTauriForSecretClear(): Promise<boolean> {
  if (!isTauriRuntime()) {
    toast("Lancez l’app Tauri.");
    return false;
  }
  return true;
}

export function refreshEnginesModalIfOpen(): void {
  void refreshLlmRuntimeStatus(false).then(() => {
    if (state.settingsAiModal === "engines") render();
  });
}
