import { tryHandleSettingsAiModalShellWire } from "./settingsAiModalShellWireActionsRun";
import { tryHandleSettingsGeneralPrefsWire } from "./settingsGeneralPrefsWireActionsRun";
import { tryHandleSettingsNavWire } from "./settingsNavWireActionsRun";

export async function tryHandleSettingsShellWire(action: string, element?: HTMLElement): Promise<boolean> {
  if (await tryHandleSettingsNavWire(action, element)) return true;
  if (await tryHandleSettingsAiModalShellWire(action, element)) return true;
  if (await tryHandleSettingsGeneralPrefsWire(action, element)) return true;
  return false;
}
