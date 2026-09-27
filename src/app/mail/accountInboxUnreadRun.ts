import { invoke } from "@tauri-apps/api/core";
import { isInboxLikeMailbox } from "../../mailboxKinds";
import type { MailboxFolderStatsRow } from "../types";
import { BOOT_INVOKE_TIMEOUT_MS } from "../core/timeouts";
import { withTimeout } from "../lib/tauriCommand";
import { isTauriRuntime } from "../lib/tauriRuntime";
import { state } from "../state";

/**
 * Non-lus des réceptions, un appel existant `mailbox_unread_counts` par compte.
 * Pas de nouvelle commande IPC. Si l’appel échoue, on garde le dernier chiffre
 * (ou 0) : le rail, la modale et le titre lisent `state.accountInboxUnread`.
 */
export async function refreshAccountInboxUnreads(): Promise<void> {
  if (!isTauriRuntime() || state.accounts.length < 2) return;
  const entries = await Promise.all(
    state.accounts.map(async (account) => {
      try {
        const rows = await withTimeout(
          invoke<MailboxFolderStatsRow[]>("mailbox_unread_counts", { accountId: account.id }),
          BOOT_INVOKE_TIMEOUT_MS,
        );
        let unread = 0;
        for (const row of rows) {
          if (!isInboxLikeMailbox(row.mailbox)) continue;
          unread += Math.max(0, Math.floor(Number(row.unreadCount)) || 0);
        }
        return [account.id, unread] as const;
      } catch (error) {
        console.warn("mailbox_unread_counts (compte)", account.id, error);
        const prev = state.accountInboxUnread[account.id];
        return [account.id, typeof prev === "number" ? prev : 0] as const;
      }
    }),
  );
  const next: Record<string, number> = {};
  for (const [id, n] of entries) next[id] = n;
  state.accountInboxUnread = next;
}
