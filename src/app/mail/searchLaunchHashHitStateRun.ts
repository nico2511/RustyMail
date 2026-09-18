import type { InboxFilterHit } from "../../hashAutocomplete";
import { state } from "../state";
import { mergeSearchBarTag } from "./searchCommitQuery";
import { resolveSearchMailboxPath } from "./searchMailboxResolve";

export function applyHashAutocompleteHitToState(hit: InboxFilterHit): void {
  state.searchModifiersTouched = true;
  const searchIn = document.querySelector<HTMLInputElement>("#search-input");
  if (searchIn) state.searchDraft = searchIn.value;

  if (hit.id.startsWith("mailbox:")) {
    const raw = hit.id.slice(8);
    state.searchMailboxPath = resolveSearchMailboxPath(raw) ?? raw;
    state.searchScope = "mailbox";
    return;
  }
  if (hit.id.startsWith("account:")) {
    const id = hit.id.slice(8);
    state.searchAccountOverrideId = id;
    state.selectedAccountId = id;
    state.searchScope = "account";
    return;
  }
  if (hit.id.startsWith("tag:")) {
    const body = hit.id.slice(4);
    const sep = body.indexOf("\0");
    if (sep >= 0) {
      mergeSearchBarTag({ family: body.slice(0, sep), value: body.slice(sep + 1) });
    }
    return;
  }
  if (hit.id === "scope:account") {
    state.searchScope = "account";
    state.searchMailboxPath = null;
    return;
  }
  if (hit.id === "scope:mailbox") {
    state.searchScope = "mailbox";
    state.searchMailboxPath = null;
  }
}
