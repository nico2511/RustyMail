import { invoke } from "@tauri-apps/api/core";
import { MAIL_ACTION_TIMEOUT_MS } from "../core/timeouts";
import { tauriErrorMessage, withTimeout } from "../lib/tauriCommand";
import { toast } from "../lib/toast";
import { render } from "../dispatch";
import { state } from "../state";
import { refreshLlmRuntimeStatus } from "./settingsLlmRuntime";
import { requireTauriForSecretClear, requireTauriForSecretSave } from "./settingsApiKeysPersistHelpersRun";

export async function saveLlamaServerApiKeyFromDom(): Promise<void> {
  if (!(await requireTauriForSecretSave())) return;
  const inp = document.querySelector<HTMLInputElement>("#prefs-llama-server-api-key");
  const secret = inp?.value?.trim() ?? "";
  if (!secret) {
    toast("Collez une clé Bearer avant d’enregistrer (ou laissez vide et utilisez « Supprimer »).");
    return;
  }
  try {
    await withTimeout(invoke("set_llama_server_api_key", { secret }), MAIL_ACTION_TIMEOUT_MS);
    state.llamaServerApiKeySet = true;
    if (inp) inp.value = "";
    toast("Clé llama-server enregistrée dans le trousseau.");
    void refreshLlmRuntimeStatus(false).then(() => render());
  } catch (e) {
    toast(tauriErrorMessage(e));
  }
  render();
}

export async function clearLlamaServerApiKey(): Promise<void> {
  if (!(await requireTauriForSecretClear())) return;
  try {
    await withTimeout(invoke("clear_llama_server_api_key", {}), MAIL_ACTION_TIMEOUT_MS);
    state.llamaServerApiKeySet = false;
    toast("Clé llama-server supprimée du trousseau.");
    void refreshLlmRuntimeStatus(false).then(() => render());
  } catch (e) {
    toast(tauriErrorMessage(e));
  }
  render();
}
