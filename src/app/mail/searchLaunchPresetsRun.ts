import { invoke } from "@tauri-apps/api/core";

import { navReset } from "../../navigation";
import { parseSearchBarDraft } from "../../searchBarParse";
import type { State, Tag } from "../types";
import { tagToSearchDraft } from "../lib/threadTagsModal";
import { tagFamilyForInvoke } from "../lib/tagFamilyForInvoke";
import { currentAccount } from "../core/accountContext";
import { tauriErrorMessage } from "../lib/tauriCommand";
import { isTauriRuntime } from "../lib/tauriRuntime";
import { toast } from "../lib/toast";
import { render } from "../dispatch";
import { state } from "../state";
import {
  applyParsedSearchBarToState,
  resetSearchStructuralModifiers,
} from "./searchCommitQuery";
import { requireSearchLaunchDeps } from "./searchLaunchContext";
import { searchThreads } from "./searchThreadsRun";

export function launchTagMailSearch(tag: Tag): void {
  const d = requireSearchLaunchDeps();
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
