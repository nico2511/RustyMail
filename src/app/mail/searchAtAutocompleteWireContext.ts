import type { ComposeRecipientChipsHandle } from "../../composeRecipientChips";

export type SearchAtAutocompleteWireDeps = {
  composeChipsHandle: (field: "to" | "cc" | "bcc") => ComposeRecipientChipsHandle | null;
  scheduleDraftRevisionSave: () => void;
};

let wireDeps: SearchAtAutocompleteWireDeps | null = null;

export function registerSearchAtAutocompleteWireDeps(deps: SearchAtAutocompleteWireDeps): void {
  wireDeps = deps;
}

export function requireSearchAtAutocompleteWireDeps(): SearchAtAutocompleteWireDeps {
  if (!wireDeps) throw new Error("registerSearchAtAutocompleteWireDeps not called");
  return wireDeps;
}
