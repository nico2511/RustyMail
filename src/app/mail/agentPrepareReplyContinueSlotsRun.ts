import { invoke } from "@tauri-apps/api/core";
import type { AssistResult } from "../../assistAgent";
import { threadIdsMatch } from "../lib/threadIdsMatch";
import { tauriErrorMessage } from "../lib/tauriCommand";
import { toast } from "../lib/toast";
import { render } from "../dispatch";
import { state } from "../state";
import { agentAssistPhasePayload } from "./agentAssistSessionHelpers";
import { agentRefreshPlanFromDraft } from "./agentPrepareReplyPipelineRun";
import { withLlmQueue } from "./llmJobQueue";
import { agentOfferSlotsStep } from "./threadAiStreamDom";

export async function agentPrepareReplyContinueFromDraftReply(): Promise<boolean> {
  const s = state.agentSession;
  const tid = state.selectedThreadId?.trim();
  if (!s || !tid || s.busy || !threadIdsMatch(s.threadId, tid) || s.step !== "draftReply") return false;
  const draftTa = document.querySelector<HTMLTextAreaElement>("#agent-draft-text");
  if (draftTa) s.draft = draftTa.value;
  await agentRefreshPlanFromDraft();
  if (!agentOfferSlotsStep(s)) {
    render();
    return true;
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
  return true;
}
