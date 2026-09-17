import { invoke } from "@tauri-apps/api/core";
import type { Draft } from "../types";
import { currentAccount } from "../core/accountContext";
import { MAIL_ACTION_TIMEOUT_MS } from "../core/timeouts";
import { isTauriRuntime } from "../lib/tauriRuntime";
import { tauriErrorMessage, withTimeout } from "../lib/tauriCommand";
import { toast } from "../lib/toast";
import { render } from "../dispatch";
import { state } from "../state";
import { draftHasRecipientsExtra } from "./composeDraftRecipients";

export type ComposeOrphanDraftSessionDeps = {
  startNewDraftSession: () => void;
  enterComposeView: (opts?: { skipHistory?: boolean }) => void;
  loadComposeMarkdownIntoEditor: (markdown: string) => void;
  syncPreviewOpenFromComposeLayout: () => void;
  resetMarkdownEditorHistory: () => void;
  computePreview: () => void | Promise<void>;
  scheduleDraftRevisionSave: (delayMs?: number) => void;
  upsertSavedDraftSilent: () => Promise<boolean>;
};

let composeOrphanDraftSessionDeps: ComposeOrphanDraftSessionDeps | null = null;

export function registerComposeOrphanDraftSessionDeps(deps: ComposeOrphanDraftSessionDeps): void {
  composeOrphanDraftSessionDeps = deps;
}

function orphanDeps(): ComposeOrphanDraftSessionDeps {
  if (!composeOrphanDraftSessionDeps) throw new Error("registerComposeOrphanDraftSessionDeps not called");
  return composeOrphanDraftSessionDeps;
}

export async function resumeOrphanDraftSession(sessionId: string): Promise<void> {
  const sid = sessionId.trim();
  const accountId = currentAccount()?.id?.trim();
  if (!sid || !accountId || !isTauriRuntime()) return;
  const d = orphanDeps();
  try {
    const draft = await withTimeout(
      invoke<Draft>("draft_orphan_session_open", { accountId, sessionId: sid }),
      MAIL_ACTION_TIMEOUT_MS,
    );
    state.resumeDraftModal = null;
    d.startNewDraftSession();
    state.draftSessionId = sid;
    state.draft = draft;
    d.loadComposeMarkdownIntoEditor(draft.markdownBody ?? "");
    d.enterComposeView();
    state.composeCcBccOpen = draftHasRecipientsExtra(draft);
    state.composeLayout = "split";
    d.syncPreviewOpenFromComposeLayout();
    d.resetMarkdownEditorHistory();
    await d.upsertSavedDraftSilent();
    toast("Brouillon repris.");
    render();
    window.setTimeout(() => void d.computePreview(), 0);
    d.scheduleDraftRevisionSave(350);
  } catch (e) {
    console.error("draft_orphan_session_open", e);
    toast(`Reprise impossible : ${tauriErrorMessage(e)}`);
  }
}

export async function dismissOrphanDraftSession(sessionId: string): Promise<void> {
  const sid = sessionId.trim();
  const accountId = currentAccount()?.id?.trim();
  if (!sid || !accountId || !isTauriRuntime()) return;
  try {
    await withTimeout(
      invoke("draft_revision_purge_session", { accountId, sessionId: sid }),
      MAIL_ACTION_TIMEOUT_MS,
    );
  } catch (e) {
    console.error("purge orphan", e);
  }
  if (state.resumeDraftModal) {
    const next = state.resumeDraftModal.sessions.filter((s) => s.sessionId !== sid);
    state.resumeDraftModal = next.length ? { sessions: next } : null;
  }
  render();
}
