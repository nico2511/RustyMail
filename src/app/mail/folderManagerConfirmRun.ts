import { archiveMailboxThreads, deleteMailboxWithContents } from "../../folderManagerView";
import { render } from "../dispatch";
import { currentAccount } from "../core/accountContext";
import { tauriErrorMessage } from "../lib/tauriCommand";
import { toast } from "../lib/toast";
import { state } from "../state";
import { fmSelectMailbox, refreshFolderManagerTree } from "./folderManagerTreeRun";
import { refreshMailboxesAfterImapChange } from "./orgRefreshMailboxesAfterImap";

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
