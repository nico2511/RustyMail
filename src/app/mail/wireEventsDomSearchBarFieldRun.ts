// @ts-nocheck — DOM wiring; tighten types incrementally.
import { wireSearchBarCommitListeners } from "./wireEventsDomSearchBarCommitFieldRun";
import { wireSearchBarDraftListeners } from "./wireEventsDomSearchBarDraftFieldRun";

export function wireSearchBarInputElement(
  searchInputEl: HTMLInputElement,
  fromModal: boolean,
  signal: AbortSignal,
): void {
  wireSearchBarDraftListeners(searchInputEl, signal);
  wireSearchBarCommitListeners(searchInputEl, fromModal, signal);
}
