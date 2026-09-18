import { attachAtAutocomplete } from "../../atAutocomplete";
import { attachHashAutocomplete } from "../../hashAutocomplete";
import { isAiFeatureEnabled } from "../../aiFeatures";
import { currentAccount } from "../core/accountContext";
import { state } from "../state";
import { syncSearchBarChrome } from "./searchBarUi";
import { applyHashAutocompleteHitToState } from "./searchLaunchQueries";
import { refreshSearchTagCatalog } from "./searchTagCatalog";

export function wireSearchAtAutocompleteFields(detachers: Array<() => void>): void {
  const accountId = currentAccount()?.id;
  const addressAutocompleteOn = () =>
    isAiFeatureEnabled(state.appPrefs.ai, "featureAddressAutocompleteEnabled");
  document.querySelectorAll<HTMLInputElement>("#search-input, #search-modal-input").forEach((searchIn) => {
    detachers.push(
      attachAtAutocomplete({
        input: searchIn,
        accountId,
        mode: "search",
        isTauri: true,
        isFeatureEnabled: addressAutocompleteOn,
        onSearchPick: () => {
          state.searchDraft = searchIn.value;
          syncSearchBarChrome();
        },
      }),
    );
    detachers.push(
      attachHashAutocomplete({
        input: searchIn,
        getNewsletterRules: () => state.newsletterRules,
        getMailboxes: () => state.mailboxes,
        getAccounts: () =>
          state.accounts.map((a) => ({
            id: a.id,
            email: a.email,
            displayName: a.displayName,
          })),
        getTags: () =>
          state.searchTagCatalog.map((t) => ({
            family: String(t.family).toLowerCase(),
            value: t.value,
          })),
        onPrefetchTags: () => refreshSearchTagCatalog(),
        onApplyHit: (hit) => {
          applyHashAutocompleteHitToState(hit);
          syncSearchBarChrome();
        },
      }),
    );
  });
  if (document.querySelector("#search-input, #search-modal-input")) {
    void refreshSearchTagCatalog();
  }
}
