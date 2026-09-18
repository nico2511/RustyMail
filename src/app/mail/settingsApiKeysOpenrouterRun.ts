import { invoke } from "@tauri-apps/api/core";
import { MAIL_ACTION_TIMEOUT_MS } from "../core/timeouts";
import { tauriErrorMessage, withTimeout } from "../lib/tauriCommand";
import { toast } from "../lib/toast";
import { render } from "../dispatch";
import { state } from "../state";
import { refreshLlmRuntimeStatus } from "./settingsLlmRuntime";
import { requireTauriForSecretClear, requireTauriForSecretSave } from "./settingsApiKeysPersistHelpersRun";

export async function saveOpenrouterApiKeyFromDom(): Promise<void> {
  if (!(await requireTauriForSecretSave())) return;
  const inp = document.querySelector<HTMLInputElement>("#prefs-openrouter-api-key");
  const secret = inp?.value?.trim() ?? "";
  if (!secret) {
    toast("Collez une clé OpenRouter avant d’enregistrer.");
    return;
  }
  try {
    await withTimeout(invoke("set_openrouter_api_key", { secret }), MAIL_ACTION_TIMEOUT_MS);
    state.openrouterApiKeySet = true;
    if (inp) inp.value = "";
    toast("Clé OpenRouter enregistrée dans le trousseau.");
    void refreshLlmRuntimeStatus(false).then(() => render());
  } catch (e) {
    toast(tauriErrorMessage(e));
  }
  render();
}

export async function clearOpenrouterApiKey(): Promise<void> {
  if (!(await requireTauriForSecretClear())) return;
  try {
    await withTimeout(invoke("clear_openrouter_api_key", {}), MAIL_ACTION_TIMEOUT_MS);
    state.openrouterApiKeySet = false;
    toast("Clé OpenRouter supprimée du trousseau.");
    void refreshLlmRuntimeStatus(false).then(() => render());
  } catch (e) {
    toast(tauriErrorMessage(e));
  }
  render();
}
