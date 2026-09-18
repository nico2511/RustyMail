import { render } from "../dispatch";
import { toast } from "../lib/toast";
import { persistAiPrefsFromDom, refreshLlmRuntimeStatus } from "./settingsWireActions";

export async function tryHandleSettingsAiRuntimeStatusWire(action: string): Promise<boolean> {
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
    default:
      return false;
  }
}
