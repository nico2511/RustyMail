import { invoke } from "@tauri-apps/api/core";

import {
  assistPhaseForSkill,
  buildAssistPayload,
  type AssistResult,
  type AssistSkillId,
} from "../../assistAgent";
import { isLlmCancelledError, runLlmStreamJob } from "../../llmStream";
import { tauriErrorMessage } from "../lib/tauriCommand";
import { toast } from "../lib/toast";
import { render } from "../dispatch";
import { state } from "../state";
import {
  agentAssistBasePayload,
  agentAssistPhasePayload,
  mergeAgentRecommendations,
  stopAgentTelemetry,
} from "./agentAssistSessionHelpers";
import { agentSkillEnabled, paintAgentDraftDom } from "./threadAiStreamDom";

export async function agentRunExtractFacts(signal: AbortSignal): Promise<boolean> {
  const s = state.agentSession;
  if (!s) return false;
  const res = await invoke<AssistResult>(
    "llm_assist_thread_phase",
    agentAssistPhasePayload(s, {
      phase: "extractFacts",
      priorIntent: s.intent ?? null,
      draftSoFar: "",
    }),
  );
  if (signal.aborted || !state.agentSession) return false;
  s.facts = res.facts;
  s.clarificationQuestions = res.clarificationQuestions ?? [];
  s.confidence = res.confidence;
  s.plan = res.plan ?? s.plan;
  s.offerSlotsStep = res.plan?.offerSlotStep ?? s.offerSlotsStep;
  if (res.needsClarification && !s.forceDraft) {
    s.step = "clarification";
    return false;
  }
  await agentRunPostExtractSkills(signal);
  return true;
}

async function agentInvokeSkillPhase(
  skill: AssistSkillId,
  signal: AbortSignal,
  draftSoFar?: string,
): Promise<void> {
  if (!agentSkillEnabled(skill)) return;
  const s = state.agentSession;
  if (!s) return;
  const res = await invoke<AssistResult>(
    "llm_assist_thread_phase",
    agentAssistPhasePayload(s, {
      phase: assistPhaseForSkill(skill),
      priorIntent: s.intent ?? null,
      draftSoFar: draftSoFar ?? s.draft,
    }),
  );
  if (signal.aborted || !state.agentSession) return;
  mergeAgentRecommendations(s, res);
  if (res.safetyFlags?.length) {
    s.safetyFlags = [...new Set([...s.safetyFlags, ...res.safetyFlags])];
  }
  if (res.draftResponse?.trim()) s.draft = res.draftResponse.trim();
  s.plan = res.plan ?? s.plan;
}

async function agentRunPostExtractSkills(signal: AbortSignal): Promise<void> {
  await agentInvokeSkillPhase("actionItems", signal, "");
  await agentInvokeSkillPhase("riskFlagger", signal, "");
}

export async function agentRunDraftStream(signal: AbortSignal): Promise<boolean> {
  const s = state.agentSession;
  const tid = state.selectedThreadId?.trim();
  if (!s || !tid) return false;
  s.step = "draftReply";
  const done = await runLlmStreamJob({
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
      state.agentSession.draft = acc;
      paintAgentDraftDom(acc);
    },
  });
  if (signal.aborted || !state.agentSession) return false;
  if (done === "cancelled") {
    await stopAgentTelemetry();
    state.agentSession = null;
    toast("Assistant réponse annulé.");
    return false;
  }
  const draft =
    done.agentDraft?.draft?.trim() ?? done.displayText?.trim() ?? state.agentSession.draft.trim();
  state.agentSession.draft = draft;
  return true;
}

export async function agentRunConsistency(signal: AbortSignal): Promise<void> {
  const s = state.agentSession;
  if (!s || !agentSkillEnabled("consistencyCheck") || !s.draft.trim()) return;
  const res = await invoke<AssistResult>(
    "llm_assist_thread_phase",
    agentAssistPhasePayload(s, {
      phase: "consistencyCheck",
      priorIntent: s.intent ?? null,
      draftSoFar: s.draft,
    }),
  );
  if (signal.aborted || !state.agentSession) return;
  s.consistencyIssues = res.consistencyIssues ?? [];
  if (res.safetyFlags?.length) {
    s.safetyFlags = [...new Set([...s.safetyFlags, ...res.safetyFlags])];
  }
  s.plan = res.plan ?? s.plan;
  await agentInvokeSkillPhase("toneAdapter", signal);
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
