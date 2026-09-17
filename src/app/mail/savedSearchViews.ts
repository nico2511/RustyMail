import {
  clearSuggestionShownKeys,
  dismissViewSuggestionCmd,
  listSuggestedSavedViewsCmd,
  markSuggestionShownOnce,
  recordActivity,
  recordActivityImmediate,
} from "../../activity";
import { buildSearchQueryPayload } from "../../searchQueryBuild";
import { applySavedSearchToState, buildSavedSearchUiState, buildSavedSearchUpsert } from "../../savedSearchApply";
import {
  applySavedSearchCmd,
  deleteSavedSearchCmd,
  listSavedSearchesCmd,
  markSavedSearchSeenCmd,
  upsertSavedSearchCmd,
} from "../../savedSearches";
import { parseSearchBarDraft } from "../../searchBarParse";
import {
  hasSavableSearchCriteria,
  searchCriteriaSnapshotsEqual,
} from "../../searchQueryState";
import type { NewsletterRuleRow } from "../types";
import { currentAccount } from "../core/accountContext";
import { formatNewsletterRuleInput } from "../lib/newsletterRuleFormat";
import { tauriErrorMessage } from "../lib/tauriCommand";
import { isTauriRuntime } from "../lib/tauriRuntime";
import { toast } from "../lib/toast";
import { openConfirmModal } from "../modals/promptConfirm";
import { render } from "../dispatch";
import { state } from "../state";
import {
  applyParsedSearchBarToState,
  draftSearchCriteriaSnapshot,
  resetSearchStructuralModifiers,
  searchDraftDiffersFromCommitted,
} from "./searchCommitQuery";
import {
  buildSearchQueryFromCurrentState,
  committedSearchCriteriaSnapshot,
  searchAccountIdForQuery,
} from "./searchQueryContext";
import { canSaveSearchView } from "./searchViewContext";
import { searchThreads } from "./searchThreadsRun";
import { activityTrackingEnabled } from "./threadActivityTracking";

export type SavedSearchViewsDeps = {
  resolveSearchMailboxPath: (requested: string) => string | null;
};

let savedSearchViewsDeps: SavedSearchViewsDeps | null = null;

export function registerSavedSearchViewsDeps(deps: SavedSearchViewsDeps): void {
  savedSearchViewsDeps = deps;
}

function deps(): SavedSearchViewsDeps {
  if (!savedSearchViewsDeps) throw new Error("registerSavedSearchViewsDeps not called");
  return savedSearchViewsDeps;
}

export function patchSavedSearchNewCount(id: string, count: number, lastSeenAt?: string): void {
  const seen = lastSeenAt ?? new Date().toISOString();
  state.savedSearches = state.savedSearches.map((s) =>
    s.id === id ? { ...s, newCount: count, lastSeenAt: seen } : s,
  );
}

function syncCommitSearchDraftForSave(): void {
  if (!searchDraftDiffersFromCommitted()) return;
  const draftSnap = draftSearchCriteriaSnapshot();
  if (!hasSavableSearchCriteria(draftSnap)) return;
  if (searchCriteriaSnapshotsEqual(draftSnap, committedSearchCriteriaSnapshot())) return;
  const raw = state.searchDraft.trim();
  const parsed = parseSearchBarDraft(raw, state.newsletterRules);
  resetSearchStructuralModifiers();
  applyParsedSearchBarToState(parsed);
  state.search = parsed.text;
  state.searchModifiersTouched = false;
}

function suggestSavedSearchName(): string {
  if (state.searchTags.length === 1) {
    const t = state.searchTags[0]!;
    return `#${String(t.family).toLowerCase()}:${t.value}`.slice(0, 100);
  }
  if (state.searchSenders.length === 1) return state.searchSenders[0]!.slice(0, 100);
  const q = state.search.trim();
  if (q) return q.slice(0, 100);
  if (state.searchNewsletterRule) return formatNewsletterRuleInput(state.searchNewsletterRule).slice(0, 100);
  return "Ma vue";
}

function findNewsletterRuleByParts(domain: string, localPart: string | null): NewsletterRuleRow | null {
  const dom = domain.trim().toLowerCase();
  if (!dom) return null;
  const lp = (localPart?.trim() || "*").toLowerCase();
  const hit = state.newsletterRules.find(
    (r) => r.domain.toLowerCase() === dom && (r.localPart ?? "*").toLowerCase() === lp,
  );
  if (hit) return hit;
  return { domain: dom, localPart: lp };
}

export async function refreshSavedSearches(includeCounts = true): Promise<void> {
  if (!isTauriRuntime()) {
    state.savedSearches = [];
    return;
  }
  const accountId = currentAccount()?.id?.trim();
  if (!accountId) {
    state.savedSearches = [];
    state.activeSavedSearchId = null;
    return;
  }
  try {
    state.savedSearches = await listSavedSearchesCmd(accountId, includeCounts);
    if (state.activeSavedSearchId && !state.savedSearches.some((s) => s.id === state.activeSavedSearchId)) {
      state.activeSavedSearchId = null;
    }
  } catch (e) {
    console.warn("list_saved_searches", e);
  }
}

export async function markActiveSavedSearchSeen(options?: { toast?: boolean }): Promise<boolean> {
  const accountId = currentAccount()?.id?.trim();
  const sid = state.activeSavedSearchId;
  if (!accountId || !sid) {
    if (options?.toast !== false) toast("Aucune vue active à marquer.");
    return false;
  }
  if (state.savedSearchMarkingSeenId === sid) return false;
  state.savedSearchMarkingSeenId = sid;
  try {
    patchSavedSearchNewCount(sid, 0);
    render();
    const updated = await markSavedSearchSeenCmd(accountId, sid);
    patchSavedSearchNewCount(sid, 0, updated.lastSeenAt ?? undefined);
    recordActivity({ eventType: "saved_view_seen", metaJson: JSON.stringify({ savedSearchId: sid }) });
    await refreshSavedSearches(true);
    const row = state.savedSearches.find((s) => s.id === sid);
    if (row && (row.newCount ?? 0) > 0) patchSavedSearchNewCount(sid, 0, updated.lastSeenAt ?? undefined);
    if (options?.toast) toast("Vue marquée à jour.");
    render();
    return true;
  } catch (e) {
    await refreshSavedSearches(true);
    render();
    toast(tauriErrorMessage(e));
    return false;
  } finally {
    state.savedSearchMarkingSeenId = null;
  }
}

export async function saveCurrentSearchView(): Promise<void> {
  const d = deps();
  if (!isTauriRuntime()) {
    toast("Vues enregistrées : disponible dans l’app Tauri.");
    return;
  }
  const accountId = searchAccountIdForQuery();
  if (!accountId) {
    toast("Choisissez un compte avant d’enregistrer une vue.");
    return;
  }
  syncCommitSearchDraftForSave();
  if (!canSaveSearchView()) {
    toast("Lancez d’abord la recherche (Entrée), puis enregistrez la vue.");
    return;
  }
  const defaultName = suggestSavedSearchName();
  const name = window.prompt("Nom de la vue enregistrée", defaultName);
  if (name === null) return;
  const trimmed = name.trim();
  if (!trimmed) {
    toast("Nom de vue invalide.");
    return;
  }
  const iconRaw = window.prompt("Icône courte (2–4 caractères)", "Vu");
  if (iconRaw === null) return;
  const icon = (iconRaw.trim() || "Vu").slice(0, 4);
  const query = buildSearchQueryFromCurrentState();
  const ui = buildSavedSearchUiState({
    listFilter: state.listFilter,
    searchScope: state.searchScope,
    searchNlMode: state.searchNlMode,
    searchDraft: state.searchDraft,
    searchNewsletterRule: state.searchNewsletterRule,
    searchModifiersTouched: state.searchModifiersTouched,
  });
  try {
    const saved = await upsertSavedSearchCmd(
      buildSavedSearchUpsert(accountId, trimmed, query, ui, { icon }),
    );
    state.activeSavedSearchId = saved.id;
    await markSavedSearchSeenCmd(accountId, saved.id);
    recordActivity({ eventType: "saved_view_created", metaJson: JSON.stringify({ savedSearchId: saved.id }) });
    toast(`Vue « ${trimmed} » enregistrée — surveillance à jour.`);
    await refreshSavedSearches(true);
    await refreshSuggestedSavedViews();
    render();
  } catch (e) {
    toast(tauriErrorMessage(e));
  }
}

export async function refreshSuggestedSavedViews(): Promise<void> {
  const d = deps();
  if (!isTauriRuntime() || !activityTrackingEnabled()) {
    state.suggestedSavedViews = [];
    clearSuggestionShownKeys();
    return;
  }
  const accountId = currentAccount()?.id?.trim();
  if (!accountId) {
    state.suggestedSavedViews = [];
    clearSuggestionShownKeys();
    return;
  }
  try {
    state.suggestedSavedViews = await listSuggestedSavedViewsCmd(accountId);
    for (const s of state.suggestedSavedViews) {
      markSuggestionShownOnce(`${accountId}:${s.senderEmail}`, () => {
        recordActivity({
          eventType: "suggestion_shown",
          senderEmail: s.senderEmail,
          metaJson: JSON.stringify({ cardKind: "saved_view" }),
        });
      });
    }
  } catch (e) {
    console.warn("list_suggested_saved_views", e);
    state.suggestedSavedViews = [];
  }
}

export async function acceptSuggestedSavedView(senderEmail: string): Promise<void> {
  const accountId = currentAccount()?.id?.trim();
  if (!accountId) return;
  const item = state.suggestedSavedViews.find(
    (s) => s.senderEmail.toLowerCase() === senderEmail.trim().toLowerCase(),
  );
  if (!item) return;
  recordActivityImmediate({
    eventType: "suggestion_clicked",
    senderEmail: item.senderEmail,
    metaJson: JSON.stringify({ cardKind: "saved_view", action: "accept" }),
  });
  const query = buildSearchQueryPayload({
    search: `@${item.senderEmail}`,
    searchTags: [],
    searchSenders: [item.senderEmail],
    searchNlMode: null,
    searchLanguageFilter: null,
    accountId,
    mailbox: null,
    semanticSearchEnabled: Boolean(state.appPrefs.ai?.semanticSearchEnabled),
    semanticModelAvailable: Boolean(state.semanticModelAvailable),
  });
  const ui = buildSavedSearchUiState({
    listFilter: "all",
    searchScope: "account",
    searchNlMode: null,
    searchDraft: `@${item.senderEmail}`,
    searchNewsletterRule: null,
    searchModifiersTouched: true,
  });
  try {
    const saved = await upsertSavedSearchCmd(
      buildSavedSearchUpsert(accountId, item.suggestedName, query, ui),
    );
    await dismissViewSuggestionCmd(accountId, item.senderEmail, "accepted");
    state.activeSavedSearchId = saved.id;
    toast(`Vue « ${item.suggestedName} » enregistrée.`);
    await refreshSavedSearches(true);
    await refreshSuggestedSavedViews();
    render();
  } catch (e) {
    toast(tauriErrorMessage(e));
  }
}

export async function dismissSuggestedSavedView(
  senderEmail: string,
  decision: "dismiss" | "snooze",
): Promise<void> {
  const accountId = currentAccount()?.id?.trim();
  if (!accountId) return;
  recordActivityImmediate({
    eventType: "suggestion_clicked",
    senderEmail,
    metaJson: JSON.stringify({ cardKind: "saved_view", action: decision }),
  });
  try {
    await dismissViewSuggestionCmd(accountId, senderEmail, decision);
    await refreshSuggestedSavedViews();
    render();
  } catch (e) {
    toast(tauriErrorMessage(e));
  }
}

export async function applySavedSearchView(id: string): Promise<void> {
  const d = deps();
  if (!isTauriRuntime()) return;
  const accountId = currentAccount()?.id?.trim();
  if (!accountId) {
    toast("Compte requis pour ouvrir une vue.");
    return;
  }
  try {
    const saved = await applySavedSearchCmd(accountId, id);
    state.activeSavedSearchId = saved.id;
    state.view = "list";
    state.selectedContactEmail = undefined;
    await markSavedSearchSeenCmd(accountId, saved.id);
    applySavedSearchToState(saved, state, {
      findNewsletterRule: findNewsletterRuleByParts,
      resolveMailboxPath: d.resolveSearchMailboxPath,
    });
    if (saved.query.accountId?.trim()) {
      state.selectedAccountId = saved.query.accountId.trim();
    }
    document.querySelectorAll<HTMLInputElement>("#search-input, #search-modal-input").forEach((el) => {
      el.value = state.searchDraft;
    });
    await searchThreads();
    recordActivity({ eventType: "saved_view_applied", metaJson: JSON.stringify({ savedSearchId: saved.id }) });
    await refreshSavedSearches(true);
    await refreshSuggestedSavedViews();
    render();
  } catch (e) {
    toast(tauriErrorMessage(e));
  }
}

export async function deleteSavedSearchView(id: string): Promise<void> {
  const accountId = currentAccount()?.id?.trim();
  if (!accountId || !id.trim()) return;
  const item = state.savedSearches.find((s) => s.id === id);
  const ok = await openConfirmModal({
    title: "Supprimer la vue ?",
    body: item ? `« ${item.name} » sera retirée de la sidebar.` : "Cette vue sera supprimée.",
    danger: true,
    confirmLabel: "Supprimer",
  });
  if (!ok) return;
  try {
    await deleteSavedSearchCmd(accountId, id);
    if (state.activeSavedSearchId === id) state.activeSavedSearchId = null;
    toast("Vue supprimée.");
    await refreshSavedSearches(true);
    render();
  } catch (e) {
    toast(tauriErrorMessage(e));
  }
}
