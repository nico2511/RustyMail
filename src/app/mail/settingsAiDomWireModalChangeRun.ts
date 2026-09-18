// @ts-nocheck — DOM wiring; tighten types incrementally.
import { captureAiPrefsFieldsFromDom } from "../../aiPrefsPersist";
import { render } from "../dispatch";
import { state } from "../state";
import { schedulePersistAiPrefsFromDom, applyContextSliderIndex } from "./settingsWireActions";
import {
  handleSettingsAiModalImmediateCheckbox,
  handleSettingsAiModalSelectChange,
} from "./settingsAiDomWireModalHandlersRun";

export function wireSettingsAiDomModalChangeListener(signal: AbortSignal, immediateCheckboxIds: Set<string>): void {
  document.addEventListener(
    "change",
    (ev: Event) => {
      if (!state.settingsAiModal) return;
      const t = ev.target as HTMLElement | null;
      if (!t?.closest(".settings-ai-modal-body")) return;
      const id = (t as HTMLInputElement | HTMLSelectElement).id ?? "";
      if (id && immediateCheckboxIds.has(id)) {
        if (t instanceof HTMLInputElement) handleSettingsAiModalImmediateCheckbox(id, t);
        return;
      }
      if (t.matches('select[id^="prefs-"]') && t instanceof HTMLSelectElement) {
        if (id === "prefs-dictation-backend") {
          const raw = t.value.trim();
          state.appPrefs.ai.dictationBackend = raw === "cloud" || raw === "local_http" ? raw : "whisper_cpp";
          captureAiPrefsFieldsFromDom(state.appPrefs);
          schedulePersistAiPrefsFromDom({ skipDomCapture: true });
          render();
          return;
        }
        if (handleSettingsAiModalSelectChange(id, t)) return;
        captureAiPrefsFieldsFromDom(state.appPrefs);
        schedulePersistAiPrefsFromDom({ skipDomCapture: true });
        return;
      }
      if (t instanceof HTMLInputElement && t.type === "checkbox" && id.startsWith("prefs-")) {
        captureAiPrefsFieldsFromDom(state.appPrefs);
        schedulePersistAiPrefsFromDom({ skipDomCapture: true });
        return;
      }
      if (t.matches("[data-ai-feature]")) return;
      if (
        t instanceof HTMLInputElement &&
        t.classList.contains("settings-ctl") &&
        t.id?.startsWith("prefs-") &&
        t.type !== "password" &&
        t.type !== "checkbox"
      ) {
        if (id === "prefs-local-llm-ctx-range") {
          applyContextSliderIndex(Number.parseInt(t.value, 10));
        }
        captureAiPrefsFieldsFromDom(state.appPrefs);
        schedulePersistAiPrefsFromDom({ skipDomCapture: true });
      }
    },
    { signal },
  );
}

export function wireSettingsAiDomModalInputListener(signal: AbortSignal): void {
  document.addEventListener(
    "input",
    (ev: Event) => {
      if (!state.settingsAiModal) return;
      const t = ev.target as HTMLElement | null;
      if (!(t instanceof HTMLInputElement) || t.id !== "prefs-local-llm-ctx-range") return;
      if (!t.closest(".settings-ai-modal-body")) return;
      applyContextSliderIndex(Number.parseInt(t.value, 10));
      captureAiPrefsFieldsFromDom(state.appPrefs);
      schedulePersistAiPrefsFromDom({ skipDomCapture: true });
    },
    { signal },
  );
}
