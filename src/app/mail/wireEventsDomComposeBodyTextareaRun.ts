// @ts-nocheck — DOM wiring; tighten types incrementally.
import { wireEventsDomComposeBodyInput } from "./wireEventsDomComposeBodyInputRun";
import { wireEventsDomComposeBodyMarkdownShortcuts } from "./wireEventsDomComposeBodyMarkdownShortcutsRun";
import { wireEventsDomComposeBodyPaste } from "./wireEventsDomComposeBodyPasteRun";

export function wireEventsDomComposeBodyTextarea(signal: AbortSignal): void {
  wireEventsDomComposeBodyInput(signal);
  wireEventsDomComposeBodyPaste(signal);
  wireEventsDomComposeBodyMarkdownShortcuts(signal);
}
