import { invoke } from "@tauri-apps/api/core";

import { savedDraftIdFromThreadId } from "../../mailboxKinds";
import { currentAccount } from "../core/accountContext";
import { MAIL_ACTION_TIMEOUT_MS } from "../core/timeouts";
import { tauriErrorMessage, withTimeout } from "../lib/tauriCommand";
import { isTauriRuntime } from "../lib/tauriRuntime";
import { toast } from "../lib/toast";
import { render } from "../dispatch";
import { state } from "../state";
import { refreshOrganizationReport } from "./orgOrganizationReportRefresh";
import { requireThreadListActionsDeps, sourceMailboxForThread } from "./threadListActionsContext";
import {
  optimisticRemoveThreadFromList,
  rollbackThreadListChange,
} from "./threadListMoveOptimisticRun";

export async function onThreadMoveTo(threadId: string, destMailbox: string): Promise<void> {
  const tid = String(threadId ?? "").trim();
  const dest = String(destMailbox ?? "").trim();
  if (!tid || !dest) return;
  if (savedDraftIdFromThreadId(tid)) {
    toast("Déplacer : disponible pour les mails IMAP, pas pour les brouillons sauvegardés.");
    return;
  }
  if (!isTauriRuntime()) {
    toast("Déplacer un fil : IMAP requiert l’app Tauri.");
    return;
  }
  const account = currentAccount();
  if (!account) {
    toast("Configurez d’abord un compte IMAP.");
    return;
  }
  const source = sourceMailboxForThread(tid);
  if (dest.toLowerCase() === source.toLowerCase()) return;
  const prev = optimisticRemoveThreadFromList(tid);
  const d = requireThreadListActionsDeps();
  try {
    const msg = await withTimeout(
      invoke<string>("move_thread_mailbox", {
        accountId: account.id,
        mailbox: source,
        threadId: tid,
        destMailbox: dest,
      }),
      MAIL_ACTION_TIMEOUT_MS,
    );
    toast(msg);
    state.moveOpen = false;
    state.moveThreadId = undefined;
    void d.loadMailboxUnread();
    if (!state.selectedThreadId) state.selectedThreadId = state.threads[0]?.id;
    render();
    if (state.view === "organization") void refreshOrganizationReport();
  } catch (err) {
    console.error("move_thread_mailbox", err);
    rollbackThreadListChange(tid, prev);
    toast(tauriErrorMessage(err));
  }
}

export async function confirmMoveDialog(): Promise<void> {
  const threadId = state.moveThreadId;
  if (!threadId) return;
  await onThreadMoveTo(threadId, state.moveTargetMailbox);
}
