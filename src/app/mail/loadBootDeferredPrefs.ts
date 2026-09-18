import { isTauriRuntime } from "../lib/tauriRuntime";
import {
  applyBootDefaultListFilterIfNeeded,
  runBootDeferredPostPrefsSteps,
} from "./bootDeferredPrefsAfterLoadRun";
import {
  applyBootPrefsLoadFailure,
  fetchAndApplyAppPrefsFromBackend,
  loadBootApiKeyStatuses,
} from "./bootDeferredPrefsFetchRun";
import { ensureBootProgressEventListeners } from "./bootDeferredPrefsListenersRun";

export async function loadBootDeferredPrefs(): Promise<void> {
  if (!isTauriRuntime()) return;
  try {
    await fetchAndApplyAppPrefsFromBackend();
    await loadBootApiKeyStatuses();
    ensureBootProgressEventListeners();
    runBootDeferredPostPrefsSteps();
    await applyBootDefaultListFilterIfNeeded();
  } catch (e) {
    console.error("app prefs", e);
    applyBootPrefsLoadFailure();
  }
}
