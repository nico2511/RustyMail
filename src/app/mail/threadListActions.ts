import { invoke } from "@tauri-apps/api/core";
import { optimisticOrgRemoveThreads } from "../../organizationView";
import {
  clearThreadsRecentlyRemoved,
  markThreadsRecentlyRemoved,
} from "../../recentlyRemovedThreads";
import {
  LOCAL_SAVED_DRAFTS_MAILBOX,
  mailboxesAllowedForMove,
  savedDraftIdFromThreadId,
} from "../../mailboxKinds";
import { currentAccount } from "../core/accountContext";
import { MAIL_ACTION_TIMEOUT_MS } from "../core/timeouts";
import { fetchOpenThreadOrNotify } from "./fetchOpenThread";
import { reloadCurrentThreadList } from "./mailListView";
import { tauriErrorMessage, withTimeout } from "../lib/tauriCommand";
import { isTauriRuntime } from "../lib/tauriRuntime";
import { toast } from "../lib/toast";
import { render } from "../dispatch";
import { state } from "../state";

export type ThreadListActionsDeps = {
  loadMailboxUnread: () => Promise<void>;
  refreshOrganizationReport: () => Promise<void>;
};

let threadListActionsDeps: ThreadListActionsDeps | null = null;

export function registerThreadListActionsDeps(deps: ThreadListActionsDeps): void {
  threadListActionsDeps = deps;
}

function listActionsDeps(): ThreadListActionsDeps {
  if (!threadListActionsDeps) throw new Error("registerThreadListActionsDeps not called");
  return threadListActionsDeps;
}

export function sourceMailboxForThread(threadId: string): string {
  const row = state.threads.find((t) => String(t.id) === String(threadId));
  const raw = row?.mailbox ?? state.selectedMailbox ?? "INBOX";
  const trimmed = String(raw ?? "").trim();
  return trimmed && trimmed !== LOCAL_SAVED_DRAFTS_MAILBOX ? trimmed : (state.selectedMailbox || "INBOX");
}

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
  const prevThreads = state.threads;
  const prevSelectedId = state.selectedThreadId;
  const prevView = state.view;
  const prevOrgReport = state.organization.report;
  markThreadsRecentlyRemoved([threadId]);
  state.threads = state.threads.filter((t) => t.id !== threadId);
  if (state.view === "thread" && state.selectedThreadId === threadId) {
    state.view = "list";
    state.selectedThread = undefined;
    state.selectedThreadId = undefined;
  }
  if (state.view === "organization" && state.organization.report) {
    state.organization.report = optimisticOrgRemoveThreads(state.organization.report, [threadId]);
  }
  render();
  const d = listActionsDeps();
  try {
    const msg = await withTimeout(
      invoke<string>(cmd, { accountId: account.id, mailbox, threadId }),
      MAIL_ACTION_TIMEOUT_MS,
    );
    toast(msg);
    void d.loadMailboxUnread();
    if (!state.selectedThreadId) state.selectedThreadId = state.threads[0]?.id;
    render();
    if (state.view === "organization") void d.refreshOrganizationReport();
  } catch (err) {
    console.error(cmd, err);
    clearThreadsRecentlyRemoved([threadId]);
    state.threads = prevThreads;
    state.selectedThreadId = prevSelectedId;
    state.view = prevView;
    state.organization.report = prevOrgReport;
    toast(tauriErrorMessage(err));
    render();
  }
}

export function openMoveDialog(threadId: string): void {
  state.moveThreadId = threadId;
  const source = sourceMailboxForThread(threadId).toLowerCase();
  const allowed = mailboxesAllowedForMove(state.mailboxes).filter((m) => m.toLowerCase() !== source);
  state.moveTargetMailbox = allowed.includes("INBOX") ? "INBOX" : (allowed[0] ?? "INBOX");
  state.moveOpen = true;
  render();
}

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
  const prevThreads = state.threads;
  const prevSelectedId = state.selectedThreadId;
  const prevView = state.view;
  const prevOrgReport = state.organization.report;
  markThreadsRecentlyRemoved([tid]);
  state.threads = state.threads.filter((t) => t.id !== tid);
  if (state.view === "thread" && state.selectedThreadId === tid) {
    state.view = "list";
    state.selectedThread = undefined;
    state.selectedThreadId = undefined;
  }
  if (state.view === "organization" && state.organization.report) {
    state.organization.report = optimisticOrgRemoveThreads(state.organization.report, [tid]);
  }
  render();
  const d = listActionsDeps();
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
    if (state.view === "organization") void d.refreshOrganizationReport();
  } catch (err) {
    console.error("move_thread_mailbox", err);
    clearThreadsRecentlyRemoved([tid]);
    state.threads = prevThreads;
    state.selectedThreadId = prevSelectedId;
    state.view = prevView;
    state.organization.report = prevOrgReport;
    toast(tauriErrorMessage(err));
    render();
  }
}

export async function confirmMoveDialog(): Promise<void> {
  const threadId = state.moveThreadId;
  if (!threadId) return;
  await onThreadMoveTo(threadId, state.moveTargetMailbox);
}

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
  const d = listActionsDeps();
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
