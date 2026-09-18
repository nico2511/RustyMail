import { invoke } from "@tauri-apps/api/core";

import { t } from "../../i18n";
import { BOOT_INVOKE_TIMEOUT_MS } from "../core/timeouts";
import { isTauriRuntime } from "../lib/tauriRuntime";
import { withTimeout } from "../lib/tauriCommand";
import { toast } from "../lib/toast";
import { state } from "../state";
import type { LlmRuntimeStatus } from "../types";

let llmIdlePrefetchAfterBootScheduled = false;

export async function bootDeferredLlmStatusAndPrefetch(): Promise<void> {
  if (isTauriRuntime() && state.appPrefs.ai.localLlmEnabled) {
    try {
      const st = await withTimeout(invoke<LlmRuntimeStatus>("llm_status", {}), BOOT_INVOKE_TIMEOUT_MS);
      state.llmRuntimeStatus = st;
      if (!st.llmGateOpen && !state.appPrefs.ai.aiCloudLlmFallback) {
        toast(t("toast.aiOfflineLexical"));
      }
    } catch {
      /* statut optionnel */
    }
  }

  if (isTauriRuntime() && !llmIdlePrefetchAfterBootScheduled) {
    llmIdlePrefetchAfterBootScheduled = true;
    window.setTimeout(() => {
      if (!isTauriRuntime()) return;
      const a = state.appPrefs.ai;
      if (!a.localLlmEnabled) return;
      if (!(a.aiBackgroundLlmPrefetch || a.llamaServerEnabled)) return;
      void invoke("prefetch_llm_model", {}).catch(() => {});
    }, 45_000);
  }
}
