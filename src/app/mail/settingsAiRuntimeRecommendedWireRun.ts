import { invoke } from "@tauri-apps/api/core";
import { MAIL_ACTION_TIMEOUT_MS } from "../core/timeouts";
import { render } from "../dispatch";
import { state } from "../state";
import { toast } from "../lib/toast";
import { isTauriRuntime } from "../lib/tauriRuntime";
import { tauriErrorMessage, withTimeout } from "../lib/tauriCommand";
import {
  autoDetectLlamaServerBinary,
  persistAiPrefsFromDom,
  refreshLlmRuntimeStatus,
} from "./settingsWireActions";

function applyRecommendedWeightsFromRuntimeStatus(): boolean {
  const st = state.llmRuntimeStatus;
  if (!st?.recommendedRepo?.trim()) {
    toast("Aucune recommandation pour l’instant — essayez « Analyser la mémoire ».");
    return false;
  }
  state.appPrefs.ai.localLlmHfRepoId = st.recommendedRepo.trim();
  if (st.recommendedFile?.trim()) {
    state.appPrefs.ai.localLlmGgufFile = st.recommendedFile.trim();
  }
  return true;
}

export async function tryHandleSettingsAiRuntimeRecommendedWire(action: string): Promise<boolean> {
  switch (action) {
    case "llm-apply-recommended-weights": {
      if (!applyRecommendedWeightsFromRuntimeStatus()) return true;
      void persistAiPrefsFromDom({ silent: true, skipRender: true });
      toast("Modèle recommandé appliqué.");
      render();
      return true;
    }
    case "llm-setup-recommended": {
      void (async () => {
        if (!isTauriRuntime()) {
          toast("Configuration recommandée : lancez l’app Tauri.");
          return;
        }
        await refreshLlmRuntimeStatus(true);
        if (state.llmRuntimeStatus?.recommendedRepo?.trim()) {
          state.appPrefs.ai.localLlmHfRepoId = state.llmRuntimeStatus.recommendedRepo.trim();
          if (state.llmRuntimeStatus.recommendedFile?.trim()) {
            state.appPrefs.ai.localLlmGgufFile = state.llmRuntimeStatus.recommendedFile.trim();
          }
          state.appPrefs.ai.localLlmEnabled = true;
        }
        await autoDetectLlamaServerBinary({ silent: true, persist: false });
        try {
          await withTimeout(invoke("set_app_prefs", { prefs: state.appPrefs }), MAIL_ACTION_TIMEOUT_MS);
        } catch (e) {
          toast(tauriErrorMessage(e));
          return;
        }
        await refreshLlmRuntimeStatus(false);
        toast("Configuration recommandée appliquée.");
        render();
      })();
      return true;
    }
    default:
      return false;
  }
}
