import {
  clearContactProfile,
  loadContactsList,
  setContactsKeywordDraft,
  setContactsListQuery,
} from "../../contactsView";
import { navApplyPendingScrollRestore, navQueueScrollRestore, type NavSnapshot } from "../../navigation";
import { render } from "../dispatch";
import { currentAccount } from "../core/accountContext";
import { tauriErrorMessage } from "../lib/tauriCommand";
import { toast } from "../lib/toast";
import { state } from "../state";
import { defaultListFilterFromPrefs } from "./accountDefaultPrefs";
import { requireAppNavigationStackDeps } from "./appNavigationStackContext";
import { searchThreads } from "./searchThreadsRun";
import { clearThreadAiSummaryState } from "./threadAiSummaryState";

export async function applyNavSnapshot(snap: NavSnapshot): Promise<void> {
  const d = requireAppNavigationStackDeps();
  navQueueScrollRestore(snap);
  state.selectedMailbox = snap.selectedMailbox ?? state.selectedMailbox;
  if (snap.search !== undefined) state.search = snap.search;
  if (snap.searchDraft !== undefined) state.searchDraft = snap.searchDraft;
  if (snap.searchSenders) state.searchSenders = [...snap.searchSenders];
  if (snap.listFilter) state.listFilter = snap.listFilter;
  if (snap.searchScope) state.searchScope = snap.searchScope;
  if (snap.searchNlMode !== undefined) state.searchNlMode = snap.searchNlMode;
  if (snap.contactsListQuery !== undefined) setContactsListQuery(snap.contactsListQuery);
  if (snap.contactsKeywordDraft !== undefined) setContactsKeywordDraft(snap.contactsKeywordDraft);
  state.aiOpen = Boolean(snap.aiOpen);
  state.selectedContactEmail = snap.selectedContactEmail;
  if (snap.settingsTab) state.settingsTab = snap.settingsTab;

  switch (snap.view) {
    case "list":
      state.view = "list";
      state.selectedThread = undefined;
      state.selectedThreadId = undefined;
      clearThreadAiSummaryState();
      render();
      if (
        (snap.search?.trim() ?? "") ||
        (snap.searchSenders?.length ?? 0) > 0 ||
        snap.listFilter !== defaultListFilterFromPrefs()
      ) {
        void searchThreads();
      }
      break;
    case "thread": {
      const tid = snap.selectedThreadId?.trim();
      if (!tid) {
        state.view = "list";
        render();
        break;
      }
      await d.openThread(tid, { skipHistory: true, preserveAi: snap.aiOpen });
      break;
    }
    case "contacts": {
      state.view = "contacts";
      state.selectedContactEmail = undefined;
      clearContactProfile();
      clearThreadAiSummaryState();
      render();
      const acc = currentAccount();
      if (acc?.id) {
        try {
          await loadContactsList(acc.id, { reset: true, query: snap.contactsListQuery });
        } catch (e) {
          toast(tauriErrorMessage(e));
        }
      }
      render();
      break;
    }
    case "contact": {
      const em = snap.selectedContactEmail?.trim();
      if (!em) {
        state.view = "contacts";
        render();
        break;
      }
      await d.openContactDetailView(em, { skipHistory: true });
      break;
    }
    case "settings":
      state.view = "settings";
      state.settingsTab = snap.settingsTab ?? state.settingsTab;
      clearThreadAiSummaryState();
      render();
      break;
    case "organization":
      state.view = "organization";
      state.mailboxDigestPanelOpen = false;
      clearThreadAiSummaryState();
      render();
      break;
    case "organizationV2":
      state.view = "organizationV2";
      state.mailboxDigestPanelOpen = false;
      clearThreadAiSummaryState();
      render();
      break;
    case "folderManager": {
      state.view = "folderManager";
      state.mailboxDigestPanelOpen = false;
      clearThreadAiSummaryState();
      const mb = snap.folderManagerSelectedMailbox ?? null;
      state.folderManager.selectedMailbox = mb;
      if (!mb) state.threads = [];
      render();
      if (mb) await d.fmSelectMailbox(mb, { skipHistory: true });
      else await d.refreshFolderManagerTree();
      break;
    }
    case "compose":
      state.view = "compose";
      render();
      break;
    default:
      state.view = "list";
      render();
  }
  window.requestAnimationFrame(() => {
    navApplyPendingScrollRestore();
  });
}
