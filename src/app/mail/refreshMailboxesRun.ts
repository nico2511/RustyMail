import { invoke } from "@tauri-apps/api/core";
import { ACCOUNT_INVOKE_TIMEOUT_MS } from "../core/timeouts";
import { tauriErrorMessage, withTimeout } from "../lib/tauriCommand";
import { state } from "../state";

/** Recharge les dossiers IMAP. En cas d'échec, la liste déjà affichée est conservée. */
export async function refreshMailboxes(accountId: string | null): Promise<string[]> {
  try {
    const list = await withTimeout(
      invoke<string[]>("list_imap_mailboxes", { accountId }),
      ACCOUNT_INVOKE_TIMEOUT_MS,
    );
    state.mailboxes = Array.isArray(list) ? list : state.mailboxes;
    state.mailboxListError = "";
    return state.mailboxes;
  } catch (error) {
    state.mailboxListError = tauriErrorMessage(error);
    return state.mailboxes;
  }
}
