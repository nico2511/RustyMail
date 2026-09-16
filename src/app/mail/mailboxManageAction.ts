import { invoke } from "@tauri-apps/api/core";
import { isSavedDraftsVirtualMailbox, isVirtualMailbox } from "../../mailboxKinds";
import { currentAccount } from "../core/accountContext";
import { MAIL_ACTION_TIMEOUT_MS, BOOT_INVOKE_TIMEOUT_MS } from "../core/timeouts";
import { safeInvoke, tauriErrorMessage, withTimeout } from "../lib/tauriCommand";
import { isTauriRuntime } from "../lib/tauriRuntime";
import { toast } from "../lib/toast";
import { openConfirmModal, openTextPromptModal } from "../modals/promptConfirm";
import { render } from "../dispatch";
import { state } from "../state";

export type MailboxManageActionDeps = {
  ensureValidSelectedMailbox: () => void;
  loadMailboxUnread: () => Promise<void>;
  loadMailView: (append?: boolean) => Promise<void>;
};

let mailboxManageDeps: MailboxManageActionDeps | null = null;

export function registerMailboxManageActionDeps(deps: MailboxManageActionDeps): void {
  mailboxManageDeps = deps;
}

function manageDeps(): MailboxManageActionDeps {
  if (!mailboxManageDeps) throw new Error("registerMailboxManageActionDeps not called");
  return mailboxManageDeps;
}

function mailboxPathPrefixForCreate(): string {
  const m = (state.selectedMailbox ?? "").trim();
  if (!m || isVirtualMailbox(m)) return "";
  return m.endsWith("/") ? m : `${m}/`;
}

export async function mailboxManageAction(
  kind: "create" | "rename" | "delete" | "subscribe",
): Promise<void> {
  if (!isTauriRuntime()) {
    toast("Mailbox : disponible seulement dans l’app Tauri.");
    return;
  }
  const account = currentAccount();
  if (!account) {
    toast("Configurez d’abord un compte IMAP.");
    return;
  }
  if (kind !== "create" && isSavedDraftsVirtualMailbox(state.selectedMailbox)) {
    toast("Les dossiers IMAP ne s’appliquent pas aux brouillons locaux.");
    return;
  }
  const d = manageDeps();
  try {
    let msg = "";
    if (kind === "create") {
      const prefix = mailboxPathPrefixForCreate();
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
      if (!name) return;
      msg = await withTimeout(
        invoke<string>("create_imap_mailbox", { accountId: account.id, mailbox: name }),
        MAIL_ACTION_TIMEOUT_MS,
      );
    } else if (kind === "rename") {
      const from = state.selectedMailbox || "INBOX";
      const to =
        (await openTextPromptModal({
          title: "Renommer le dossier",
          body: `Dossier actuel : ${from}`,
          label: "Nouveau chemin IMAP",
          defaultValue: "",
        }))?.trim() ?? "";
      if (!to) return;
      msg = await withTimeout(
        invoke<string>("rename_imap_mailbox", { accountId: account.id, fromMailbox: from, toMailbox: to }),
        MAIL_ACTION_TIMEOUT_MS,
      );
    } else if (kind === "delete") {
      const m = state.selectedMailbox || "INBOX";
      const ok = await openConfirmModal({
        title: "Supprimer ce dossier IMAP ?",
        body: `La mailbox « ${m} » sera supprimée côté serveur. Opération irréversible.`,
        danger: true,
        confirmLabel: "Supprimer",
      });
      if (!ok) return;
      msg = await withTimeout(
        invoke<string>("delete_imap_mailbox", {
          accountId: account.id,
          mailbox: m,
          destructiveAck: "delete-mailbox",
        }),
        MAIL_ACTION_TIMEOUT_MS,
      );
    } else if (kind === "subscribe") {
      const m = state.selectedMailbox || "INBOX";
      msg = await withTimeout(
        invoke<string>("subscribe_imap_mailbox", { accountId: account.id, mailbox: m }),
        MAIL_ACTION_TIMEOUT_MS,
      );
    }
    toast(msg);
    state.mailboxes = await safeInvoke<string[]>("list_imap_mailboxes", { accountId: account.id }, [], BOOT_INVOKE_TIMEOUT_MS);
    d.ensureValidSelectedMailbox();
    state.mailboxManageOpen = false;
    await d.loadMailboxUnread();
    await d.loadMailView(false);
    render();
  } catch (err) {
    console.error("mailboxManageAction", err);
    toast(tauriErrorMessage(err));
    render();
  }
}
