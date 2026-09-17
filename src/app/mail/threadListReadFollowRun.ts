import { invoke } from "@tauri-apps/api/core";

import { savedDraftIdFromThreadId } from "../../mailboxKinds";
import { currentAccount } from "../core/accountContext";
import { MAIL_ACTION_TIMEOUT_MS } from "../core/timeouts";
import { fetchOpenThreadOrNotify } from "./fetchOpenThread";
import { reloadCurrentThreadList } from "./mailListView";
import { tauriErrorMessage, withTimeout } from "../lib/tauriCommand";
import { isTauriRuntime } from "../lib/tauriRuntime";
import { toast } from "../lib/toast";
import { render } from "../dispatch";
import { state } from "../state";
import {
  requireThreadListActionsDeps,
  sourceMailboxForThread,
} from "./threadListActionsContext";

export async function onThreadSeen(kind: "read" | "unread", threadId: string): Promise<void> {
  if (!threadId.trim()) return;
  if (savedDraftIdFromThreadId(threadId)) {
    toast("Marquer lu / non lu : disponible pour les mails IMAP, pas pour les brouillons sauvegardés.");
    return;
  }
  if (!isTauriRuntime()) {
    toast("Marquer lu/non-lu : IMAP requiert l’app Tauri.");
    return;
  }
  const account = currentAccount();
  if (!account) {
    toast("Configurez d’abord un compte IMAP.");
    return;
  }
  const mailbox = sourceMailboxForThread(threadId);
  const cmd = kind === "read" ? "thread_mark_read" : "thread_mark_unread";
  const d = requireThreadListActionsDeps();
  try {
    const msg = await withTimeout(
      invoke<string>(cmd, { accountId: account.id, mailbox, threadId }),
      MAIL_ACTION_TIMEOUT_MS,
    );
    toast(msg);
    await reloadCurrentThreadList(false);
    await d.loadMailboxUnread();
    if (state.view === "thread" && state.selectedThreadId === threadId) {
      const refreshed = await fetchOpenThreadOrNotify(threadId);
      if (refreshed) state.selectedThread = refreshed;
    }
    render();
  } catch (err) {
    console.error(cmd, err);
    toast(tauriErrorMessage(err));
    render();
  }
}

export async function onThreadToggleFollow(threadId: string): Promise<void> {
  const tid = String(threadId ?? "").trim();
  if (!tid) return;
  if (savedDraftIdFromThreadId(tid)) {
    toast("Suivre : disponible pour les mails IMAP, pas pour les brouillons sauvegardés.");
    return;
  }
  if (!isTauriRuntime()) {
    toast("Suivre un fil : requiert l’app Tauri.");
    return;
  }
  const account = currentAccount();
  if (!account) {
    toast("Configurez d’abord un compte IMAP.");
    return;
  }
  try {
    const next = await withTimeout(
      invoke<boolean>("thread_toggle_follow", { accountId: account.id, threadId: tid }),
      MAIL_ACTION_TIMEOUT_MS,
    );
    for (const row of state.threads) {
      if (String(row.id) === tid) {
        row.followed = next;
        break;
      }
    }
    toast(next ? "Fil ajouté au suivi." : "Fil retiré du suivi.");
    render();
    await reloadCurrentThreadList(false);
    render();
  } catch (err) {
    console.error("thread_toggle_follow", err);
    toast(tauriErrorMessage(err));
    render();
  }
}
