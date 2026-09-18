import {
  render,
  state,
  invoke,
  t,
  isTauriRuntime,
  tauriErrorMessage,
} from "./depsCore";
import {
  normalizeSettingsAiModalId,
  refreshSemanticEmbeddingCounts,
  openEnginesAiSettingsModal,
  finalizeSettingsAiModalClose,
} from "./depsSettingsAccount";
import type {
  PromptCatalogItem,
} from "./depsSettingsAccount";

export async function tryHandleSettingsAiModalShellWire(action: string, element?: HTMLElement): Promise<boolean> {
  switch (action) {
    case "settings-ia-tab": {
      const tab = element?.dataset.iaTab;
      if (tab === "semantic") {
        state.settingsAiModal = "semantic";
        void refreshSemanticEmbeddingCounts().then(() => render());
      } else if (tab === "llm") {
        void openEnginesAiSettingsModal();
      } else if (tab === "dictation") {
        state.settingsAiModal = "dictation";
        render();
      } else if (tab === "background") {
        state.settingsAiModal = "background";
        render();
      } else if (tab === "features") {
        state.settingsAiModal = "features-0";
        render();
      }
      return true;
    }
    case "open-settings-ai-modal": {
      const modal = normalizeSettingsAiModalId(element?.dataset.aiModal);
      if (!modal) return true;
      state.settingsAiModal = modal;
      if (modal === "prompts") {
        void (async () => {
          if (!isTauriRuntime()) {
            state.promptCatalog = null;
            state.promptCatalogLoadError = t("settings.ai.promptsNoCatalog");
            render();
            return;
          }
          try {
            state.promptCatalog = await invoke<PromptCatalogItem[]>("list_ai_prompt_catalog", {});
            state.promptCatalogLoadError = "";
          } catch (e) {
            state.promptCatalog = null;
            state.promptCatalogLoadError = tauriErrorMessage(e);
          }
          render();
        })();
      } else if (modal === "semantic") void refreshSemanticEmbeddingCounts().then(() => render());
      else if (modal === "engines") void openEnginesAiSettingsModal();
      else render();
      return true;
    }
    case "close-settings-ai-modal":
      finalizeSettingsAiModalClose();
      state.settingsAiModal = null;
      render();
      return true;
    default:
      return false;
  }
}
