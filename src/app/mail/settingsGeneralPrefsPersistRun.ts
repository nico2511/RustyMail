import { invoke } from "@tauri-apps/api/core";
import { t, setLocale } from "../../i18n";
import { clearSuggestionShownKeys } from "../../activity";
import { isSavedDraftsVirtualMailbox } from "../../mailboxKinds";
import { MAIL_ACTION_TIMEOUT_MS } from "../core/timeouts";
import { isTauriRuntime } from "../lib/tauriRuntime";
import { tauriErrorMessage, withTimeout } from "../lib/tauriCommand";
import { toast } from "../lib/toast";
import { render } from "../dispatch";
import { LIST_FILTER_VALUES } from "../lib/appUiConstants";
import { state } from "../state";
import type { State } from "../types";
import { applyListFilter } from "./mailListView";
import { isSearchActive } from "./searchQueryContext";
import { refreshSuggestedSavedViews } from "./savedSearchViews";
import {
  defaultListFilterFromPrefs,
  switchActiveAccount,
  syncActivityRecordingPrefs,
} from "./settingsWireActions";

export async function persistGeneralPrefsFromDom(): Promise<void> {
  if (!isTauriRuntime()) {
    toast("Enregistrement : lancez l’app Tauri.");
    return;
  }
  const sel = document.querySelector<HTMLSelectElement>("#prefs-mother-language");
  if (sel) {
    state.appPrefs.general.motherLanguage = sel.value.trim() || "fr";
    state.appPrefs.ai.draftLanguage = state.appPrefs.general.motherLanguage;
    setLocale(state.appPrefs.general.motherLanguage);
  }
  const globalCb = document.querySelector<HTMLInputElement>("#prefs-address-book-global");
  state.appPrefs.general.addressBookGlobalScope = Boolean(globalCb?.checked);
  const activityCb = document.querySelector<HTMLInputElement>("#prefs-activity-suggestions");
  state.appPrefs.general.activitySuggestionsEnabled = activityCb?.checked !== false;
  syncActivityRecordingPrefs();
  if (!state.appPrefs.general.activitySuggestionsEnabled) {
    state.suggestedSavedViews = [];
    clearSuggestionShownKeys();
  } else {
    void refreshSuggestedSavedViews().then(() => render());
  }
  const lfSel = document.querySelector<HTMLSelectElement>("#prefs-default-list-filter");
  const lfRaw = lfSel?.value?.trim() ?? "all";
  state.appPrefs.general.defaultListFilter = LIST_FILTER_VALUES.includes(lfRaw as State["listFilter"])
    ? (lfRaw as State["listFilter"])
    : "all";
  const archLayout = document.querySelector<HTMLSelectElement>("#prefs-archive-layout");
  state.appPrefs.general.archiveLayout = archLayout?.value?.trim() || "hierarchical";
  const archRoot = document.querySelector<HTMLInputElement>("#prefs-archive-root");
  state.appPrefs.general.archiveRoot = (archRoot?.value ?? "Archive").trim() || "Archive";
  const staleDays = document.querySelector<HTMLInputElement>("#prefs-stale-inbox-days");
  const staleN = Number(staleDays?.value ?? 90);
  state.appPrefs.general.staleInboxDays = Number.isFinite(staleN) ? Math.max(1, Math.floor(staleN)) : 90;
  const hybridW = document.querySelector<HTMLInputElement>("#prefs-hybrid-weight");
  const hw = Number(hybridW?.value ?? 0.55);
  state.appPrefs.general.hybridLexicalWeight = Number.isFinite(hw) ? Math.min(1, Math.max(0, hw)) : 0.55;
  state.appPrefs.general.autoArchiveEnabled = Boolean(
    document.querySelector<HTMLInputElement>("#prefs-auto-archive-enabled")?.checked,
  );
  const accSel = document.querySelector<HTMLSelectElement>("#prefs-default-account");
  const accVal = (accSel?.value ?? "").trim();
  if (accVal) state.appPrefs.general.defaultAccountId = accVal;
  else delete state.appPrefs.general.defaultAccountId;
  try {
    await withTimeout(invoke("set_app_prefs", { prefs: state.appPrefs }), MAIL_ACTION_TIMEOUT_MS);
    toast(t("toast.prefsSaved"));
  } catch (e) {
    toast(tauriErrorMessage(e));
    return;
  }
  if (accVal && state.view === "list") {
    await switchActiveAccount(accVal);
    render();
  } else if (
    state.view === "list" &&
    !isSavedDraftsVirtualMailbox(state.selectedMailbox ?? "") &&
    !isSearchActive() &&
    state.listFilter !== defaultListFilterFromPrefs()
  ) {
    await applyListFilter(defaultListFilterFromPrefs());
  } else {
    render();
  }
}
