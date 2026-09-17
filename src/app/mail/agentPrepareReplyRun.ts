import { invoke } from "@tauri-apps/api/core";

import {
  assistPhaseForSkill,
  bindAssistTelemetry,
  buildAssistPayload,
  defaultEnabledSkillIds,
  type AssistMode,
  type AssistResult,
  type AssistSkillId,
} from "../../assistAgent";
import { isAiFeatureEnabled } from "../../aiFeatures";
import { isLlmCancelledError, runLlmStreamJob } from "../../llmStream";
import { t } from "../../i18n";
import { currentAccount } from "../core/accountContext";
import { threadIdsMatch } from "../lib/threadIdsMatch";
import { tauriErrorMessage, withTimeout } from "../lib/tauriCommand";
import { isTauriRuntime } from "../lib/tauriRuntime";
import { toast } from "../lib/toast";
import { render } from "../dispatch";
import { state } from "../state";
import { withLlmQueue } from "./llmJobQueue";
import {
  agentOfferSlotsStep,
  agentSkillEnabled,
  paintAgentDraftDom,
} from "./threadAiStreamDom";
import { threadIsAutoMail } from "./threadAutoMail";
import {
  agentAssistBasePayload,
  agentAssistPhasePayload,
  mergeAgentRecommendations,
  pushAgentTelemetry,
  stopAgentTelemetry,
} from "./agentAssistSessionHelpers";

export { stopAgentTelemetry } from "./agentAssistSessionHelpers";

export async function agentPrepareReplyStart(): Promise<void> {
  const tid = state.selectedThreadId?.trim();
  const accountId = currentAccount()?.id?.trim();
  if (!tid) {
    toast(t("toast.openThreadForAgent"));
    return;
  }
  if (!accountId) {
    toast(t("toast.selectAccountForAgent"));
    return;
  }
  if (threadIsAutoMail(state.selectedThread, tid)) {
    toast(t("toast.agentAutoMail"));
    return;
  }
  if (!isAiFeatureEnabled(state.appPrefs.ai, "featureAgentPrepareReplyEnabled")) {
    toast(t("toast.enableAgentInSettings"));
    return;
  }
  await stopAgentTelemetry();
  state.aiOpen = true;
  const assistMode: AssistMode = "deep";
  state.agentSession = {
    threadId: tid,
    accountId,
    assistMode,
    enabledSkills: defaultEnabledSkillIds(assistMode),
    step: "analyzeIntent",
    draft: "",
    slots: [],
    recommendations: [],
    busy: true,
    offerSlotsStep: false,
    clarificationQuestions: [],
    consistencyIssues: [],
    safetyFlags: [],
    forceDraft: false,
    telemetry: [],
  };
  const unlisten = await bindAssistTelemetry(tid, pushAgentTelemetry);
  if (state.agentSession) state.agentSession.unlistenTelemetry = unlisten;
  render();
  await withLlmQueue("Assistant réponse (1/3)", async (signal) => {
    try {
      const base = buildAssistPayload(tid, accountId, assistMode);
      const res = await invoke<AssistResult>("llm_assist_thread_phase", {
        payload: {
          ...base,
          phase: "analyzeIntent",
          priorIntent: null,
          draftSoFar: "",
        },
      });
      if (signal.aborted || !state.agentSession) return;
      state.agentSession = {
        ...state.agentSession,
        intent: res.intent,
        plan: res.plan,
        offerSlotsStep: res.plan?.offerSlotStep ?? res.intent?.needsScheduling ?? false,
        busy: false,
      };
    } catch (e) {
      toast(tauriErrorMessage(e));
      await stopAgentTelemetry();
      state.agentSession = null;
    }
    render();
  });
}

async function agentRunExtractFacts(signal: AbortSignal): Promise<boolean> {
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

async function agentRunDraftStream(signal: AbortSignal): Promise<boolean> {
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

async function agentRunConsistency(signal: AbortSignal): Promise<void> {
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

export async function agentPrepareReplyContinue(): Promise<void> {
  const s = state.agentSession;
  const tid = state.selectedThreadId?.trim();
  if (!s || !tid || s.busy || !threadIdsMatch(s.threadId, tid)) return;

  if (s.step === "clarification") {
    s.forceDraft = true;
    s.busy = true;
    render();
    await withLlmQueue("Assistant réponse · brouillon", async (signal) => {
      try {
        if (!(await agentRunDraftStream(signal))) return;
        await agentRunConsistency(signal);
        await agentRefreshPlanFromDraft();
      } catch (e) {
        if (!isLlmCancelledError(e)) toast(tauriErrorMessage(e));
      } finally {
        if (state.agentSession) state.agentSession.busy = false;
        render();
      }
    });
    return;
  }

  if (s.step === "analyzeIntent") {
    s.busy = true;
    render();
    await withLlmQueue("Assistant réponse · suite", async (signal) => {
      try {
        if (s.assistMode !== "quick") {
          const ok = await agentRunExtractFacts(signal);
          if (!ok) return;
        }
        if (!(await agentRunDraftStream(signal))) return;
        await agentRunConsistency(signal);
        await agentRefreshPlanFromDraft();
      } catch (e) {
        if (!isLlmCancelledError(e)) toast(tauriErrorMessage(e));
      } finally {
        if (state.agentSession) state.agentSession.busy = false;
        render();
      }
    });
    return;
  }

  if (s.step === "draftReply") {
    const draftTa = document.querySelector<HTMLTextAreaElement>("#agent-draft-text");
    if (draftTa) s.draft = draftTa.value;
    await agentRefreshPlanFromDraft();
    if (!agentOfferSlotsStep(s)) {
      render();
      return;
    }
    s.busy = true;
    s.step = "suggestSlots";
    render();
    await withLlmQueue("Assistant réponse · créneaux", async (signal) => {
      try {
        const res = await invoke<AssistResult>(
          "llm_assist_thread_phase",
          agentAssistPhasePayload(s, {
            phase: "suggestSlots",
            priorIntent: s.intent ?? null,
            draftSoFar: s.draft,
          }),
        );
        if (signal.aborted || !state.agentSession) return;
        state.agentSession.slots = res.slots ?? res.recommendations?.map((r) => r.label) ?? [];
        state.agentSession.plan = res.plan ?? state.agentSession.plan;
        state.agentSession.busy = false;
      } catch (e) {
        toast(tauriErrorMessage(e));
        if (state.agentSession) state.agentSession.busy = false;
      }
      render();
    });
  }
}
