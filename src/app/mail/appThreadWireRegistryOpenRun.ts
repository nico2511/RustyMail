import { navPop } from "../../navigation";
import { loadNewsletterRules } from "./newsletterRulesLoad";
import { openSavedDraftById } from "./savedDraftOpenRun";
import { scheduleSecurityLlmAugment } from "./mailSecurityDisplay";
import {
  hydrateMessageTranslationsFromCacheForThread,
  summarizeThread,
} from "./threadAiWireUiRun";
import { isSenderBatchSummarizeActive } from "./threadAiRun";
import { clearThreadAiSummaryState } from "./threadAiSummaryState";
import { threadAiSummaryScoped } from "./threadAiStreamDom";
import { threadIsAutoMail } from "./threadAutoMail";
import { sourceMailboxForThread } from "./threadListActions";
import { registerOpenThreadDeps } from "./openThreadView";
import { stopAgentTelemetry } from "./agentWireActions";

let autoThreadSummaryDoneFor: string | null = null;

export function registerAppThreadWireOpenDeps(): void {
  registerOpenThreadDeps({
    openSavedDraftById,
    navPop,
    threadAiSummaryScoped,
    clearThreadAiSummaryState,
    threadIsAutoMail,
    stopAgentTelemetry,
    loadNewsletterRules,
    hydrateMessageTranslationsFromCacheForThread,
    scheduleSecurityLlmAugment,
    summarizeThread,
    sourceMailboxForThread,
    isSenderBatchSummarizeActive: () => isSenderBatchSummarizeActive(),
    getAutoThreadSummaryDoneFor: () => autoThreadSummaryDoneFor,
    setAutoThreadSummaryDoneFor: (threadId) => {
      autoThreadSummaryDoneFor = threadId;
    },
  });
}
