import { invoke } from "@tauri-apps/api/core";

import {
  bindAssistTelemetry,
  buildAssistPayload,
  defaultEnabledSkillIds,
  type AssistMode,
  type AssistResult,
} from "../../assistAgent";
import { isAiFeatureEnabled } from "../../aiFeatures";
import { t } from "../../i18n";
import { currentAccount } from "../core/accountContext";
import { tauriErrorMessage } from "../lib/tauriCommand";
import { toast } from "../lib/toast";
import { render } from "../dispatch";
import { state } from "../state";
import { withLlmQueue } from "./llmJobQueue";
import { threadIsAutoMail } from "./threadAutoMail";
import { pushAgentTelemetry, stopAgentTelemetry } from "./agentAssistSessionHelpers";

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
