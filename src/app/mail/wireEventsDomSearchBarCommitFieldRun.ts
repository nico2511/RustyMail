// @ts-nocheck — DOM wiring; tighten types incrementally.
import { isAtAutocompletePanelOpen } from "../../atAutocomplete";
import { isHashAutocompletePanelOpen } from "../../hashAutocomplete";
import { commitSearchQuery } from "./searchCommitQuery";

export function wireSearchBarCommitListeners(
  searchInputEl: HTMLInputElement,
  fromModal: boolean,
  signal: AbortSignal,
): void {
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
