import { invoke } from "@tauri-apps/api/core";
import { mailboxKind } from "../../mailboxKinds";
import { currentAccount } from "../core/accountContext";
import { MAIL_ACTION_TIMEOUT_MS } from "../core/timeouts";
import { tauriErrorMessage, withTimeout } from "../lib/tauriCommand";
import { isTauriRuntime } from "../lib/tauriRuntime";
import { toast } from "../lib/toast";
import { openConfirmModal } from "../modals/promptConfirm";
import { render } from "../dispatch";
import { state } from "../state";

export type EmptyTrashMailboxDeps = {
  loadMailView: () => Promise<void>;
  loadMailboxUnread: () => Promise<void>;
};

let emptyTrashDeps: EmptyTrashMailboxDeps | null = null;

export function registerEmptyTrashMailboxDeps(deps: EmptyTrashMailboxDeps): void {
  emptyTrashDeps = deps;
}

function trashDeps(): EmptyTrashMailboxDeps {
  if (!emptyTrashDeps) throw new Error("registerEmptyTrashMailboxDeps not called");
  return emptyTrashDeps;
}

export async function onEmptyTrashMailbox(): Promise<void> {
  if (!isTauriRuntime()) {
    toast("Vider la corbeille : disponible dans l’app Tauri.");
    return;
  }
  const account = currentAccount();
  if (!account) {
    toast("Configurez d’abord un compte IMAP.");
    return;
  }
  const mailbox = state.selectedMailbox || "";
  if (mailboxKind(mailbox) !== "trash") {
    toast("Ouvrez d’abord le dossier corbeille.");
    return;
  }
  if (state.threads.length === 0) {
    toast("La corbeille est déjà vide.");
    return;
  }
  const ok = await openConfirmModal({
    title: "Vider la corbeille ?",
    body: "Supprimer définitivement tous les messages de ce dossier corbeille ? Cette action est irréversible côté serveur.",
    danger: true,
    confirmLabel: "Tout supprimer",
  });
  if (!ok) return;
  const d = trashDeps();
  try {
    const msg = await withTimeout(
      invoke<string>("empty_trash_mailbox_cmd", { accountId: account.id, mailbox, destructiveAck: "empty-trash" }),
      MAIL_ACTION_TIMEOUT_MS,
    );
    toast(msg);
    if (state.view === "thread") {
      state.view = "list";
      state.selectedThread = undefined;
      state.selectedThreadId = undefined;
    }
    await d.loadMailView();
    await d.loadMailboxUnread();
    state.selectedThreadId = state.threads[0]?.id;
    render();
  } catch (err) {
    console.error("empty_trash_mailbox_cmd", err);
    toast(tauriErrorMessage(err));
    render();
  }
}
