import { invoke } from "@tauri-apps/api/core";
import { MAIL_ACTION_TIMEOUT_MS } from "../core/timeouts";
import { tauriErrorMessage, withTimeout } from "../lib/tauriCommand";
import { toast } from "../lib/toast";
import { state } from "../state";
import {
  refreshEnginesModalIfOpen,
  requireTauriForSecretClear,
  requireTauriForSecretSave,
} from "./settingsApiKeysPersistHelpersRun";

export async function saveCloudApiKeysFromDom(): Promise<void> {
  if (!(await requireTauriForSecretSave())) return;
  const inp = document.querySelector<HTMLInputElement>("#prefs-cloud-api-key");
  const secret = inp?.value?.trim() ?? "";
  if (!secret) {
    toast("Collez une clé API avant d’enregistrer.");
    return;
  }
  try {
    await withTimeout(invoke("set_openrouter_api_key", { secret }), MAIL_ACTION_TIMEOUT_MS);
    await withTimeout(invoke("set_dictation_api_key", { secret }), MAIL_ACTION_TIMEOUT_MS);
    state.openrouterApiKeySet = true;
    state.dictationApiKeySet = true;
    if (inp) inp.value = "";
    toast("Clé cloud enregistrée (OpenRouter + dictée).");
    refreshEnginesModalIfOpen();
  } catch (e) {
    toast(tauriErrorMessage(e));
  }
}

export async function clearCloudApiKeys(): Promise<void> {
  if (!(await requireTauriForSecretClear())) return;
  try {
    await withTimeout(invoke("clear_openrouter_api_key", {}), MAIL_ACTION_TIMEOUT_MS);
    await withTimeout(invoke("clear_dictation_api_key", {}), MAIL_ACTION_TIMEOUT_MS);
    state.openrouterApiKeySet = false;
    state.dictationApiKeySet = false;
    toast("Clé cloud supprimée.");
    refreshEnginesModalIfOpen();
  } catch (e) {
    toast(tauriErrorMessage(e));
  }
}
