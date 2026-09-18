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

export async function onThreadMove(
  kind: "trash" | "archive",
  threadId: string,
  mailboxOverride?: string,
): Promise<void> {
  if (!threadId.trim()) return;
  if (savedDraftIdFromThreadId(threadId)) {
    toast("Archive / corbeille : actions IMAP uniquement.");
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
  const mailbox = mailboxOverride?.trim() || sourceMailboxForThread(threadId);
  const cmd = kind === "trash" ? "move_thread_trash" : "move_thread_archive";
  const prev = optimisticRemoveThreadFromList(threadId);
  const d = requireThreadListActionsDeps();
  try {
    const msg = await withTimeout(
      invoke<string>(cmd, { accountId: account.id, mailbox, threadId }),
      MAIL_ACTION_TIMEOUT_MS,
    );
    toast(msg);
    void d.loadMailboxUnread();
    if (!state.selectedThreadId) state.selectedThreadId = state.threads[0]?.id;
    render();
    if (state.view === "organization") void refreshOrganizationReport();
  } catch (err) {
    console.error(cmd, err);
    rollbackThreadListChange(threadId, prev);
    toast(tauriErrorMessage(err));
  }
}
