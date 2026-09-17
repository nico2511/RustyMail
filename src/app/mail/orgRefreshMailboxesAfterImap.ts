import { invoke } from "@tauri-apps/api/core";
import { currentAccount } from "../core/accountContext";
import { BOOT_INVOKE_TIMEOUT_MS } from "../core/timeouts";
import { isTauriRuntime } from "../lib/tauriRuntime";
import { withTimeout } from "../lib/tauriCommand";
import { state } from "../state";

export async function refreshMailboxesAfterImapChange(): Promise<void> {
  if (!isTauriRuntime()) return;
  const acc = currentAccount();
  if (!acc?.id) return;
  try {
    state.mailboxes = await withTimeout(
      invoke<string[]>("list_imap_mailboxes", { accountId: acc.id }),
      BOOT_INVOKE_TIMEOUT_MS,
    );
  } catch {
    /* garde la liste actuelle */
  }
}
