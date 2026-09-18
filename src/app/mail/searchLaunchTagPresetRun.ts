import { navReset } from "../../navigation";
import { parseSearchBarDraft } from "../../searchBarParse";
import type { Tag } from "../types";
import { tagToSearchDraft } from "../lib/threadTagsModal";
import { tagFamilyForInvoke } from "../lib/tagFamilyForInvoke";
import { toast } from "../lib/toast";
import { render } from "../dispatch";
import { state } from "../state";
import {
  applyParsedSearchBarToState,
  resetSearchStructuralModifiers,
} from "./searchCommitQuery";
import { requireSearchLaunchDeps } from "./searchLaunchContext";
import { searchThreads } from "./searchThreadsRun";

export function launchTagMailSearch(tag: Tag): void {
  const d = requireSearchLaunchDeps();
  const draft = tagToSearchDraft(tag);
  if (!draft) {
    toast("Ce tag n’est pas utilisable pour la recherche.");
    return;
  }
  navReset();
  state.view = "list";
  state.threadTagsModalOpen = false;
  state.searchModalOpen = false;
  state.searchAccountOverrideId = null;
  state.searchMailboxPath = null;
  state.searchTags = [];
  state.searchNewsletterRule = null;
  state.searchLanguageFilter = null;
  state.searchSenders = [];
  state.search = "";
  state.searchDraft = draft;
  state.listFilter = "all";
  state.searchNlMode = null;
  state.searchScope = "account";
  state.searchModifiersTouched = true;
  d.clearThreadAiSummaryState();
  document.querySelectorAll<HTMLInputElement>("#search-input, #search-modal-input").forEach((el) => {
    el.value = draft;
  });
  resetSearchStructuralModifiers();
  applyParsedSearchBarToState(parseSearchBarDraft(draft, state.newsletterRules));
  render();
  void searchThreads();
}

export function launchTagMailSearchFromRawFamily(family: string, value: string): void {
  launchTagMailSearch({ family: tagFamilyForInvoke(family), value });
}
