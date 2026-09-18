import { agentPrepareReplyContinueFromAnalyzeIntent } from "./agentPrepareReplyContinueAnalyzeRun";
import { agentPrepareReplyContinueFromClarification } from "./agentPrepareReplyContinueClarifyRun";
import { agentPrepareReplyContinueFromDraftReply } from "./agentPrepareReplyContinueSlotsRun";

export async function agentPrepareReplyContinue(): Promise<void> {
  if (await agentPrepareReplyContinueFromClarification()) return;
  if (await agentPrepareReplyContinueFromAnalyzeIntent()) return;
  await agentPrepareReplyContinueFromDraftReply();
}
