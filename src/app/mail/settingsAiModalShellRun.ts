import { invoke } from "@tauri-apps/api/core";
import { t } from "../../i18n";
import { isTauriRuntime } from "../lib/tauriRuntime";
import { tauriErrorMessage } from "../lib/tauriCommand";
import { render } from "../dispatch";
import { state } from "../state";
import { normalizeSettingsAiModalId } from "../../settingsAiPanel";
import type { PromptCatalogItem } from "../../promptsSettingsPanel";
import {
  finalizeSettingsAiModalClose,
  openEnginesAiSettingsModal,
  refreshSemanticEmbeddingCounts,
} from "./settingsWireActions";

export function setSettingsIaTabFromWire(tab: string | undefined): void {
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
}

export async function openSettingsAiModalFromWire(rawModalId: string | undefined): Promise<void> {
  const modal = normalizeSettingsAiModalId(rawModalId);
  if (!modal) return;
  state.settingsAiModal = modal;
  if (modal === "prompts") {
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
    return;
  }
  if (modal === "semantic") {
    void refreshSemanticEmbeddingCounts().then(() => render());
    return;
  }
  if (modal === "engines") {
    void openEnginesAiSettingsModal();
    return;
  }
  render();
}

export function closeSettingsAiModalFromWire(): void {
  finalizeSettingsAiModalClose();
  state.settingsAiModal = null;
  render();
}
