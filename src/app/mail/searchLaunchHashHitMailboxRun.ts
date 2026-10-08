import type { InboxFilterHit } from "../../hashAutocomplete";
import { toast } from "../lib/toast";
import { state } from "../state";
import { ensureValidSelectedMailbox } from "./accountDefaultPrefs";
import { refreshMailboxes } from "./refreshMailboxesRun";
import { requireSearchLaunchDeps } from "./searchLaunchContext";
import { applySearchBarIfCriteriaAndRender } from "./searchLaunchHashHitRefreshRun";

export async function tryApplyHashHitMailboxOrAccount(hit: InboxFilterHit): Promise<boolean> {
  if (hit.id.startsWith("mailbox:")) {
    toast.info(`Dossier : ${state.searchMailboxPath}`);
    await applySearchBarIfCriteriaAndRender();
    return true;
  }
  if (hit.id.startsWith("account:")) {
    const id = hit.id.slice(8);
    await refreshMailboxes(id);
    ensureValidSelectedMailbox();
    const acc = state.accounts.find((a) => a.id === id);
    toast.info(`Compte : ${acc?.email ?? id}`);
    void requireSearchLaunchDeps().refreshSearchTagCatalog();
    await applySearchBarIfCriteriaAndRender();
    return true;
  }
  return false;
}
