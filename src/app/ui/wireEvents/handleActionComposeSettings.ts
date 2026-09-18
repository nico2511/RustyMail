import { tryHandleAccountSetupWire } from "./handleActionAccountSetupWireRun";
import { tryHandleComposeEntryWire } from "./handleActionComposeEntryWireRun";
import { tryHandleModalsWire } from "./handleActionModalsWireRun";
import { tryHandleNewsletterRulesWire } from "./handleActionNewsletterRulesWireRun";
import { tryHandleSettingsAiWire } from "./handleActionSettingsAiWireRun";
import { tryHandleSettingsApiKeysWire } from "./handleActionSettingsApiKeysWireRun";
import { tryHandleSettingsLlamaBinaryWire } from "./handleActionSettingsLlamaBinaryWireRun";
import { tryHandleSettingsShellWire } from "./handleActionSettingsShellWireRun";

export async function tryHandleComposeSettings(action: string, element?: HTMLElement): Promise<boolean> {
  if (await tryHandleModalsWire(action, element)) return true;
  if (await tryHandleComposeEntryWire(action, element)) return true;
  if (await tryHandleSettingsShellWire(action, element)) return true;
  if (await tryHandleSettingsAiWire(action, element)) return true;
  if (await tryHandleSettingsApiKeysWire(action, element)) return true;
  if (await tryHandleSettingsLlamaBinaryWire(action, element)) return true;
  if (await tryHandleNewsletterRulesWire(action, element)) return true;
  if (await tryHandleAccountSetupWire(action, element)) return true;
  return false;
}
