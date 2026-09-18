import { invoke } from "@tauri-apps/api/core";
import type { OrphanDraftSessionItem } from "../types";
import { currentAccount } from "../core/accountContext";
import { BOOT_INVOKE_TIMEOUT_MS } from "../core/timeouts";
import { isTauriRuntime } from "../lib/tauriRuntime";
import { withTimeout } from "../lib/tauriCommand";
import { render } from "../dispatch";
import { state } from "../state";

export async function checkOrphanDraftSessionsOnBoot(): Promise<void> {
  if (!isTauriRuntime()) return;
  const accountId = currentAccount()?.id?.trim();
  if (!accountId) return;
  try {
    const sessions = await withTimeout(
      invoke<OrphanDraftSessionItem[]>("draft_orphan_sessions_list", { accountId, limit: 10 }),
      BOOT_INVOKE_TIMEOUT_MS,
    );
    if (sessions?.length) {
      state.resumeDraftModal = { sessions };
      render();
    }
  } catch (e) {
    console.error("draft_orphan_sessions_list", e);
  }
}
