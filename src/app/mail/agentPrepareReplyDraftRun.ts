import { invoke } from "@tauri-apps/api/core";

import { buildAssistPayload, type AssistResult } from "../../assistAgent";
import { runLlmStreamJob } from "../../llmStream";
import { tauriErrorMessage } from "../lib/tauriCommand";
import { toast } from "../lib/toast";
import { state } from "../state";
import { agentAssistBasePayload, stopAgentTelemetry } from "./agentAssistSessionHelpers";
import { introducesLlmMeta, LLM_META_BODY_TOAST } from "./llmMetaGuard";
import { paintAgentDraftDom } from "./threadAiStreamDom";

function threadPlainForMeta(): string {
  return (state.selectedThread?.messages ?? []).map((message) => message.cleanedText || "").join("\n");
}

function clearAgentDraftAfterMeta(message: string): void {
  const session = state.agentSession;
  if (!session) return;
  const leaked =
    message.includes("n’a pas été modifié") ||
    message.includes("n'a pas été modifié") ||
    introducesLlmMeta(threadPlainForMeta(), session.draft);
  if (!leaked) return;
  session.draft = "";
  paintAgentDraftDom("");
}

export async function agentRunDraftStream(signal: AbortSignal): Promise<boolean> {
  const s = state.agentSession;
  const tid = state.selectedThreadId?.trim();
  if (!s || !tid) return false;
  s.step = "draftReply";
  let done: Awaited<ReturnType<typeof runLlmStreamJob>>;
  try {
    done = await runLlmStreamJob({
    command: "llm_stream_agent_prepare_draft",
    args: {
      threadId: tid,
      accountId: s.accountId,
      assistMode: s.assistMode,
      priorIntent: s.intent ?? null,
      priorFacts: s.facts ?? null,
      forceDraft: s.forceDraft,
    },
    signal,
    onChunk: (acc) => {
      if (signal.aborted || !state.agentSession) return;
      if (introducesLlmMeta(threadPlainForMeta(), acc)) {
        state.agentSession.draft = "";
        paintAgentDraftDom("");
        return;
      }
      state.agentSession.draft = acc;
      paintAgentDraftDom(acc);
    },
  });
  } catch (error) {
    clearAgentDraftAfterMeta(tauriErrorMessage(error));
    throw error;
  }
  if (signal.aborted || !state.agentSession) return false;
  if (done === "cancelled") {
    await stopAgentTelemetry();
    state.agentSession = null;
    toast.warning("Assistant réponse annulé.");
    return false;
  }
  const draft =
    done.agentDraft?.draft?.trim() ?? done.displayText?.trim() ?? state.agentSession.draft.trim();
  if (introducesLlmMeta(threadPlainForMeta(), draft)) {
    state.agentSession.draft = "";
    paintAgentDraftDom("");
    toast.error(LLM_META_BODY_TOAST);
    return false;
  }
  state.agentSession.draft = draft;
  return true;
}

export async function agentRefreshPlanFromDraft(): Promise<void> {
  const s = state.agentSession;
  const tid = state.selectedThreadId?.trim();
  if (!s || !tid) return;
  try {
    const base = agentAssistBasePayload() ?? buildAssistPayload(tid, s.accountId, s.assistMode);
    const planRes = await invoke<AssistResult>("llm_assist_plan", {
      payload: {
        ...base,
        priorIntent: s.intent ?? null,
        priorFacts: s.facts ?? null,
        draft: s.draft,
      },
    });
    s.plan = planRes.plan;
    s.offerSlotsStep = planRes.plan?.offerSlotStep ?? false;
  } catch {
    /* garde le plan précédent */
  }
}
