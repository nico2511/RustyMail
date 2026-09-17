import { invoke } from "@tauri-apps/api/core";
import type { AppPathsView } from "../types";
import { BOOT_INVOKE_TIMEOUT_MS } from "../core/timeouts";
import { isTauriRuntime } from "../lib/tauriRuntime";
import { tauriErrorMessage, withTimeout } from "../lib/tauriCommand";
import { render } from "../dispatch";
import { state } from "../state";

export async function refreshSettingsPathsFromBackend(): Promise<void> {
  if (!isTauriRuntime()) return;
  state.settingsPathsLoadError = "";
  try {
    state.lastAppPaths = await withTimeout(invoke<AppPathsView>("app_paths", {}), BOOT_INVOKE_TIMEOUT_MS);
  } catch (e) {
    state.lastAppPaths = null;
    state.settingsPathsLoadError = tauriErrorMessage(e);
  }
  render();
}
