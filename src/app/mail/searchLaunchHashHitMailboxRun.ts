import type { InboxFilterHit } from "../../hashAutocomplete";
import { BOOT_INVOKE_TIMEOUT_MS } from "../core/timeouts";
import { safeInvoke } from "../lib/tauriCommand";
import { toast } from "../lib/toast";
import { state } from "../state";
import { ensureValidSelectedMailbox } from "./accountDefaultPrefs";
import { requireSearchLaunchDeps } from "./searchLaunchContext";
import { applySearchBarIfCriteriaAndRender } from "./searchLaunchHashHitRefreshRun";

export async function tryApplyHashHitMailboxOrAccount(hit: InboxFilterHit): Promise<boolean> {
  if (hit.id.startsWith("mailbox:")) {
    toast(`Dossier : ${state.searchMailboxPath}`);
    await applySearchBarIfCriteriaAndRender();
    return true;
  }
  if (hit.id.startsWith("account:")) {
    const id = hit.id.slice(8);
    state.mailboxes = await safeInvoke<string[]>("list_imap_mailboxes", { accountId: id }, [], BOOT_INVOKE_TIMEOUT_MS);
    ensureValidSelectedMailbox();
    const acc = state.accounts.find((a) => a.id === id);
    toast(`Compte : ${acc?.email ?? id}`);
    void requireSearchLaunchDeps().refreshSearchTagCatalog();
    await applySearchBarIfCriteriaAndRender();
    return true;
  }
  return false;
}
