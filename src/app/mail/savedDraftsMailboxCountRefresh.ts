import { invoke } from "@tauri-apps/api/core";
import { currentAccount } from "../core/accountContext";
import { BOOT_INVOKE_TIMEOUT_MS } from "../core/timeouts";
import { isTauriRuntime } from "../lib/tauriRuntime";
import { withTimeout } from "../lib/tauriCommand";
import { state } from "../state";

export async function refreshSavedDraftsMailboxCount(): Promise<void> {
  const accountId = currentAccount()?.id?.trim();
  if (!accountId || !isTauriRuntime()) {
    state.savedDraftsMailboxCount = 0;
    return;
  }
  try {
    const n = await withTimeout(invoke<number>("saved_drafts_count", { accountId }), BOOT_INVOKE_TIMEOUT_MS);
    state.savedDraftsMailboxCount =
      typeof n === "number" && Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0;
  } catch {
    state.savedDraftsMailboxCount = 0;
  }
}
