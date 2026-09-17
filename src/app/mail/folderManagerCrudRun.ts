import { invoke } from "@tauri-apps/api/core";

import type { SyncMailboxesOutcome } from "../../imapSyncTypes";
import { isDescendantMailboxPath } from "../../mailboxTree";
import { render } from "../dispatch";
import { currentAccount } from "../core/accountContext";
import { MAIL_ACTION_TIMEOUT_MS } from "../core/timeouts";
import { tauriErrorMessage, withTimeout } from "../lib/tauriCommand";
import { toast } from "../lib/toast";
import { openTextPromptModal } from "../modals/promptConfirm";
import { state } from "../state";
import { mailboxPathDelimiter, reparentMailboxPath } from "./folderManagerPathUtil";
import { fmSelectMailbox, refreshFolderManagerTree } from "./folderManagerTreeRun";
import { refreshMailboxesAfterImapChange } from "./orgRefreshMailboxesAfterImap";

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
