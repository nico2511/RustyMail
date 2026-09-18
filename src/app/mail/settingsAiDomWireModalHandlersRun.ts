// @ts-nocheck — DOM wiring; tighten types incrementally.
import { captureAiPrefsFieldsFromDom, syncLlmEnginePrefsToDom } from "../../aiPrefsPersist";
import { applyEngineConnectionMode } from "../../settingsAiPanel";
import { state } from "../state";
import {
  schedulePersistAiPrefsFromDom,
  applyContextSliderIndex,
  persistEngineCheckboxToggle,
} from "./settingsWireActions";

export function handleSettingsAiModalImmediateCheckbox(id: string, t: HTMLInputElement): void {
  if (id === "prefs-openrouter-enabled") {
    const next = t.checked;
    if (!next) {
      applyEngineConnectionMode(state.appPrefs.ai, "local");
      state.aiEngineSettingsTab = "local";
    } else {
      state.appPrefs.ai.openrouterEnabled = true;
    }
    syncLlmEnginePrefsToDom(state.appPrefs.ai);
    void persistEngineCheckboxToggle(next ? "OpenRouter activé." : "OpenRouter désactivé — bascule PC.");
  } else if (id === "prefs-llama-server-enabled") {
    state.appPrefs.ai.llamaServerEnabled = t.checked;
    void persistEngineCheckboxToggle(t.checked ? "llama-server activé." : "llama-server désactivé.");
  }
}

export function handleSettingsAiModalSelectChange(id: string, t: HTMLSelectElement): boolean {
  if (id === "prefs-openrouter-model-preset") {
    const v = t.value.trim();
    if (v && v !== "__custom__") {
      state.appPrefs.ai.openrouterModel = v;
      const inp = document.querySelector<HTMLInputElement>("#prefs-openrouter-model");
      if (inp) inp.value = v;
    }
    captureAiPrefsFieldsFromDom(state.appPrefs);
    schedulePersistAiPrefsFromDom({ skipDomCapture: true });
    return true;
  }
  if (id === "prefs-local-gguf-preset") {
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
    return true;
  }
  return false;
}
