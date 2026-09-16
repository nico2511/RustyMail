import { attachAtAutocomplete } from "../../atAutocomplete";
import { attachHashAutocomplete } from "../../hashAutocomplete";
import { isAiFeatureEnabled } from "../../aiFeatures";
import type { ComposeRecipientChipsHandle } from "../../composeRecipientChips";
import { currentAccount } from "../core/accountContext";
import { isTauriRuntime } from "../lib/tauriRuntime";
import { state } from "../state";
import { syncSearchBarChrome } from "./searchBarUi";
import { applyHashAutocompleteHitToState } from "./searchLaunchQueries";
import { refreshSearchTagCatalog } from "./searchTagCatalog";

export type SearchAtAutocompleteWireDeps = {
  composeChipsHandle: (field: "to" | "cc" | "bcc") => ComposeRecipientChipsHandle | null;
  scheduleDraftRevisionSave: () => void;
};

let wireDeps: SearchAtAutocompleteWireDeps | null = null;
let atAutocompleteDetach: (() => void) | null = null;

export function registerSearchAtAutocompleteWireDeps(deps: SearchAtAutocompleteWireDeps): void {
  wireDeps = deps;
}

function autocompleteWireDeps(): SearchAtAutocompleteWireDeps {
  if (!wireDeps) throw new Error("registerSearchAtAutocompleteWireDeps not called");
  return wireDeps;
}

export function wireAtAutocompleteFields(): void {
  atAutocompleteDetach?.();
  atAutocompleteDetach = null;
  if (!isTauriRuntime()) return;
  const d = autocompleteWireDeps();
  const accountId = currentAccount()?.id;
  const addressAutocompleteOn = () =>
    isAiFeatureEnabled(state.appPrefs.ai, "featureAddressAutocompleteEnabled");
  const detachers: Array<() => void> = [];
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
  const chipSpecs: Array<{
    host: string;
    field: "to" | "cc" | "bcc";
  }> = [
    { host: "#compose-to-host", field: "to" },
    { host: "#compose-cc-host", field: "cc" },
    { host: "#compose-bcc-host", field: "bcc" },
  ];
  for (const spec of chipSpecs) {
    const el = document
      .querySelector<HTMLElement>(spec.host)
      ?.querySelector<HTMLInputElement>(".compose-recipients-input");
    if (!el) continue;
    detachers.push(
      attachAtAutocomplete({
        input: el,
        accountId,
        mode: "compose",
        isTauri: true,
        isFeatureEnabled: addressAutocompleteOn,
        composeChipMode: true,
        onComposePick: (email, displayName) => {
          const handle = d.composeChipsHandle(spec.field);
          handle?.addRecipient(email, displayName);
          if (state.draft) {
            state.draft[spec.field] = handle?.getRecipients() ?? state.draft[spec.field];
          }
          d.scheduleDraftRevisionSave();
        },
      }),
    );
  }
  const composeBody = document.querySelector<HTMLTextAreaElement>("#compose-body");
  if (composeBody) {
    detachers.push(
      attachAtAutocomplete({
        input: composeBody,
        accountId,
        mode: "mention",
        isTauri: true,
        isFeatureEnabled: addressAutocompleteOn,
        onMentionPick: () => {
          d.scheduleDraftRevisionSave();
        },
      }),
    );
  }
  if (detachers.length) {
    atAutocompleteDetach = () => {
      for (const detach of detachers) detach();
    };
  }
}
