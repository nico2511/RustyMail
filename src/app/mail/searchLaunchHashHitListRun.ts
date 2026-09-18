import type { InboxFilterHit } from "../../hashAutocomplete";
import type { State } from "../types";
import { render } from "../dispatch";
import { state } from "../state";
import { applySearchBarQuery, resetManualSearchNlFilters, toastSearchBarResult } from "./searchCommitQuery";

export async function tryApplyHashHitListOrRule(hit: InboxFilterHit): Promise<boolean> {
  resetManualSearchNlFilters();
  state.searchSenders = [];
  state.search = "";
  state.searchDraft = "";
  if (hit.id.startsWith("list:")) {
    state.searchNewsletterRule = null;
    const kind = hit.id.slice(5) as State["listFilter"];
    state.listFilter = kind;
    await applySearchBarQuery();
    toastSearchBarResult();
    render();
    return true;
  }
  if (hit.id.startsWith("rule:")) {
    const body = hit.id.slice(5);
    const sep = body.indexOf("\0");
    if (sep < 0) return true;
    state.searchNewsletterRule = {
      domain: body.slice(0, sep),
      localPart: body.slice(sep + 1),
    };
    state.listFilter = "all";
    await applySearchBarQuery();
    toastSearchBarResult();
    render();
    return true;
  }
  return false;
}
