import { tryHandleAccountSetupWire } from "./accountSetupWireActionsRun";
import { tryHandleComposeEntryWire } from "./composeEntryWireActionsRun";
import { tryHandleModalsWire } from "./modalsWireActionsRun";
import { tryHandleNewsletterRulesWire } from "./newsletterRulesWireRun";
import { tryHandleSettingsAiWire } from "./settingsAiWireDispatchRun";
import { tryHandleSettingsApiKeysWire } from "./settingsApiKeysWireActionsRun";
import { tryHandleSettingsLlamaBinaryWire } from "./settingsLlamaBinaryWireActionsRun";
import { tryHandleSettingsShellWire } from "./settingsShellWireActionsRun";

export async function tryHandleComposeSettings(action: string, element?: HTMLElement): Promise<boolean> {
  if (await tryHandleModalsWire(action, element)) return true;
  if (await tryHandleComposeEntryWire(action, element)) return true;
  if (await tryHandleSettingsShellWire(action, element)) return true;
  if (await tryHandleSettingsAiWire(action, element)) return true;
  if (await tryHandleSettingsApiKeysWire(action)) return true;
  if (await tryHandleSettingsLlamaBinaryWire(action, element)) return true;
  if (await tryHandleNewsletterRulesWire(action, element)) return true;
  if (await tryHandleAccountSetupWire(action, element)) return true;
  return false;
}
