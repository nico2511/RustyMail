import { fetchMailboxTree } from "../../folderManagerView";
import { loadFolderTreeExpanded } from "../../mailboxTree";
import { navClearForward, navPushBackEntry } from "../../navigation";
import { render } from "../dispatch";
import { currentAccount } from "../core/accountContext";
import { isTauriRuntime } from "../lib/tauriRuntime";
import { tauriErrorMessage } from "../lib/tauriCommand";
import { toast } from "../lib/toast";
import { state } from "../state";
import { beginNavigation, captureCurrentNav } from "./appNavigationStack";
import { requireFolderManagerRunDeps } from "./folderManagerContext";
import { resetFolderManagerPanelSearchState } from "./folderManagerPanelState";

export async function refreshFolderManagerTree(): Promise<void> {
  const acc = currentAccount();
  if (!acc?.id) return;
  state.folderManager.loading = true;
  render();
  try {
    state.folderManager.report = await fetchMailboxTree(acc.id);
    state.folderManager.message = `${state.folderManager.report.entries.length} dossier(s) personnel(s)`;
  } catch (e) {
    toast(tauriErrorMessage(e));
  } finally {
    state.folderManager.loading = false;
    if (state.view === "folderManager") render();
  }
}

export async function fmSelectMailbox(mailbox: string, opts?: { skipHistory?: boolean }): Promise<void> {
  const mb = mailbox.trim();
  if (!mb) return;
  const prev = state.folderManager.selectedMailbox;
  if (!opts?.skipHistory && state.view === "folderManager" && prev !== mb) {
    navPushBackEntry(captureCurrentNav());
    navClearForward();
  }
  state.folderManager.selectedMailbox = mb;
  resetFolderManagerPanelSearchState();
  render();
  try {
    await requireFolderManagerRunDeps().loadMailView(false);
  } catch (e) {
    toast(tauriErrorMessage(e));
  }
  render();
}

export async function openFolderManagerView(): Promise<void> {
  const acc = currentAccount();
  if (!acc?.id) {
    toast("Configurez un compte pour gérer les dossiers.");
    return;
  }
  if (!isTauriRuntime()) {
    toast("Vue Dossiers : disponible dans l’app Tauri.");
    return;
  }
  beginNavigation("folderManager");
  state.view = "folderManager";
  state.mailboxDigestPanelOpen = false;
  state.aiOpen = false;
  state.folderManager.selectedMailbox = null;
  state.threads = [];
  state.folderManager.expandedNodes = loadFolderTreeExpanded();
  render();
  await refreshFolderManagerTree();
}
