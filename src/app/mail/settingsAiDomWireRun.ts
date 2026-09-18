// @ts-nocheck — DOM wiring; tighten types incrementally.
import {
  captureAiFeatureTogglesFromDom,
  persistAiFeaturePrefs,
} from "../../aiPrefsPersist";
import { normalizeAiPrefsMerged } from "../../prefs_defaults";
import { tauriErrorMessage } from "../lib/tauriCommand";
import { toast } from "../lib/toast";
import { state } from "../state";
import { wireSettingsAiDomEngineAndBackgroundListeners } from "./settingsAiDomWireEnginesRun";
import { wireSettingsAiDomModalListeners } from "./settingsAiDomWireModalRun";

export function wireSettingsAiDomListeners(signal: AbortSignal, immediateCheckboxIds: Set<string>): void {
  document.querySelectorAll<HTMLInputElement>("[data-ai-feature]").forEach((el) => {
    el.addEventListener(
      "change",
      () => {
        captureAiFeatureTogglesFromDom();
        state.appPrefs.ai = normalizeAiPrefsMerged(state.appPrefs.ai);
        void (async () => {
          try {
            await persistAiFeaturePrefs();
          } catch (e) {
            toast(tauriErrorMessage(e));
          }
        })();
      },
      { signal }
    );
  });

  wireSettingsAiDomModalListeners(signal, immediateCheckboxIds);
  wireSettingsAiDomEngineAndBackgroundListeners(signal);
}
