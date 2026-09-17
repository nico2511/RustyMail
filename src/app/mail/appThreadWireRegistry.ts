/** Thread / mailbox list wire deps — extracted from appModuleRegistry.ts */
import { navPop } from "../../navigation";
import { loadNewsletterRules } from "./newsletterRulesLoad";
import { openSavedDraftById } from "./savedDraftOpenRun";
import { registerEmptyTrashMailboxDeps } from "./emptyTrashMailbox";
import {
  loadMailView,
  loadMailboxUnread,
} from "./mailListView";
import { registerMailboxManageActionDeps } from "./mailboxManageAction";
import { openThread, registerOpenThreadDeps } from "./openThreadView";
import { scheduleSecurityLlmAugment } from "./mailSecurityDisplay";
import {
  hydrateMessageTranslationsFromCacheForThread,
  isSenderBatchSummarizeActive,
  summarizeThread,
} from "./threadAiRun";
import { clearThreadAiSummaryState } from "./threadAiSummaryState";
import { threadAiSummaryScoped } from "./threadAiStreamDom";
import { threadIsAutoMail } from "./threadAutoMail";
import { sortMessagesByReceivedDescending } from "./threadMessageSort";
import { sourceMailboxForThread, registerThreadListActionsDeps } from "./threadListActions";
import { registerThreadScrollToMessageDeps } from "./threadScrollToMessage";
import { stopAgentTelemetry } from "./agentWireActions";
import { registerSwitchMailboxRunDeps } from "./switchMailboxAction";

let autoThreadSummaryDoneFor: string | null = null;

export function registerAppThreadWireDeps(): void {
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

  registerEmptyTrashMailboxDeps({
    loadMailView: () => loadMailView(),
    loadMailboxUnread,
  });

  registerThreadListActionsDeps({
    loadMailboxUnread,
  });

  registerMailboxManageActionDeps({
    loadMailboxUnread,
    loadMailView,
  });

  registerThreadScrollToMessageDeps({
    sortMessagesByReceivedDescending,
  });

  registerSwitchMailboxRunDeps({ loadMailView });
}
