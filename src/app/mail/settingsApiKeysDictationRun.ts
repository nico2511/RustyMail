import { invoke } from "@tauri-apps/api/core";
import { MAIL_ACTION_TIMEOUT_MS } from "../core/timeouts";
import { tauriErrorMessage, withTimeout } from "../lib/tauriCommand";
import { toast } from "../lib/toast";
import { render } from "../dispatch";
import { state } from "../state";
import { requireTauriForSecretClear, requireTauriForSecretSave } from "./settingsApiKeysPersistHelpersRun";

export async function saveDictationApiKeyFromDom(): Promise<void> {
  if (!(await requireTauriForSecretSave())) return;
  const inp = document.querySelector<HTMLInputElement>("#prefs-dictation-api-key");
  const secret = inp?.value?.trim() ?? "";
  if (!secret) {
    toast("Collez une clé API avant d’enregistrer.");
    return;
  }
  try {
    await withTimeout(invoke("set_dictation_api_key", { secret }), MAIL_ACTION_TIMEOUT_MS);
    state.dictationApiKeySet = true;
    if (inp) inp.value = "";
    toast("Clé API enregistrée dans le trousseau.");
  } catch (e) {
    toast(tauriErrorMessage(e));
  }
  render();
}

export async function clearDictationApiKey(): Promise<void> {
  if (!(await requireTauriForSecretClear())) return;
  try {
    await withTimeout(invoke("clear_dictation_api_key", {}), MAIL_ACTION_TIMEOUT_MS);
    state.dictationApiKeySet = false;
    toast("Clé API supprimée du trousseau.");
  } catch (e) {
    toast(tauriErrorMessage(e));
  }
  render();
}
