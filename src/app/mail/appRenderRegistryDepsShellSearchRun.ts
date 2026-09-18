/** Search / saved-view helpers for shell `RenderDeps`. */
import type { RenderDeps } from "../ui/render/renderDeps";
import { effectiveSearchMailboxPath, isSearchActive } from "./searchQueryContext";
import { searchDraftDiffersFromCommitted } from "./searchCommitQuery";
import {
  activeSavedSearchItem,
  canSaveSearchView,
  canSaveSearchViewInModal,
  inboxSearchContextActive,
  searchViewCanAffinerFlux,
  searchViewCanOpenOrganizer,
} from "./searchViewContext";

export function buildShellSearchRenderDepsFragment(): Pick<
  RenderDeps,
  | "effectiveSearchMailboxPath"
  | "inboxSearchContextActive"
  | "canSaveSearchView"
  | "canSaveSearchViewInModal"
  | "searchDraftDiffersFromCommitted"
  | "activeSavedSearchItem"
  | "searchViewCanOpenOrganizer"
  | "searchViewCanAffinerFlux"
  | "isSearchActive"
> {
  return {
    effectiveSearchMailboxPath,
    inboxSearchContextActive,
    canSaveSearchView,
    canSaveSearchViewInModal,
    searchDraftDiffersFromCommitted,
    activeSavedSearchItem,
    searchViewCanOpenOrganizer,
    searchViewCanAffinerFlux,
    isSearchActive,
  };
}
