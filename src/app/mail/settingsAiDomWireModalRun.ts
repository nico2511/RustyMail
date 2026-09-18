// @ts-nocheck — DOM wiring; tighten types incrementally.
import { captureAiPrefsFieldsFromDom, syncLlmEnginePrefsToDom } from "../../aiPrefsPersist";
import { applyEngineConnectionMode } from "../../settingsAiPanel";
import { render } from "../dispatch";
import { state } from "../state";
import {
  schedulePersistAiPrefsFromDom,
  applyContextSliderIndex,
  persistEngineCheckboxToggle,
} from "./settingsWireActions";

export function wireSettingsAiDomModalListeners(signal: AbortSignal, immediateCheckboxIds: Set<string>): void {
  document.addEventListener(
    "change",
    (ev: Event) => {
      if (!state.settingsAiModal) return;
      const t = ev.target as HTMLElement | null;
      if (!t?.closest(".settings-ai-modal-body")) return;
      const id = (t as HTMLInputElement | HTMLSelectElement).id ?? "";
      if (id && immediateCheckboxIds.has(id)) {
        if (id === "prefs-openrouter-enabled" && t instanceof HTMLInputElement) {
          const next = t.checked;
          if (!next) {
            applyEngineConnectionMode(state.appPrefs.ai, "local");
            state.aiEngineSettingsTab = "local";
          } else {
            state.appPrefs.ai.openrouterEnabled = true;
          }
          syncLlmEnginePrefsToDom(state.appPrefs.ai);
          void persistEngineCheckboxToggle(next ? "OpenRouter activé." : "OpenRouter désactivé — bascule PC.");
        } else if (id === "prefs-llama-server-enabled" && t instanceof HTMLInputElement) {
          state.appPrefs.ai.llamaServerEnabled = t.checked;
          void persistEngineCheckboxToggle(t.checked ? "llama-server activé." : "llama-server désactivé.");
        }
        return;
      }
      if (t.matches('select[id^="prefs-"]')) {
        if (id === "prefs-dictation-backend" && t instanceof HTMLSelectElement) {
          const raw = t.value.trim();
          state.appPrefs.ai.dictationBackend =
            raw === "cloud" || raw === "local_http" ? raw : "whisper_cpp";
          captureAiPrefsFieldsFromDom(state.appPrefs);
          schedulePersistAiPrefsFromDom({ skipDomCapture: true });
          render();
          return;
        }
        if (id === "prefs-openrouter-model-preset" && t instanceof HTMLSelectElement) {
          const v = t.value.trim();
          if (v && v !== "__custom__") {
            state.appPrefs.ai.openrouterModel = v;
            const inp = document.querySelector<HTMLInputElement>("#prefs-openrouter-model");
            if (inp) inp.value = v;
          }
          captureAiPrefsFieldsFromDom(state.appPrefs);
          schedulePersistAiPrefsFromDom({ skipDomCapture: true });
          return;
        }
        if (id === "prefs-local-gguf-preset" && t instanceof HTMLSelectElement) {
          const v = t.value.trim();
          if (v && v !== "__custom__") {
            const sep = v.indexOf("|");
            if (sep > 0) {
              const repo = v.slice(0, sep);
              const file = v.slice(sep + 1);
              state.appPrefs.ai.localLlmHfRepoId = repo;
              state.appPrefs.ai.localLlmGgufFile = file;
              state.appPrefs.ai.localLlmEnabled = true;
              const repoEl = document.querySelector<HTMLInputElement>("#prefs-local-llm-repo");
              const fileEl = document.querySelector<HTMLInputElement>("#prefs-local-llm-file");
              if (repoEl) repoEl.value = repo;
              if (fileEl) fileEl.value = file;
            }
          }
          captureAiPrefsFieldsFromDom(state.appPrefs);
          schedulePersistAiPrefsFromDom({ skipDomCapture: true });
          return;
        }
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
    { signal }
  );

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
    { signal }
  );
}
