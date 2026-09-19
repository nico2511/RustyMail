import { invoke } from "@tauri-apps/api/core";

import { applyAppearanceFromPrefs } from "../../appearance";
import { setLocale } from "../../i18n";
import { BOOT_INVOKE_TIMEOUT_MS } from "../core/timeouts";
import { safeInvoke, tauriErrorMessage, withTimeout } from "../lib/tauriCommand";
import { render } from "../dispatch";
import { state } from "../state";
import type { AppPathsView, AppStatus } from "../types";
import { bindDraftPersistenceFlush, bindKeyboard, bindMouseNavigation } from "./appShellBindings";
import {
  fallbackCapabilities,
  fallbackStatus,
  normalizeCapabilities,
} from "./appRuntimeFallbacks";
import { bindMicPushToTalk } from "./composeMicDictation";
import { bindTauriNativeFileDropAsync } from "./composeTauriNativeFileDrop";

export async function bootInitShellAndRuntime(): Promise<void> {
  setLocale(state.appPrefs.general.motherLanguage ?? "fr");
  applyAppearanceFromPrefs(state.appPrefs.general);
  render();
  bindKeyboard();
  bindMouseNavigation();
  bindMicPushToTalk();
  bindDraftPersistenceFlush();

  state.status = await safeInvoke<AppStatus>("app_status", undefined, fallbackStatus(), BOOT_INVOKE_TIMEOUT_MS);
  await bindTauriNativeFileDropAsync();
  try {
    const capsRaw = await withTimeout(invoke<unknown>("capabilities", {}), BOOT_INVOKE_TIMEOUT_MS);
    state.capabilities = normalizeCapabilities(capsRaw);
  } catch (error) {
    console.error("capabilities", error);
    state.capabilities = fallbackCapabilities();
  }

  try {
    const paths = await withTimeout(invoke<AppPathsView>("app_paths", {}), BOOT_INVOKE_TIMEOUT_MS);
    state.lastAppPaths = paths;
    state.settingsPathsLoadError = "";
  } catch (error) {
    state.lastAppPaths = null;
    state.settingsPathsLoadError = tauriErrorMessage(error);
  }
}
