import { invoke } from "@tauri-apps/api/core";
import { engineConnectionMode, LLM_CONTEXT_PRESETS } from "../../settingsAiPanel";
import type { LlmRuntimeStatus } from "../types";
import { MAIL_ACTION_TIMEOUT_MS } from "../core/timeouts";
import { isTauriRuntime } from "../lib/tauriRuntime";
import { tauriErrorMessage, withTimeout } from "../lib/tauriCommand";
import { toast } from "../lib/toast";
import { render } from "../dispatch";
import { state } from "../state";

export async function refreshLlmRuntimeStatus(forceHardwareRescan?: boolean): Promise<void> {
  if (!isTauriRuntime()) {
    state.llmRuntimeStatus = null;
    state.llmCachedGgufFilenames = [];
    return;
  }
  try {
    state.llmRuntimeStatus = await withTimeout(
      invoke<LlmRuntimeStatus>(forceHardwareRescan ? "llm_status_refresh_hardware" : "llm_status", {}),
      MAIL_ACTION_TIMEOUT_MS,
    );
  } catch {
    state.llmRuntimeStatus = null;
  }
  try {
    state.llmCachedGgufFilenames = await withTimeout(invoke<string[]>("list_cached_gguf_models", {}), 10_000);
  } catch {
    state.llmCachedGgufFilenames = [];
  }
}

export function syncAiEngineSettingsTabFromPrefs(): void {
  state.aiEngineSettingsTab = engineConnectionMode(state.appPrefs.ai);
}

export async function autoDetectLlamaServerBinary(opts?: {
  silent?: boolean;
  persist?: boolean;
}): Promise<boolean> {
  if (!isTauriRuntime()) return false;
  const prev = state.appPrefs.ai.llamaServerBinaryPath.trim();
  try {
    const det = await invoke<{
      onPath: boolean;
      wingetInstalled: boolean;
      resolvedPath?: string | null;
    }>("llama_server_detect", {
      binaryHint: prev || "llama-server",
    });
    let next = prev;
    if (det.resolvedPath?.trim()) {
      next = det.resolvedPath.trim();
    } else if ((det.onPath || det.wingetInstalled) && !prev) {
      next = "llama-server";
    }
    if (next && next !== prev) {
      state.appPrefs.ai.llamaServerBinaryPath = next;
      if (opts?.persist !== false) {
        await withTimeout(invoke("set_app_prefs", { prefs: state.appPrefs }), MAIL_ACTION_TIMEOUT_MS);
      }
      if (!opts?.silent) toast(`llama-server : ${next}`);
      return true;
    }
    if (!opts?.silent && (det.onPath || det.wingetInstalled)) {
      toast(`llama-server détecté${det.resolvedPath ? ` (${det.resolvedPath})` : ""}.`);
    } else if (!opts?.silent && !det.onPath && !det.wingetInstalled) {
      toast("llama-server introuvable (PATH et winget).");
    }
  } catch (e) {
    if (!opts?.silent) toast(tauriErrorMessage(e));
  }
  return false;
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
