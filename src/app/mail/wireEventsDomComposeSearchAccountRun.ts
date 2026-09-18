// @ts-nocheck — DOM wiring; tighten types incrementally.
import { wireEventsDomAccountForm } from "./wireEventsDomAccountFormRun";
import { wireEventsDomComposeEditor } from "./wireEventsDomComposeEditorRun";
import { wireEventsDomSearchBar } from "./wireEventsDomSearchBarRun";

export function wireEventsDomComposeSearchAccount(signal: AbortSignal): void {
  wireEventsDomComposeEditor(signal);
  wireEventsDomSearchBar(signal);
  wireEventsDomAccountForm(signal);
}
