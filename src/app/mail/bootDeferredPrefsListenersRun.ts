import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

import { render } from "../dispatch";
import { state } from "../state";
import { paintLlmPrefetchProgressDom } from "./llmPrefetchProgressDom";
import { paintStatusBarProgressDom } from "./statusBarProgressJobs";
import { refreshLlmRuntimeStatus } from "./settingsLlmRuntime";
import { toast } from "../lib/toast";

let subscribedLlmPrefetchProgress = false;
let subscribedModelBootstrapProgress = false;

export function ensureBootProgressEventListeners(): void {
  if (!subscribedModelBootstrapProgress) {
    subscribedModelBootstrapProgress = true;
    void listen<{ phase?: string; percent?: number }>("model_bootstrap_progress", (e) => {
      const ph = e.payload?.phase ?? "";
      if (ph === "done" || ph === "minilm_done" || ph === "whisper_error") {
        void invoke<boolean>("semantic_model_available", {})
          .then((ok) => {
            state.semanticModelAvailable = ok;
            render();
          })
          .catch(() => {});
      }
      if (ph && ph !== "done") {
        toast(`Téléchargement modèles : ${ph}`);
      }
    });
    void listen<{ minilmOk?: boolean; whisperOk?: boolean; error?: string | null }>(
      "model_bootstrap_done",
      (e) => {
        if (e.payload?.minilmOk) state.semanticModelAvailable = true;
        state.appPrefs.general.bootstrapModelsCompleted = Boolean(
          e.payload?.minilmOk && e.payload?.whisperOk,
        );
        if (e.payload?.error) toast(e.payload.error);
        else if (e.payload?.minilmOk && e.payload?.whisperOk) {
          toast("Modèles légers (MiniLM + dictée) prêts.");
        }
        render();
      },
    );
  }
  if (!subscribedLlmPrefetchProgress) {
    subscribedLlmPrefetchProgress = true;
    void listen<{ percent?: number; phase?: string }>("llm_prefetch_progress", (e) => {
      const raw = typeof e.payload?.percent === "number" ? e.payload.percent : NaN;
      state.llmPrefetchPercent = Number.isFinite(raw)
        ? Math.min(100, Math.max(0, Math.round(raw)))
        : null;
      const ph = e.payload?.phase ?? "";
      if (ph === "done" || ph === "cancelled") {
        state.llmPrefetchPercent = null;
        state.llmPrefetchInFlight = false;
        paintLlmPrefetchProgressDom();
        paintStatusBarProgressDom();
        if (ph === "done") {
          void refreshLlmRuntimeStatus().then(() => {
            if (state.settingsAiModal === "engines") render();
          });
        } else if (state.settingsAiModal === "engines") {
          render();
        }
        return;
      }
      paintLlmPrefetchProgressDom();
      paintStatusBarProgressDom();
    });
  }
}
