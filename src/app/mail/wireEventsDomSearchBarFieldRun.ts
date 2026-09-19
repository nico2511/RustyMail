// @ts-nocheck — DOM wiring; tighten types incrementally.
import { isAtAutocompletePanelOpen } from "../../atAutocomplete";
import { isHashAutocompletePanelOpen } from "../../hashAutocomplete";
import { commitSearchQuery } from "./searchCommitQuery";
import { syncSearchBarChrome } from "./searchBarUi";
import { refreshSearchTagCatalog } from "./searchTagCatalog";
import { state } from "../state";

export function wireSearchBarInputElement(
  searchInputEl: HTMLInputElement,
  fromModal: boolean,
  signal: AbortSignal,
): void {
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
  searchInputEl.addEventListener(
    "keydown",
    (event) => {
      if (event.key === "Tab") return;
      if (event.key !== "Enter") return;
      if (isHashAutocompletePanelOpen() || isAtAutocompletePanelOpen()) return;
      event.preventDefault();
      commitSearchQuery({ fromModal });
    },
    { signal },
  );
  searchInputEl.addEventListener(
    "search",
    () => {
      commitSearchQuery({ fromModal });
    },
    { signal },
  );
}
