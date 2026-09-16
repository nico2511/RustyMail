import { invoke } from "@tauri-apps/api/core";
import type { InboxFilterHit } from "../../hashAutocomplete";
import { navReset } from "../../navigation";
import { parseSearchBarDraft } from "../../searchBarParse";
import { isSavedDraftsVirtualMailbox, threadMailboxListLabel } from "../../mailboxKinds";
import type { State, Tag } from "../types";
import { BOOT_INVOKE_TIMEOUT_MS } from "../core/timeouts";
import { tagToSearchDraft } from "../lib/threadTagsModal";
import { tagFamilyForInvoke } from "../lib/tagFamilyForInvoke";
import { currentAccount } from "../core/accountContext";
import { safeInvoke, tauriErrorMessage, withTimeout } from "../lib/tauriCommand";
import { isTauriRuntime } from "../lib/tauriRuntime";
import { toast } from "../lib/toast";
import { render } from "../dispatch";
import { state } from "../state";
import {
  applyParsedSearchBarToState,
  applySearchBarQuery,
  hasSearchBarCriteria,
  mergeSearchBarTag,
  resetManualSearchNlFilters,
  resetSearchStructuralModifiers,
  toastSearchBarResult,
} from "./searchCommitQuery";
import { searchThreads } from "./searchThreadsRun";

export type SearchLaunchDeps = {
  clearThreadAiSummaryState: () => void;
  resolveSearchMailboxPath: (requested: string) => string | null;
  ensureValidSelectedMailbox: () => void;
  refreshSearchTagCatalog: () => Promise<void>;
};

let searchLaunchDeps: SearchLaunchDeps | null = null;

export function registerSearchLaunchDeps(deps: SearchLaunchDeps): void {
  searchLaunchDeps = deps;
}

function launchDeps(): SearchLaunchDeps {
  if (!searchLaunchDeps) throw new Error("registerSearchLaunchDeps not called");
  return searchLaunchDeps;
}

export function launchTagMailSearch(tag: Tag): void {
  const d = launchDeps();
  const draft = tagToSearchDraft(tag);
  if (!draft) {
    toast("Ce tag n’est pas utilisable pour la recherche.");
    return;
  }
  navReset();
  state.view = "list";
  state.threadTagsModalOpen = false;
  state.searchModalOpen = false;
  state.searchAccountOverrideId = null;
  state.searchMailboxPath = null;
  state.searchTags = [];
  state.searchNewsletterRule = null;
  state.searchLanguageFilter = null;
  state.searchSenders = [];
  state.search = "";
  state.searchDraft = draft;
  state.listFilter = "all";
  state.searchNlMode = null;
  state.searchScope = "account";
  state.searchModifiersTouched = true;
  d.clearThreadAiSummaryState();
  document.querySelectorAll<HTMLInputElement>("#search-input, #search-modal-input").forEach((el) => {
    el.value = draft;
  });
  resetSearchStructuralModifiers();
  applyParsedSearchBarToState(parseSearchBarDraft(draft, state.newsletterRules));
  render();
  void searchThreads();
}

export function launchTagMailSearchFromRawFamily(family: string, value: string): void {
  launchTagMailSearch({ family: tagFamilyForInvoke(family), value });
}

export function launchContactMailSearch(opts: {
  email: string;
  listFilter?: State["listFilter"];
  text?: string;
  hybrid?: boolean;
}): void {
  const email = opts.email.trim().toLowerCase();
  if (!email) return;
  navReset();
  state.view = "list";
  state.searchModalOpen = false;
  state.searchAccountOverrideId = null;
  state.searchMailboxPath = null;
  state.searchTags = [];
  state.searchNewsletterRule = null;
  state.searchLanguageFilter = null;
  state.searchSenders = [email];
  state.search = opts.text?.trim() ?? "";
  state.searchDraft = state.search;
  state.listFilter = opts.listFilter ?? "all";
  state.searchNlMode = opts.hybrid ? "hybrid" : null;
  state.searchScope = "account";
  state.searchModifiersTouched = true;
  state.selectedContactEmail = undefined;
  render();
  void searchThreads();
}

export async function launchDomainMailSearch(domain: string): Promise<void> {
  const dom = domain.trim().toLowerCase().replace(/^@+/, "");
  if (!dom) return;
  const acc = currentAccount();
  if (!acc?.id || !isTauriRuntime()) {
    toast("Recherche domaine : compte ou Tauri requis.");
    return;
  }
  try {
    const senders = await invoke<string[]>("list_sender_emails_for_domain_cmd", {
      accountId: acc.id,
      domain: dom,
    });
    const emails = (senders ?? []).map((s) => s.trim().toLowerCase()).filter((s) => s.includes("@"));
    if (!emails.length) {
      toast(`Aucun expéditeur local pour @${dom}.`);
      return;
    }
    navReset();
    state.view = "list";
    state.searchModalOpen = false;
    state.searchAccountOverrideId = null;
    state.searchMailboxPath = null;
    state.searchTags = [];
    state.searchNewsletterRule = null;
    state.searchLanguageFilter = null;
    state.searchSenders = emails;
    state.search = "";
    state.searchDraft = "";
    state.listFilter = "all";
    state.searchNlMode = null;
    state.searchScope = "account";
    state.searchModifiersTouched = true;
    state.selectedContactEmail = undefined;
    render();
    void searchThreads();
  } catch (e) {
    toast(tauriErrorMessage(e));
  }
}

export function applyHashAutocompleteHitToState(hit: InboxFilterHit): void {
  const d = launchDeps();
  state.searchModifiersTouched = true;
  const searchIn = document.querySelector<HTMLInputElement>("#search-input");
  if (searchIn) state.searchDraft = searchIn.value;

  if (hit.id.startsWith("mailbox:")) {
    const raw = hit.id.slice(8);
    state.searchMailboxPath = d.resolveSearchMailboxPath(raw) ?? raw;
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

export async function applyInboxFilterFromHashHit(hit: InboxFilterHit): Promise<void> {
  const d = launchDeps();
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
    d.ensureValidSelectedMailbox();
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
