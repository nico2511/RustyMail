import type { SettingsAiPanelDeps } from "../../settingsAiPanel";
import { escapeAttr, escapeHtml } from "../../ui/sanitize";
import { isTauriRuntime } from "../lib/tauriRuntime";
import { settingsExplainHtml } from "../lib/settingsExplainHtml";
import { iconSvg } from "../lib/iconSvg";
import { state } from "../state";
import { formatWhisperPttKeyLabel } from "./composeMicPtt";
import { buildSemanticStatsBlockHtml } from "./settingsSemanticStatsRenderRun";

export { mergedProfileForAccountsForm, settingsDraftProfile } from "./settingsAccountsFormProfileRun";

export function buildSettingsAiPanelDeps(): SettingsAiPanelDeps {
  return {
    ai: state.appPrefs.ai,
    escapeHtml,
    escapeAttr,
    iconSvg,
    settingsExplainHtml,
    formatWhisperPttKeyLabel,
    isTauri: isTauriRuntime(),
    semanticStatsBlock: buildSemanticStatsBlockHtml(),
    semOk: state.semanticModelAvailable,
    keyHint:
      state.openrouterApiKeySet || state.dictationApiKeySet
        ? "Clé cloud enregistrée dans le trousseau."
        : "Aucune clé cloud.",
    dictationApiKeySet: state.dictationApiKeySet,
    openrouterApiKeySet: state.openrouterApiKeySet,
    llamaServerApiKeySet: state.llamaServerApiKeySet,
    llmRuntimeStatus: state.llmRuntimeStatus,
    llmPrefetchPercent: state.llmPrefetchPercent,
    llmPrefetchInFlight: state.llmPrefetchInFlight,
    llmCachedGgufFilenames: state.llmCachedGgufFilenames,
    bootstrapModelsCompleted: Boolean(state.appPrefs.general.bootstrapModelsCompleted),
    engineSettingsTab: state.aiEngineSettingsTab,
  };
}
