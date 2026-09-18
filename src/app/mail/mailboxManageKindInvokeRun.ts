import { invoke } from "@tauri-apps/api/core";
import type { Account } from "../../accountSetup";
import { MAIL_ACTION_TIMEOUT_MS } from "../core/timeouts";
import { withTimeout } from "../lib/tauriCommand";
import { openConfirmModal, openTextPromptModal } from "../modals/promptConfirm";
import { state } from "../state";
import { mailboxPathPrefixForCreate } from "./mailboxManageActionContext";

export async function invokeMailboxManageKind(
  kind: "create" | "rename" | "delete" | "subscribe",
  account: Account,
): Promise<string | null> {
  if (kind === "create") {
    const prefix = mailboxPathPrefixForCreate(state.selectedMailbox);
    const def = prefix || "";
    const bodyHint = [
      prefix ? `Préfixe depuis le dossier sélectionné : ${prefix}` : "",
      `Ex. sous « ${state.selectedMailbox || "INBOX"} » : nom du sous-dossier ou chemin complet (séparateur /).`,
    ]
      .filter(Boolean)
      .join("\n");
    const name =
      (await openTextPromptModal({
        title: "Créer un dossier IMAP",
        body: bodyHint,
        label: "Chemin du dossier",
        defaultValue: def,
      }))?.trim() ?? "";
    if (!name) return null;
    return await withTimeout(
      invoke<string>("create_imap_mailbox", { accountId: account.id, mailbox: name }),
      MAIL_ACTION_TIMEOUT_MS,
    );
  }
  if (kind === "rename") {
    const from = state.selectedMailbox || "INBOX";
    const to =
      (await openTextPromptModal({
        title: "Renommer le dossier",
        body: `Dossier actuel : ${from}`,
        label: "Nouveau chemin IMAP",
        defaultValue: "",
      }))?.trim() ?? "";
    if (!to) return null;
    return await withTimeout(
      invoke<string>("rename_imap_mailbox", { accountId: account.id, fromMailbox: from, toMailbox: to }),
      MAIL_ACTION_TIMEOUT_MS,
    );
  }
  if (kind === "delete") {
    const m = state.selectedMailbox || "INBOX";
    const ok = await openConfirmModal({
      title: "Supprimer ce dossier IMAP ?",
      body: `La mailbox « ${m} » sera supprimée côté serveur. Opération irréversible.`,
      danger: true,
      confirmLabel: "Supprimer",
    });
    if (!ok) return null;
    return await withTimeout(
      invoke<string>("delete_imap_mailbox", {
        accountId: account.id,
        mailbox: m,
        destructiveAck: "delete-mailbox",
      }),
      MAIL_ACTION_TIMEOUT_MS,
    );
  }
  const m = state.selectedMailbox || "INBOX";
  return await withTimeout(
    invoke<string>("subscribe_imap_mailbox", { accountId: account.id, mailbox: m }),
    MAIL_ACTION_TIMEOUT_MS,
  );
}
