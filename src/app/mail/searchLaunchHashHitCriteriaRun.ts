import type { InboxFilterHit } from "../../hashAutocomplete";
import { threadMailboxListLabel } from "../../mailboxKinds";
import { toast } from "../lib/toast";
import { render } from "../dispatch";
import { state } from "../state";
import { applySearchBarIfCriteriaAndRender } from "./searchLaunchHashHitRefreshRun";

export async function tryApplyHashHitTagOrScope(hit: InboxFilterHit): Promise<boolean> {
  if (hit.id.startsWith("tag:")) {
    const body = hit.id.slice(4);
    const sep = body.indexOf("\0");
    if (sep >= 0) {
      toast(`Tag : ${body.slice(0, sep)}:${body.slice(sep + 1)}`);
      await applySearchBarIfCriteriaAndRender();
    } else {
      render();
    }
    return true;
  }
  if (hit.id.startsWith("scope:")) {
    toast(
      state.searchScope === "account"
        ? "Portée : tout le compte (tous dossiers synchronisés)"
        : `Portée : ${threadMailboxListLabel(state.selectedMailbox || "INBOX").full}`,
    );
    await applySearchBarIfCriteriaAndRender();
    return true;
  }
  return false;
}
