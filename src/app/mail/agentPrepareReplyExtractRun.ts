import { invoke } from "@tauri-apps/api/core";

import { assistPhaseForSkill, type AssistResult, type AssistSkillId } from "../../assistAgent";
import { toast } from "../lib/toast";
import { state } from "../state";
import { introducesLlmMeta, LLM_META_BODY_TOAST } from "./llmMetaGuard";
import { agentAssistPhasePayload, mergeAgentRecommendations } from "./agentAssistSessionHelpers";
import { agentSkillEnabled } from "./threadAiStreamDom";

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
  const previousDraft = s.draft;
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
  const toneError = (res.runSteps ?? []).find((step) => step.skill === "tone_adapter" && step.status === "error");
  const next = res.draftResponse?.trim() ?? "";
  if (toneError) {
    toast.error(toneError.message?.trim() || LLM_META_BODY_TOAST);
  } else if (next && introducesLlmMeta(previousDraft, next)) {
    toast.error(LLM_META_BODY_TOAST);
  } else if (next) {
    s.draft = next;
  }
  s.plan = res.plan ?? s.plan;
}

async function agentRunPostExtractSkills(signal: AbortSignal): Promise<void> {
  await agentInvokeSkillPhase("actionItems", signal, "");
  await agentInvokeSkillPhase("riskFlagger", signal, "");
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
  s.rewriteGuidance = res.rewriteGuidance;
  if (res.safetyFlags?.length) {
    s.safetyFlags = [...new Set([...s.safetyFlags, ...res.safetyFlags])];
  }
  s.plan = res.plan ?? s.plan;
  await agentInvokeSkillPhase("toneAdapter", signal);
}
