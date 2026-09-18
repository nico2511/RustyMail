import { invoke } from "@tauri-apps/api/core";
import { render } from "../dispatch";
import { state } from "../state";
import { toast } from "../lib/toast";
import { isTauriRuntime } from "../lib/tauriRuntime";
import { tauriErrorMessage, withTimeout } from "../lib/tauriCommand";
import { paintLlmPrefetchProgressDom } from "./llmPrefetchProgressDom";
import { paintStatusBarProgressDom } from "./statusBarProgressJobs";
import { refreshLlmRuntimeStatus } from "./settingsWireActions";

export async function tryHandleSettingsAiPrefetchLlmWire(action: string): Promise<boolean> {
  switch (action) {
    case "cancel-llm-prefetch": {
      if (!isTauriRuntime()) return true;
      void (async () => {
        try {
          await invoke("cancel_prefetch_llm_model", {});
          toast("Téléchargement du modèle annulé.");
        } catch (e) {
          toast(tauriErrorMessage(e));
        }
      })();
      return true;
    }
    case "prefetch-llm-model": {
      if (!isTauriRuntime()) {
        toast("Téléchargement du modèle : ouvrez l’application de bureau (Tauri).");
        return true;
      }
      if (state.llmPrefetchInFlight) {
        toast("Un téléchargement est déjà en cours — utilisez Annuler pour l’arrêter.");
        return true;
      }
      state.llmPrefetchInFlight = true;
      state.llmPrefetchPercent = 0;
      paintLlmPrefetchProgressDom();
      paintStatusBarProgressDom();
      toast("Téléchargement du modèle en arrière-plan — vous pouvez continuer à utiliser l’app.");
      void (async () => {
        try {
          const msg = await withTimeout(invoke<string>("prefetch_llm_model", {}), 1_800_000);
          toast(msg || "Fichier modèle prêt.");
        } catch (e) {
          const msg = tauriErrorMessage(e);
          if (!/annulé/i.test(msg)) toast(msg);
        } finally {
          state.llmPrefetchInFlight = false;
          if (state.llmPrefetchPercent == null) {
            paintLlmPrefetchProgressDom();
            paintStatusBarProgressDom();
          }
          void refreshLlmRuntimeStatus(false).then(() => {
            if (state.settingsAiModal === "engines") render();
          });
        }
      })();
      return true;
    }
    default:
      return false;
  }
}
