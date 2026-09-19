// @ts-nocheck — DOM wiring; tighten types incrementally.
import { syncSearchBarChrome } from "./searchBarUi";
import { refreshSearchTagCatalog } from "./searchTagCatalog";
import { state } from "../state";

export function wireSearchBarDraftListeners(searchInputEl: HTMLInputElement, signal: AbortSignal): void {
  searchInputEl.addEventListener(
    "focus",
    () => {
      void refreshSearchTagCatalog();
    },
    { signal },
  );
  searchInputEl.addEventListener(
    "input",
    (event) => {
      state.searchDraft = (event.currentTarget as HTMLInputElement).value;
      syncSearchBarChrome();
      if (/#(?:tag|source|kind|entity|state)/i.test(state.searchDraft)) {
        void refreshSearchTagCatalog();
      }
    },
    { signal },
  );
}
