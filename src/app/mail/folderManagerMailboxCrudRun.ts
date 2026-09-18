import { invoke } from "@tauri-apps/api/core";

import { currentAccount } from "../core/accountContext";
import { MAIL_ACTION_TIMEOUT_MS } from "../core/timeouts";
import { tauriErrorMessage, withTimeout } from "../lib/tauriCommand";
import { toast } from "../lib/toast";
import { openTextPromptModal } from "../modals/promptConfirm";
import { mailboxPathDelimiter } from "./folderManagerPathUtil";
import { fmSelectMailbox, refreshFolderManagerTree } from "./folderManagerTreeRun";
import { refreshMailboxesAfterImapChange } from "./orgRefreshMailboxesAfterImap";

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
