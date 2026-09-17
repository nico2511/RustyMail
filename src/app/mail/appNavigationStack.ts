import {
  clearContactProfile,
  getContactDetail,
  getContactsKeywordDraft,
  getContactsListQuery,
  loadContactsList,
  setContactsKeywordDraft,
  setContactsListQuery,
} from "../../contactsView";
import {
  navApplyPendingScrollRestore,
  navCanGoBack,
  navJumpToStackIndex,
  navPop,
  navPopForward,
  navPush,
  navPushBackEntry,
  navPushForward,
  navQueueScrollRestore,
  navReset,
  readContactsScrollY,
  readListScrollY,
  type NavSnapshot,
} from "../../navigation";
import { threadMailboxListLabel } from "../../mailboxKinds";
import { render } from "../dispatch";
import { currentAccount } from "../core/accountContext";
import { tauriErrorMessage } from "../lib/tauriCommand";
import { toast } from "../lib/toast";
import type { NavigateOpts, View } from "../types";
import { state } from "../state";
import { defaultListFilterFromPrefs } from "./accountDefaultPrefs";
import { navMailboxSegment } from "./navBreadcrumbSegments";
import { searchThreads } from "./searchThreadsRun";
import { clearThreadAiSummaryState } from "./threadAiSummaryState";
import { flushThreadActivityClosed } from "./threadActivityTracking";

export type AppNavigationStackDeps = {
  openThread: (threadId: string, opts?: { skipHistory?: boolean; preserveAi?: boolean }) => Promise<void>;
  openContactDetailView: (email: string, opts?: { skipHistory?: boolean }) => Promise<void>;
  fmSelectMailbox: (mailbox: string, opts?: { skipHistory?: boolean }) => Promise<void>;
  refreshFolderManagerTree: () => Promise<void>;
};

let navigationStackDeps: AppNavigationStackDeps | null = null;

export function registerAppNavigationStackDeps(deps: AppNavigationStackDeps): void {
  navigationStackDeps = deps;
}

function navStack(): AppNavigationStackDeps {
  if (!navigationStackDeps) throw new Error("registerAppNavigationStackDeps not called");
  return navigationStackDeps;
}

export function captureCurrentNav(): NavSnapshot {
  const view = state.view;
  let backLabel = "Boîte de réception";
  let breadcrumb: string[] = ["Boîte"];
  switch (view) {
    case "list":
      backLabel = navMailboxSegment();
      breadcrumb = [navMailboxSegment()];
      break;
    case "thread":
      backLabel = navMailboxSegment();
      breadcrumb = [navMailboxSegment()];
      break;
    case "contacts":
      backLabel = "Carnet";
      breadcrumb = ["Carnet"];
      break;
    case "contact": {
      const name = getContactDetail()?.displayName?.trim() || state.selectedContactEmail || "Contact";
      backLabel = "Contact";
      breadcrumb = ["Carnet", name];
      break;
    }
    case "settings":
      backLabel = "Paramètres";
      breadcrumb = ["Paramètres"];
      break;
    case "organization":
      backLabel = "Organiser";
      breadcrumb = ["Organiser"];
      break;
    case "organizationV2":
      backLabel = "Organiser V2";
      breadcrumb = ["Organiser V2"];
      break;
    case "folderManager": {
      const mb = state.folderManager.selectedMailbox?.trim();
      if (mb) {
        const label = threadMailboxListLabel(mb).label;
        backLabel = label;
        breadcrumb = ["Dossiers", label];
      } else {
        backLabel = "Dossiers";
        breadcrumb = ["Dossiers"];
      }
      break;
    }
    case "compose":
      backLabel = state.selectedThread ? "Fil" : navMailboxSegment();
      breadcrumb = state.selectedThread ? ["Fil", "Composer"] : [navMailboxSegment(), "Composer"];
      break;
  }
  return {
    view,
    backLabel,
    breadcrumb,
    selectedThreadId: state.selectedThreadId,
    selectedContactEmail: state.selectedContactEmail,
    settingsTab: state.settingsTab,
    selectedMailbox: state.selectedMailbox,
    search: state.search,
    searchDraft: state.searchDraft,
    searchSenders: [...state.searchSenders],
    listFilter: state.listFilter,
    searchScope: state.searchScope,
    searchNlMode: state.searchNlMode,
    contactsListQuery: getContactsListQuery(),
    contactsKeywordDraft: getContactsKeywordDraft(),
    listScrollY: view === "list" ? readListScrollY() : undefined,
    contactsScrollY: view === "contacts" ? readContactsScrollY() : undefined,
    aiOpen: state.aiOpen,
    folderManagerSelectedMailbox:
      view === "folderManager" ? (state.folderManager.selectedMailbox ?? null) : undefined,
  };
}

function shouldPushNavHistory(from: View, to: View): boolean {
  if (from === to) return false;
  const drill =
    (from === "list" && (to === "thread" || to === "compose" || to === "settings")) ||
    (from === "contacts" && (to === "contact" || to === "thread" || to === "compose")) ||
    (from === "contact" && (to === "thread" || to === "compose")) ||
    (from === "thread" && to === "compose") ||
    (from === "organization" && to === "thread") ||
    (from === "list" && to === "contacts") ||
    (from === "list" && to === "organization") ||
    (from === "list" && to === "folderManager") ||
    (from === "list" && to === "settings");
  return drill;
}

export function beginNavigation(to: View, opts?: NavigateOpts): void {
  if (state.view === "thread" && to !== "thread") {
    flushThreadActivityClosed();
  }
  if (opts?.resetStack) navReset();
  else if (!opts?.skipHistory) {
    const from = state.view;
    if (shouldPushNavHistory(from, to)) {
      const snap = captureCurrentNav();
      if (opts?.replaceHistory && navCanGoBack()) {
        navPop();
      }
      navPush(snap);
    }
  }
}

async function applyNavSnapshot(snap: NavSnapshot): Promise<void> {
  const d = navStack();
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

export async function goBack(): Promise<void> {
  const snap = navPop();
  if (!snap) {
    if (state.view === "folderManager" && state.folderManager.selectedMailbox) {
      state.folderManager.selectedMailbox = null;
      state.threads = [];
      render();
      return;
    }
    if (state.view !== "list") {
      state.view = "list";
      state.selectedThread = undefined;
      state.selectedThreadId = undefined;
      state.selectedContactEmail = undefined;
      state.aiOpen = false;
      clearThreadAiSummaryState();
      render();
    }
    return;
  }
  navPushForward(captureCurrentNav());
  await applyNavSnapshot(snap);
}

export async function goForward(): Promise<void> {
  const snap = navPopForward();
  if (!snap) return;
  navPushBackEntry(captureCurrentNav());
  await applyNavSnapshot(snap);
}

export function navigateToInbox(opts?: NavigateOpts): void {
  beginNavigation("list", { resetStack: true, ...opts });
  state.view = "list";
  state.selectedContactEmail = undefined;
  state.selectedThread = undefined;
  state.selectedThreadId = undefined;
  state.aiOpen = false;
  clearThreadAiSummaryState();
  render();
}

export async function navigateToBreadcrumbIndex(stackIndex: number): Promise<void> {
  if (stackIndex < 0) {
    navigateToInbox();
    return;
  }
  const target = navJumpToStackIndex(stackIndex, captureCurrentNav());
  if (!target) return;
  await applyNavSnapshot(target);
}
