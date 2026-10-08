import { deleteBlockedReason, renameBlockedReason } from "../../mailboxLock";
import { isSavedDraftsVirtualMailbox } from "../../mailboxKinds";
import { currentAccount } from "../core/accountContext";
import { tauriErrorMessage } from "../lib/tauriCommand";
import { isTauriRuntime } from "../lib/tauriRuntime";
import { toast } from "../lib/toast";
import { render } from "../dispatch";
import { state } from "../state";
import { ensureValidSelectedMailbox } from "./accountDefaultPrefs";
import { invokeMailboxManageKind } from "./mailboxManageKindInvokeRun";
import { requireMailboxManageActionDeps } from "./mailboxManageActionContext";
import { refreshMailboxes } from "./refreshMailboxesRun";

export async function mailboxManageAction(
  kind: "create" | "rename" | "delete" | "subscribe",
): Promise<void> {
  if (!isTauriRuntime()) {
    toast.warning("Mailbox : disponible seulement dans l’app Tauri.");
    return;
  }
  const account = currentAccount();
  if (!account) {
    toast.warning("Configurez d’abord un compte IMAP.");
    return;
  }
  if (kind !== "create" && isSavedDraftsVirtualMailbox(state.selectedMailbox)) {
    toast.warning("Les dossiers IMAP ne s’appliquent pas aux brouillons locaux.");
    return;
  }
  const locks = state.folderManager.report?.lockedMailboxes ?? [];
  if (kind === "rename") {
    const blocked = renameBlockedReason(locks, state.selectedMailbox || "");
    if (blocked) {
      toast(blocked);
      return;
    }
  }
  if (kind === "delete") {
    const blocked = deleteBlockedReason(locks, state.selectedMailbox || "");
    if (blocked) {
      toast(blocked);
      return;
    }
  }
  const d = requireMailboxManageActionDeps();
  try {
    const msg = await invokeMailboxManageKind(kind, account);
    if (msg === null) return;
    toast(msg);
    await refreshMailboxes(account.id);
    ensureValidSelectedMailbox();
    state.mailboxManageOpen = false;
    await d.loadMailboxUnread();
    await d.loadMailView(false);
    render();
  } catch (err) {
    console.error("mailboxManageAction", err);
    toast.error(tauriErrorMessage(err));
    render();
  }
}

export {
  registerMailboxManageActionDeps,
  type MailboxManageActionDeps,
} from "./mailboxManageActionContext";
