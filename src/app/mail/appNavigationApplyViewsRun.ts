import { navApplyPendingScrollRestore, navQueueScrollRestore, type NavSnapshot } from "../../navigation";
import {
  clearContactProfile,
  setContactsKeywordDraft,
  setContactsListQuery,
} from "../../contactsView";
import { render } from "../dispatch";
import { state } from "../state";
import type { AppNavigationStackDeps } from "./appNavigationStackContext";
import { requireAppNavigationStackDeps } from "./appNavigationStackContext";
import { applyNavSnapshotContactsViews } from "./appNavigationApplyViewsContactsRun";
import { applyNavSnapshotMailViews } from "./appNavigationApplyViewsMailRun";
import { applyNavSnapshotOrgViews } from "./appNavigationApplyViewsOrgRun";

export async function applyNavSnapshotView(snap: NavSnapshot, d: AppNavigationStackDeps): Promise<void> {
  switch (snap.view) {
    case "list":
    case "thread":
    case "compose":
    case "settings":
      await applyNavSnapshotMailViews(snap, d);
      break;
    case "contacts":
    case "contact":
      await applyNavSnapshotContactsViews(snap, d);
      break;
    case "organization":
    case "organizationV2":
    case "folderManager":
      await applyNavSnapshotOrgViews(snap, d);
      break;
    default:
      state.view = "list";
      render();
  }
}

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

  await applyNavSnapshotView(snap, d);

  window.requestAnimationFrame(() => {
    navApplyPendingScrollRestore();
  });
}
