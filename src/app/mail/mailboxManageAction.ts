import { isSavedDraftsVirtualMailbox } from "../../mailboxKinds";
import { currentAccount } from "../core/accountContext";
import { BOOT_INVOKE_TIMEOUT_MS } from "../core/timeouts";
import { safeInvoke, tauriErrorMessage } from "../lib/tauriCommand";
import { isTauriRuntime } from "../lib/tauriRuntime";
import { toast } from "../lib/toast";
import { render } from "../dispatch";
import { state } from "../state";
import { ensureValidSelectedMailbox } from "./accountDefaultPrefs";
import { invokeMailboxManageKind } from "./mailboxManageKindInvokeRun";
import { requireMailboxManageActionDeps } from "./mailboxManageActionContext";

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
  const d = requireMailboxManageActionDeps();
  try {
    const msg = await invokeMailboxManageKind(kind, account);
    if (msg === null) return;
    toast(msg);
    state.mailboxes = await safeInvoke<string[]>("list_imap_mailboxes", { accountId: account.id }, [], BOOT_INVOKE_TIMEOUT_MS);
    ensureValidSelectedMailbox();
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

export {
  registerMailboxManageActionDeps,
  type MailboxManageActionDeps,
} from "./mailboxManageActionContext";
