import { invoke } from "@tauri-apps/api/core";
import { MAIL_ACTION_TIMEOUT_MS } from "../core/timeouts";
import { isTauriRuntime } from "../lib/tauriRuntime";
import { tauriErrorMessage, withTimeout } from "../lib/tauriCommand";
import { toast } from "../lib/toast";
import { render } from "../dispatch";
import { state } from "../state";
import { refreshLlmRuntimeStatus } from "./settingsLlmRuntime";

async function requireTauriForSecretSave(): Promise<boolean> {
  if (!isTauriRuntime()) {
    toast("Enregistrement : lancez l’app Tauri.");
    return false;
  }
  return true;
}

async function requireTauriForSecretClear(): Promise<boolean> {
  if (!isTauriRuntime()) {
    toast("Lancez l’app Tauri.");
    return false;
  }
  return true;
}

function refreshEnginesModalIfOpen(): void {
  void refreshLlmRuntimeStatus(false).then(() => {
    if (state.settingsAiModal === "engines") render();
  });
}

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
