import {
  render,
  state,
  toast,
  invoke,
  isTauriRuntime,
  MAIL_ACTION_TIMEOUT_MS,
  withTimeout,
  tauriErrorMessage,
} from "./depsCore";
import {
  applyEngineConnectionMode,
  autoDetectLlamaServerBinary,
  persistAiPrefsFromDom,
  refreshLlmRuntimeStatus,
  syncLlmEnginePrefsToDom,
} from "./depsSettingsAccount";

export async function tryHandleSettingsAiRuntimeWire(action: string, element?: HTMLElement): Promise<boolean> {
  switch (action) {
    case "save-ai-prefs":
      void persistAiPrefsFromDom();
      return true;
    case "refresh-llm-runtime-status": {
      void refreshLlmRuntimeStatus(false).then(() => {
        render();
        toast("Statut LLM actualisé.");
      });
      return true;
    }
    case "refresh-llm-hardware-rescan": {
      void refreshLlmRuntimeStatus(true).then(() => {
        render();
        toast("Mémoire de l’ordinateur : nouvelle analyse effectuée.");
      });
      return true;
    }
    case "llm-apply-recommended-weights": {
      const st = state.llmRuntimeStatus;
      if (!st?.recommendedRepo?.trim()) {
        toast("Aucune recommandation pour l’instant — essayez « Analyser la mémoire ».");
        return true;
      }
      state.appPrefs.ai.localLlmHfRepoId = st.recommendedRepo.trim();
      if (st.recommendedFile?.trim()) {
        state.appPrefs.ai.localLlmGgufFile = st.recommendedFile.trim();
      }
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
        const st = state.llmRuntimeStatus;
        if (st?.recommendedRepo?.trim()) {
          state.appPrefs.ai.localLlmHfRepoId = st.recommendedRepo.trim();
          if (st.recommendedFile?.trim()) {
            state.appPrefs.ai.localLlmGgufFile = st.recommendedFile.trim();
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
    case "ai-engine-mode": {
      const mode = element?.dataset.engineMode?.trim();
      if (mode !== "local" && mode !== "cloud" && mode !== "hybrid") return true;
      state.aiEngineSettingsTab = mode;
      if (mode === "local") {
        applyEngineConnectionMode(state.appPrefs.ai, "local");
      } else if (mode === "hybrid") {
        applyEngineConnectionMode(state.appPrefs.ai, "hybrid");
      }
      syncLlmEnginePrefsToDom(state.appPrefs.ai);
      render();
      void (async () => {
        if (mode === "local" || mode === "hybrid") {
          try {
            await withTimeout(invoke("set_app_prefs", { prefs: state.appPrefs }), MAIL_ACTION_TIMEOUT_MS);
          } catch (e) {
            toast(tauriErrorMessage(e));
            return;
          }
        }
        toast(
          mode === "local"
            ? "Mode Sur mon PC."
            : mode === "cloud"
              ? "Mode Cloud."
              : "Mode Hybride enregistré.",
        );
        await refreshLlmRuntimeStatus(false);
        render();
      })();
      return true;
    }
    default:
      return false;
  }
}
