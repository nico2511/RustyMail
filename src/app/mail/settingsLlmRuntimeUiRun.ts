import { engineConnectionMode, LLM_CONTEXT_PRESETS } from "../../settingsAiPanel";
import { invoke } from "@tauri-apps/api/core";
import { MAIL_ACTION_TIMEOUT_MS } from "../core/timeouts";
import { isTauriRuntime } from "../lib/tauriRuntime";
import { tauriErrorMessage, withTimeout } from "../lib/tauriCommand";
import { toast } from "../lib/toast";
import { render } from "../dispatch";
import { state } from "../state";
import { autoDetectLlamaServerBinary } from "./settingsLlmRuntimeLlamaDetectRun";
import { refreshLlmRuntimeStatus } from "./settingsLlmRuntimeStatusRun";

export function syncAiEngineSettingsTabFromPrefs(): void {
  state.aiEngineSettingsTab = engineConnectionMode(state.appPrefs.ai);
}

export async function openEnginesAiSettingsModal(): Promise<void> {
  state.settingsAiModal = "engines";
  syncAiEngineSettingsTabFromPrefs();
  await autoDetectLlamaServerBinary({ silent: true });
  await refreshLlmRuntimeStatus(false);
  render();
}

export function applyContextSliderIndex(idx: number): void {
  const clamped = Math.max(0, Math.min(LLM_CONTEXT_PRESETS.length - 1, Math.trunc(idx)));
  const n = LLM_CONTEXT_PRESETS[clamped] ?? 4096;
  state.appPrefs.ai.localLlmContextSize = n;
  const hidden = document.querySelector<HTMLInputElement>("#prefs-local-llm-ctx");
  const display = document.querySelector<HTMLElement>("#prefs-local-llm-ctx-display");
  const range = document.querySelector<HTMLInputElement>("#prefs-local-llm-ctx-range");
  if (hidden) hidden.value = String(n);
  if (display) display.textContent = String(n);
  if (range) range.value = String(clamped);
  document.querySelectorAll<HTMLElement>(".settings-ctx-slider__tick").forEach((el, i) => {
    el.classList.toggle("settings-ctx-slider__tick--active", i === clamped);
  });
}

export async function persistEngineCheckboxToggle(message: string): Promise<void> {
  if (!isTauriRuntime()) return;
  try {
    await withTimeout(invoke("set_app_prefs", { prefs: state.appPrefs }), MAIL_ACTION_TIMEOUT_MS);
    toast(message);
    await refreshLlmRuntimeStatus(false);
    if (state.settingsAiModal === "engines") render();
  } catch (e) {
    toast(tauriErrorMessage(e));
  }
}
