// @ts-nocheck — DOM wiring; tighten types incrementally.
import { wireSearchBarInputElement } from "./wireEventsDomSearchBarFieldRun";

export function wireEventsDomSearchBar(signal: AbortSignal): void {
  document.querySelectorAll<HTMLInputElement>("#search-input, #search-modal-input").forEach((searchInputEl) => {
    const fromModal = searchInputEl.id === "search-modal-input";
    wireSearchBarInputElement(searchInputEl, fromModal, signal);
  });
}
