import { invoke } from "@tauri-apps/api/core";

import type { AppPrefs } from "../../prefs_defaults";
import { defaultAppPrefs, normalizeAiPrefsMerged } from "../../prefs_defaults";
import { BOOT_INVOKE_TIMEOUT_MS } from "../core/timeouts";
import { withTimeout } from "../lib/tauriCommand";
import { state } from "../state";
import { syncMailboxDigestPanelWithFeaturePref } from "./mailboxDigest";
import { setLocale } from "../../i18n";

export async function fetchAndApplyAppPrefsFromBackend(): Promise<void> {
  state.appPrefs = await withTimeout(invoke<AppPrefs>("get_app_prefs", {}), BOOT_INVOKE_TIMEOUT_MS);
  state.appPrefs.general = {
    ...defaultAppPrefs().general,
    ...state.appPrefs.general,
  };
  const prefAcc = (state.appPrefs.general.defaultAccountId ?? "").trim();
  if (prefAcc && !state.accounts.some((a) => a.id === prefAcc)) {
    delete state.appPrefs.general.defaultAccountId;
  }
  state.appPrefs.ai = normalizeAiPrefsMerged({
    ...defaultAppPrefs().ai,
    ...state.appPrefs.ai,
  });
  syncMailboxDigestPanelWithFeaturePref();
  setLocale(state.appPrefs.general.motherLanguage ?? "fr");
}

export async function loadBootApiKeyStatuses(): Promise<void> {
  state.dictationApiKeySet = await withTimeout(invoke<boolean>("dictation_api_key_status", {}), BOOT_INVOKE_TIMEOUT_MS);
  try {
    state.openrouterApiKeySet = await withTimeout(
      invoke<boolean>("openrouter_api_key_status", {}),
      BOOT_INVOKE_TIMEOUT_MS,
    );
  } catch {
    state.openrouterApiKeySet = false;
  }
  try {
    state.llamaServerApiKeySet = await withTimeout(
      invoke<boolean>("llama_server_api_key_status", {}),
      BOOT_INVOKE_TIMEOUT_MS,
    );
  } catch {
    state.llamaServerApiKeySet = false;
  }
  try {
    state.oauthGoogleConfigured = await withTimeout(
      invoke<boolean>("oauth_google_configured", {}),
      BOOT_INVOKE_TIMEOUT_MS,
    );
  } catch {
    state.oauthGoogleConfigured = false;
  }
  try {
    state.oauthMicrosoftConfigured = await withTimeout(
      invoke<boolean>("oauth_microsoft_configured", {}),
      BOOT_INVOKE_TIMEOUT_MS,
    );
  } catch {
    state.oauthMicrosoftConfigured = false;
  }
  try {
    state.semanticModelAvailable = await withTimeout(
      invoke<boolean>("semantic_model_available", {}),
      BOOT_INVOKE_TIMEOUT_MS,
    );
  } catch {
    state.semanticModelAvailable = false;
  }
}

export function applyBootPrefsLoadFailure(): void {
  state.appPrefs = defaultAppPrefs();
  state.dictationApiKeySet = false;
  state.openrouterApiKeySet = false;
  state.llamaServerApiKeySet = false;
}
