import {
  closeSettingsAiModalFromWire,
  openSettingsAiModalFromWire,
  setSettingsIaTabFromWire,
} from "./settingsAiModalShellRun";

export async function tryHandleSettingsAiModalShellWire(action: string, element?: HTMLElement): Promise<boolean> {
  switch (action) {
    case "settings-ia-tab":
      setSettingsIaTabFromWire(element?.dataset.iaTab);
      return true;
    case "open-settings-ai-modal":
      void openSettingsAiModalFromWire(element?.dataset.aiModal);
      return true;
    case "close-settings-ai-modal":
      closeSettingsAiModalFromWire();
      return true;
    default:
      return false;
  }
}
