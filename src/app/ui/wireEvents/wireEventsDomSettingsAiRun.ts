import { wireSettingsAiDomListeners } from "../../mail/settingsAiDomWireRun";
import { wireEventsContext } from "./wireEventsContext";

export function wireEventsDomSettingsAi(signal: AbortSignal): void {
  wireSettingsAiDomListeners(signal, wireEventsContext().AI_PREFS_IMMEDIATE_CHECKBOX_IDS);
}
