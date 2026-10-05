import {
  getContactsKeywordDraft,
  getContactsListQuery,
} from "../../contactsView";
import {
  navCanGoBack,
  navPop,
  navPush,
  navReset,
  navTruncateThroughView,
  readContactsScrollY,
  readListScrollY,
  type NavSnapshot,
} from "../../navigation";
import { flushThreadActivityClosed } from "./threadActivityTracking";
import type { NavigateOpts, View } from "../types";
import { state } from "../state";
import { navSnapshotLabelsForView } from "./appNavigationSnapshotLabelsRun";

export function captureCurrentNav(): NavSnapshot {
  const view = state.view;
  const { backLabel, breadcrumb } = navSnapshotLabelsForView(view);
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
    (from === "list" &&
      (to === "thread" ||
        to === "compose" ||
        to === "settings" ||
        to === "contacts" ||
        to === "organization" ||
        to === "organizationV2" ||
        to === "folderManager")) ||
    (from === "contacts" &&
      (to === "contact" || to === "thread" || to === "compose" || to === "settings")) ||
    (from === "contact" && (to === "thread" || to === "compose" || to === "settings")) ||
    (from === "thread" && (to === "compose" || to === "settings")) ||
    (from === "compose" && to === "settings") ||
    (from === "organization" && (to === "thread" || to === "settings")) ||
    (from === "organizationV2" && (to === "thread" || to === "settings")) ||
    (from === "folderManager" && (to === "thread" || to === "settings")) ||
    (from === "settings" &&
      (to === "thread" || to === "list" || to === "contacts" || to === "organization" || to === "organizationV2" || to === "folderManager"));
  return drill;
}

export function beginNavigation(to: View, opts?: NavigateOpts): void {
  if (state.view === "thread" && to !== "thread") {
    flushThreadActivityClosed();
  }
  if (opts?.resetStack) navReset();
  else if (!opts?.skipHistory) {
    const from = state.view;
    if (to === "settings") {
      navTruncateThroughView("settings");
    }
    if (shouldPushNavHistory(from, to)) {
      const snap = captureCurrentNav();
      if (opts?.replaceHistory && navCanGoBack()) {
        navPop();
      }
      navPush(snap);
    }
  }
}
