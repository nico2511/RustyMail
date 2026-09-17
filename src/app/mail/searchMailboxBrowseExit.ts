import { state } from "../state";

export function exitSearchModeForMailboxBrowse(): void {
  state.search = "";
  state.searchDraft = "";
  state.searchSenders = [];
  state.searchMailboxPath = null;
  state.searchAccountOverrideId = null;
  state.searchTags = [];
  state.searchNewsletterRule = null;
  state.searchLanguageFilter = null;
  state.searchNlMode = null;
  state.searchModifiersTouched = false;
  state.activeSavedSearchId = null;
  document.querySelectorAll<HTMLInputElement>("#search-input, #search-modal-input").forEach((el) => {
    el.value = "";
  });
}
