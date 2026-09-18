import { invoke } from "@tauri-apps/api/core";
import type { LlmRuntimeStatus } from "../types";
import { MAIL_ACTION_TIMEOUT_MS } from "../core/timeouts";
import { isTauriRuntime } from "../lib/tauriRuntime";
import { withTimeout } from "../lib/tauriCommand";
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
