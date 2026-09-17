import {
  getContactDetail,
  getContactsKeywordDraft,
  getContactsListQuery,
} from "../../contactsView";
import {
  navCanGoBack,
  navPop,
  navPush,
  navReset,
  readContactsScrollY,
  readListScrollY,
  type NavSnapshot,
} from "../../navigation";
import { threadMailboxListLabel } from "../../mailboxKinds";
import { flushThreadActivityClosed } from "./threadActivityTracking";
import type { NavigateOpts, View } from "../types";
import { state } from "../state";
import { navMailboxSegment } from "./navBreadcrumbSegments";

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
