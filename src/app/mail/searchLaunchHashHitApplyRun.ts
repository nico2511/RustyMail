import type { InboxFilterHit } from "../../hashAutocomplete";
import { isSavedDraftsVirtualMailbox, threadMailboxListLabel } from "../../mailboxKinds";
import type { State } from "../types";
import { BOOT_INVOKE_TIMEOUT_MS } from "../core/timeouts";
import { safeInvoke } from "../lib/tauriCommand";
import { toast } from "../lib/toast";
import { render } from "../dispatch";
import { state } from "../state";
import { ensureValidSelectedMailbox } from "./accountDefaultPrefs";
import {
  applySearchBarQuery,
  hasSearchBarCriteria,
  resetManualSearchNlFilters,
  toastSearchBarResult,
} from "./searchCommitQuery";
import { requireSearchLaunchDeps } from "./searchLaunchContext";
import { applyHashAutocompleteHitToState } from "./searchLaunchHashHitStateRun";

export async function applyInboxFilterFromHashHit(hit: InboxFilterHit): Promise<void> {
  const d = requireSearchLaunchDeps();
  if (isSavedDraftsVirtualMailbox(state.selectedMailbox)) return;
  applyHashAutocompleteHitToState(hit);
  if (hit.id.startsWith("mailbox:")) {
    toast(`Dossier : ${state.searchMailboxPath}`);
    if (hasSearchBarCriteria()) {
      await applySearchBarQuery();
      toastSearchBarResult();
    }
    render();
    return;
  }
  if (hit.id.startsWith("account:")) {
    const id = hit.id.slice(8);
    state.mailboxes = await safeInvoke<string[]>("list_imap_mailboxes", { accountId: id }, [], BOOT_INVOKE_TIMEOUT_MS);
    ensureValidSelectedMailbox();
    const acc = state.accounts.find((a) => a.id === id);
    toast(`Compte : ${acc?.email ?? id}`);
    void d.refreshSearchTagCatalog();
    if (hasSearchBarCriteria()) {
      await applySearchBarQuery();
      toastSearchBarResult();
    }
    render();
    return;
  }
  if (hit.id.startsWith("tag:")) {
    const body = hit.id.slice(4);
    const sep = body.indexOf("\0");
    if (sep >= 0) {
      toast(`Tag : ${body.slice(0, sep)}:${body.slice(sep + 1)}`);
      if (hasSearchBarCriteria()) {
        await applySearchBarQuery();
        toastSearchBarResult();
      }
    }
    render();
    return;
  }
  if (hit.id.startsWith("scope:")) {
    toast(
      state.searchScope === "account"
        ? "Portée : tout le compte (tous dossiers synchronisés)"
        : `Portée : ${threadMailboxListLabel(state.selectedMailbox || "INBOX").full}`,
    );
    if (hasSearchBarCriteria()) {
      await applySearchBarQuery();
      toastSearchBarResult();
    }
    render();
    return;
  }
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
    return;
  }
  if (hit.id.startsWith("rule:")) {
    const body = hit.id.slice(5);
    const sep = body.indexOf("\0");
    if (sep < 0) return;
    state.searchNewsletterRule = {
      domain: body.slice(0, sep),
      localPart: body.slice(sep + 1),
    };
    state.listFilter = "all";
    await applySearchBarQuery();
    toastSearchBarResult();
    render();
  }
}
