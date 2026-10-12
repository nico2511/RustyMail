import { invoke } from "@tauri-apps/api/core";
import type { AppPrefsAi } from "../../prefs_defaults";
import { isAiFeatureEnabled } from "../../aiFeatures";
import { isInboxLikeMailbox, savedDraftIdFromThreadId } from "../../mailboxKinds";
import { currentAccount } from "../core/accountContext";
import { MAIL_ACTION_TIMEOUT_MS } from "../core/timeouts";
import { tauriErrorMessage, withTimeout } from "../lib/tauriCommand";
import { toast } from "../lib/toast";
import { render } from "../dispatch";
import { isTauriRuntime } from "../lib/tauriRuntime";
import { loadMailboxUnread } from "./mailListView";
import { state } from "../state";
import type { OpenThreadDeps } from "./openThreadViewDepsRun";

function sameMailboxName(a: string | undefined, b: string | undefined): boolean {
  return (a ?? "").trim().toLowerCase() === (b ?? "").trim().toLowerCase();
}

/** État local avant mark-read : permet de revenir en arrière si la commande échoue. */
type ThreadReadLocalUndo = () => void;

/**
 * Applique « lu » en mémoire (fil + compteurs) avant la réponse backend.
 * `inboxFilterCounts` ne concerne que le dossier affiché : décrémenté seulement si le fil y est.
 */
export function applyThreadReadLocal(threadId: string, mailbox: string): ThreadReadLocalUndo {
  const tid = String(threadId);
  const prevSelectedUnread =
    state.selectedThread && String(state.selectedThread.id) === tid ? state.selectedThread.unread : undefined;
  const ti = state.threads.findIndex((t) => String(t.id) === tid);
  const prevRowUnread = ti >= 0 ? state.threads[ti]!.unread : undefined;

  if (prevSelectedUnread !== undefined) {
    state.selectedThread = { ...state.selectedThread!, unread: false };
  }
  if (ti >= 0) {
    state.threads[ti] = { ...state.threads[ti]!, unread: false };
  }
  // Compteurs locaux avant IMAP : le Retour BAL peint déjà les bons badges
  // sans attendre loadMailboxUnread + un 2ᵉ render() complet.
  const cur = state.mailboxUnread[mailbox];
  if (typeof cur === "number" && cur > 0) {
    state.mailboxUnread = { ...state.mailboxUnread, [mailbox]: cur - 1 };
  }
  if (
    state.inboxFilterCounts &&
    state.inboxFilterCounts.unread > 0 &&
    sameMailboxName(mailbox, state.selectedMailbox)
  ) {
    state.inboxFilterCounts = {
      ...state.inboxFilterCounts,
      unread: state.inboxFilterCounts.unread - 1,
    };
  }
  if (isInboxLikeMailbox(mailbox)) {
    const accountId = currentAccount()?.id?.trim();
    if (accountId) {
      const n = state.accountInboxUnread[accountId];
      if (typeof n === "number" && n > 0) {
        state.accountInboxUnread = { ...state.accountInboxUnread, [accountId]: n - 1 };
      }
    }
  }

  return () => {
    // Les compteurs sont rechargés depuis SQLite par l’appelant ; ici seulement les drapeaux du fil.
    if (prevSelectedUnread !== undefined && state.selectedThread && String(state.selectedThread.id) === tid) {
      state.selectedThread = { ...state.selectedThread, unread: prevSelectedUnread };
    }
    const idx = state.threads.findIndex((t) => String(t.id) === tid);
    if (prevRowUnread !== undefined && idx >= 0) {
      state.threads[idx] = { ...state.threads[idx]!, unread: prevRowUnread };
    }
  };
}

function isInvokeTimeout(error: unknown): boolean {
  return /timeout/i.test(tauriErrorMessage(error));
}

/**
 * Marque lu en local immédiatement, puis `thread_mark_read` en arrière-plan.
 * Le backend écrit SQLite avant IMAP et garde le drapeau en file si IMAP échoue (rejoué à la sync).
 * Échec backend (rien persisté) : retour arrière du fil, compteurs relus depuis SQLite, toast.
 */
export async function markOpenedThreadReadIfUnread(
  threadId: string,
  deps: OpenThreadDeps,
): Promise<void> {
  if (savedDraftIdFromThreadId(threadId)) return;
  if (!isTauriRuntime()) return;
  const unread = Boolean(state.selectedThread?.unread);
  if (!unread) return;
  const account = currentAccount();
  const accountId = account?.id?.trim();
  if (!accountId) return;
  const mailbox = deps.sourceMailboxForThread(threadId);
  const undo = applyThreadReadLocal(threadId, mailbox);
  try {
    await withTimeout(invoke<string>("thread_mark_read", { accountId, mailbox, threadId }), MAIL_ACTION_TIMEOUT_MS);
  } catch (e) {
    console.warn("thread_mark_read (ouverture)", e);
    // Timeout : le backend a déjà écrit SQLite avant d’attendre IMAP ; pas de retour arrière.
    if (!isInvokeTimeout(e)) {
      undo();
      toast.warning(`Impossible de marquer le fil comme lu : ${tauriErrorMessage(e)}`);
    }
    await loadMailboxUnread().catch(() => {});
    // Seulement si le fil est encore affiché : pas de repaint BAL complet après « Retour ».
    if (state.view === "thread") render();
    return;
  }
  // Met à jour state seulement — pas de render() : le fil a déjà le unread local,
  // et un paint BAL après Retour (ou un 2ᵉ rebuild liste) gelait l’UI.
  await loadMailboxUnread().catch(() => {});
}

export async function maybeAutoSummarizeThreadOnOpen(
  threadId: string,
  thread: { messages?: Array<{ messageId?: string }> },
  deps: OpenThreadDeps,
): Promise<void> {
  const ai = state.appPrefs.ai as AppPrefsAi & {
    featureAutoThreadSummaryEnabled?: boolean;
    autoThreadSummaryMinMessages?: number;
  };
  if (!ai.featureAutoThreadSummaryEnabled) return;
  if (deps.isSenderBatchSummarizeActive()) return;
  if (!isAiFeatureEnabled(state.appPrefs.ai, "featureThreadSummaryEnabled")) return;
  const min = ai.autoThreadSummaryMinMessages ?? 6;
  if ((thread.messages?.length ?? 0) < min) return;
  if (deps.getAutoThreadSummaryDoneFor() === threadId) return;
  deps.setAutoThreadSummaryDoneFor(threadId);
  await deps.summarizeThread();
}
