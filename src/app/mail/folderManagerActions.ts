import { invoke } from "@tauri-apps/api/core";
import type { SyncMailboxesOutcome } from "../../imapSyncTypes";
import {
  archiveMailboxThreads,
  deleteMailboxWithContents,
  fetchMailboxTree,
} from "../../folderManagerView";
import {
  isDescendantMailboxPath,
  loadFolderTreeExpanded,
} from "../../mailboxTree";
import {
  navClearForward,
  navPushBackEntry,
} from "../../navigation";
import { render } from "../dispatch";
import { currentAccount } from "../core/accountContext";
import { MAIL_ACTION_TIMEOUT_MS } from "../core/timeouts";
import { isTauriRuntime } from "../lib/tauriRuntime";
import { tauriErrorMessage, withTimeout } from "../lib/tauriCommand";
import { toast } from "../lib/toast";
import { openTextPromptModal } from "../modals/promptConfirm";
import { state } from "../state";
import { beginNavigation, captureCurrentNav } from "./appNavigationStack";
import { resetFolderManagerPanelSearchState } from "./folderManagerPanelState";
import { mailboxPathDelimiter, reparentMailboxPath } from "./folderManagerPathUtil";
import { refreshMailboxesAfterImapChange } from "./orgRefreshMailboxesAfterImap";

export type FolderManagerRunDeps = {
  loadMailView: (append?: boolean) => Promise<void>;
};

let folderManagerRunDeps: FolderManagerRunDeps | null = null;

export function registerFolderManagerRunDeps(deps: FolderManagerRunDeps): void {
  folderManagerRunDeps = deps;
}

function fmDeps(): FolderManagerRunDeps {
  if (!folderManagerRunDeps) throw new Error("registerFolderManagerRunDeps not called");
  return folderManagerRunDeps;
}

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
    await fmDeps().loadMailView(false);
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

export async function fmSyncMailbox(mailbox: string): Promise<void> {
  const acc = currentAccount();
  const mb = mailbox.trim();
  if (!acc?.id || !mb) return;
  state.folderManager.busyMailbox = mb;
  state.folderManager.busyAction = "sync";
  render();
  try {
    await withTimeout(
      invoke<SyncMailboxesOutcome>("sync_mailboxes", { accountId: acc.id, mailboxes: [mb] }),
      MAIL_ACTION_TIMEOUT_MS,
    );
    await refreshFolderManagerTree();
    if (state.folderManager.selectedMailbox === mb) await fmSelectMailbox(mb);
    toast(`Dossier synchronisé : ${mb}`);
  } catch (e) {
    toast(tauriErrorMessage(e));
  } finally {
    state.folderManager.busyMailbox = null;
    state.folderManager.busyAction = null;
    render();
  }
}

export async function fmCreateMailbox(parentPrefix?: string): Promise<void> {
  const acc = currentAccount();
  if (!acc?.id) return;
  const prefix = parentPrefix?.trim()
    ? `${parentPrefix.trim().replace(/[/.]$/, "")}${mailboxPathDelimiter(parentPrefix)}`
    : "";
  const name =
    (
      await openTextPromptModal({
        title: "Créer un dossier IMAP",
        body: prefix ? `Préfixe parent : ${prefix}` : "Chemin du dossier (ex. Projets/2025)",
        label: "Chemin du dossier",
        defaultValue: prefix,
      })
    )?.trim() ?? "";
  if (!name) return;
  try {
    await withTimeout(
      invoke<string>("create_imap_mailbox", { accountId: acc.id, mailbox: name }),
      MAIL_ACTION_TIMEOUT_MS,
    );
    await refreshMailboxesAfterImapChange();
    await refreshFolderManagerTree();
    await fmSelectMailbox(name);
    toast(`Dossier créé : ${name}`);
  } catch (e) {
    toast(tauriErrorMessage(e));
  }
}

export async function fmRenameMailbox(from: string): Promise<void> {
  const acc = currentAccount();
  if (!acc?.id) return;
  const to =
    (
      await openTextPromptModal({
        title: "Renommer le dossier",
        label: "Nouveau chemin",
        defaultValue: from,
      })
    )?.trim() ?? "";
  if (!to || to === from) return;
  try {
    await withTimeout(
      invoke<string>("rename_imap_mailbox", { accountId: acc.id, fromMailbox: from, toMailbox: to }),
      MAIL_ACTION_TIMEOUT_MS,
    );
    await refreshMailboxesAfterImapChange();
    await refreshFolderManagerTree();
    await fmSelectMailbox(to);
    toast(`Dossier renommé : ${to}`);
  } catch (e) {
    toast(tauriErrorMessage(e));
  }
}

export async function fmMoveFolder(from: string, newParent: string): Promise<void> {
  const acc = currentAccount();
  if (!acc?.id) return;
  if (from.trim().toLowerCase() === newParent.trim().toLowerCase()) return;
  if (isDescendantMailboxPath(from, newParent)) {
    toast("Impossible de déplacer un dossier dans l’un de ses descendants.");
    return;
  }
  const to = reparentMailboxPath(from, newParent);
  if (to.toLowerCase() === from.trim().toLowerCase()) return;
  state.folderManager.busyMailbox = from;
  state.folderManager.busyAction = "move";
  render();
  try {
    await withTimeout(
      invoke<string>("rename_imap_mailbox", { accountId: acc.id, fromMailbox: from, toMailbox: to }),
      MAIL_ACTION_TIMEOUT_MS,
    );
    await refreshMailboxesAfterImapChange();
    await refreshFolderManagerTree();
    await fmSelectMailbox(to);
    toast(`Dossier déplacé : ${to}`);
  } catch (e) {
    toast(tauriErrorMessage(e));
  } finally {
    state.folderManager.busyMailbox = null;
    state.folderManager.busyAction = null;
    state.folderManager.dragFolder = null;
    state.folderManager.dropTarget = null;
    render();
  }
}

export async function fmConfirmArchiveMailbox(): Promise<void> {
  const acc = currentAccount();
  const mb = state.folderManager.pendingArchiveMailbox?.trim();
  if (!acc?.id || !mb) return;
  const remember = state.folderManager.archiveRemember;
  state.folderManager.archiveProgress = "Archivage…";
  render();
  try {
    const out = await archiveMailboxThreads(acc.id, mb, remember);
    state.folderManager.archiveConfirmOpen = false;
    state.folderManager.pendingArchiveMailbox = null;
    await refreshFolderManagerTree();
    if (state.folderManager.selectedMailbox === mb) await fmSelectMailbox(mb);
    if (out.errors.length) toast(`Archivage partiel : ${out.errors[0]}`);
    else toast(`${out.archived} conversation(s) archivée(s).`);
  } catch (e) {
    toast(tauriErrorMessage(e));
  } finally {
    state.folderManager.archiveProgress = null;
    render();
  }
}

export async function fmConfirmDeleteMailbox(): Promise<void> {
  const acc = currentAccount();
  const mb = state.folderManager.pendingDeleteMailbox?.trim();
  if (!acc?.id || !mb || !state.folderManager.deleteConfirmChecked) return;
  state.folderManager.busyMailbox = mb;
  state.folderManager.busyAction = "delete";
  render();
  try {
    const out = await deleteMailboxWithContents(acc.id, mb);
    state.folderManager.deleteConfirmOpen = false;
    state.folderManager.pendingDeleteMailbox = null;
    state.folderManager.deleteConfirmChecked = false;
    await refreshMailboxesAfterImapChange();
    await refreshFolderManagerTree();
    const remaining = state.folderManager.report?.entries.map((e) => e.mailbox) ?? [];
    if (remaining.length) await fmSelectMailbox(remaining[0]!);
    else {
      state.folderManager.selectedMailbox = null;
      state.threads = [];
    }
    if (out.errors.length) toast(`Suppression partielle : ${out.errors[0]}`);
    else toast(`${out.deletedMailboxes} dossier(s) supprimé(s).`);
  } catch (e) {
    toast(tauriErrorMessage(e));
  } finally {
    state.folderManager.busyMailbox = null;
    state.folderManager.busyAction = null;
    render();
  }
}
