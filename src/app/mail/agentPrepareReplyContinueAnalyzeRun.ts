import { isLlmCancelledError } from "../../llmStream";
import { threadIdsMatch } from "../lib/threadIdsMatch";
import { tauriErrorMessage } from "../lib/tauriCommand";
import { toast } from "../lib/toast";
import { render } from "../dispatch";
import { state } from "../state";
import {
  agentRefreshPlanFromDraft,
  agentRunConsistency,
  agentRunDraftStream,
  agentRunExtractFacts,
} from "./agentPrepareReplyPipelineRun";
import { withLlmQueue } from "./llmJobQueue";

export async function agentPrepareReplyContinueFromAnalyzeIntent(): Promise<boolean> {
  const s = state.agentSession;
  const tid = state.selectedThreadId?.trim();
  if (!s || !tid || s.busy || !threadIdsMatch(s.threadId, tid) || s.step !== "analyzeIntent") return false;
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
  return true;
}
