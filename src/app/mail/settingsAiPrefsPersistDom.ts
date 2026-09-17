import { invoke } from "@tauri-apps/api/core";
import type { AppPrefs } from "../../prefs_defaults";
import { captureAiPrefsFieldsFromDom } from "../../aiPrefsPersist";
import { defaultAppPrefs, normalizeAiPrefsMerged } from "../../prefs_defaults";
import { MAIL_ACTION_TIMEOUT_MS } from "../core/timeouts";
import { isTauriRuntime } from "../lib/tauriRuntime";
import { tauriErrorMessage, withTimeout } from "../lib/tauriCommand";
import { toast } from "../lib/toast";
import { render } from "../dispatch";
import { state } from "../state";

let persistAiPrefsDebounce: ReturnType<typeof setTimeout> | undefined;

export async function persistAiPrefsFromDom(opts?: {
  silent?: boolean;
  skipRender?: boolean;
  skipDomCapture?: boolean;
}): Promise<void> {
  if (!isTauriRuntime()) {
    if (!opts?.silent) toast("Enregistrement : lancez l’app Tauri.");
    return;
  }
  if (!opts?.skipDomCapture) {
    captureAiPrefsFieldsFromDom(state.appPrefs);
  }
  if (state.view === "thread" && state.selectedThread) {
    state.aiOpen = true;
  }
  try {
    await withTimeout(invoke("set_app_prefs", { prefs: state.appPrefs }), MAIL_ACTION_TIMEOUT_MS);
    try {
      state.appPrefs = await withTimeout(invoke<AppPrefs>("get_app_prefs", {}), MAIL_ACTION_TIMEOUT_MS);
      state.appPrefs.ai = normalizeAiPrefsMerged({
        ...defaultAppPrefs().ai,
        ...state.appPrefs.ai,
      });
    } catch {
      /* ignore reload failures */
    }
    if (!opts?.silent) toast("Réglages IA enregistrés.");
  } catch (e) {
    toast(tauriErrorMessage(e));
  }
  if (!opts?.skipRender) render();
}

export function schedulePersistAiPrefsFromDom(opts?: { skipDomCapture?: boolean }): void {
  if (persistAiPrefsDebounce) clearTimeout(persistAiPrefsDebounce);
  const skipDomCapture = Boolean(opts?.skipDomCapture);
  persistAiPrefsDebounce = window.setTimeout(() => {
    persistAiPrefsDebounce = undefined;
    void persistAiPrefsFromDom({ silent: true, skipDomCapture });
  }, 480);
}

function flushPendingAiPrefsPersist(): void {
  if (persistAiPrefsDebounce) {
    clearTimeout(persistAiPrefsDebounce);
    persistAiPrefsDebounce = undefined;
  }
}

export function finalizeSettingsAiModalClose(): void {
  captureAiPrefsFieldsFromDom(state.appPrefs);
  flushPendingAiPrefsPersist();
  void persistAiPrefsFromDom({ silent: true, skipDomCapture: true, skipRender: true });
}
