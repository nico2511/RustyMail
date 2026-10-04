import { llmConnectionStatus, engineConnectionMode } from "../../settingsAiPanel";
import { render } from "../dispatch";
import { state } from "../state";
import { toast } from "../lib/toast";
import { isTauriRuntime } from "../lib/tauriRuntime";
import { buildSettingsAiPanelDeps } from "./settingsRenderHelpers";
import { persistAiPrefsFromDom, refreshLlmRuntimeStatus } from "./settingsWireActions";

export async function tryHandleSettingsAiRuntimeStatusWire(action: string): Promise<boolean> {
  switch (action) {
    case "save-ai-prefs":
      void persistAiPrefsFromDom();
      return true;
    case "ai-test-connection": {
      if (!isTauriRuntime()) {
        toast.warning("Le test de connexion se fait dans l’application bureau.");
        return true;
      }
      void (async () => {
        // Capturer seulement les champs IA déjà en mémoire / DOM IA ; ne pas
        // rescanner l’apparence (absente sur cet onglet → défaut « light »).
        await persistAiPrefsFromDom({ silent: true, skipRender: true, skipDomCapture: true });
        await refreshLlmRuntimeStatus(false);
        const status = llmConnectionStatus(engineConnectionMode(state.appPrefs.ai), buildSettingsAiPanelDeps());
        render();
        toast(status.text);
      })();
      return true;
    }
    case "refresh-llm-runtime-status": {
      void refreshLlmRuntimeStatus(false).then(() => {
        render();
        toast.info("Statut LLM actualisé.");
      });
      return true;
    }
    case "refresh-llm-hardware-rescan": {
      void refreshLlmRuntimeStatus(true).then(() => {
        render();
        toast.success("Mémoire de l’ordinateur : nouvelle analyse effectuée.");
      });
      return true;
    }
    default:
      return false;
  }
}
