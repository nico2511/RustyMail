import { invoke } from "@tauri-apps/api/core";
import type { SyncMailboxesOutcome } from "../../imapSyncTypes";
import { render } from "../dispatch";
import { currentAccount } from "../core/accountContext";
import { SYNC_INVOKE_TIMEOUT_MS } from "../core/timeouts";
import { isTauriRuntime } from "../lib/tauriRuntime";
import { tauriErrorMessage, withTimeout } from "../lib/tauriCommand";
import { toast } from "../lib/toast";
import { state } from "../state";
import { loadMailboxUnread, reloadCurrentThreadList } from "./mailListView";
import { refreshOrganizationReport } from "./orgOrganizationReportRefresh";

export async function onOrgSyncMailbox(mailbox: string): Promise<void> {
  const mb = mailbox.trim();
  if (!mb || !isTauriRuntime()) {
    toast("Synchronisation : disponible dans l’app Tauri.");
    return;
  }
  const account = currentAccount();
  if (!account?.id) {
    toast("Configurez d’abord un compte IMAP.");
    return;
  }
  state.organization.rowSyncMailbox = mb;
  render();
  try {
    const outcome = await withTimeout(
      invoke<SyncMailboxesOutcome>("sync_mailboxes", {
        accountId: account.id,
        mailboxes: [mb],
        focusMailbox: mb,
        limitPerMailbox: 80,
      }),
      SYNC_INVOKE_TIMEOUT_MS,
    );
    const n = (outcome.results ?? []).reduce((s, r) => s + (r.fetchedUids ?? 0), 0);
    toast(n > 0 ? `${n} message(s) importé(s) · ${mb}` : `Dossier à jour · ${mb}`);
    await refreshOrganizationReport();
    if (state.view === "list" && state.selectedMailbox === mb) {
      await reloadCurrentThreadList(false);
    }
    await loadMailboxUnread();
  } catch (e) {
    toast(tauriErrorMessage(e));
  } finally {
    state.organization.rowSyncMailbox = null;
    render();
  }
}
