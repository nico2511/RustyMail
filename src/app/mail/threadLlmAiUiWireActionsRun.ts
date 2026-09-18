import { render } from "../dispatch";
import { state } from "../state";
import { toast } from "../lib/toast";
import { cancelLlmQueueJob } from "./llmQueueCancel";
import { scrollToThreadMessage } from "./threadScrollToMessage";
import {
  llmInboxDigestUi,
  llmQaThreadUi,
  llmQuickRepliesThreadUi,
  llmTranslateMessageUi,
  llmTranslateThreadUi,
  summarizeThread,
} from "./threadAiWireActions";

export async function tryHandleThreadLlmAiUiWire(action: string, element?: HTMLElement): Promise<boolean> {
  switch (action) {
    case "summarize":
      await summarizeThread();
      return true;
    case "llm-translate-thread":
      void llmTranslateThreadUi();
      return true;
    case "llm-translate-message": {
      const mid = element?.dataset.msgId?.trim();
      if (mid) void llmTranslateMessageUi(mid, element?.dataset.llmTranslateRefresh === "1");
      return true;
    }
    case "llm-quick-replies-thread":
      void llmQuickRepliesThreadUi();
      return true;
    case "llm-inbox-digest":
      void llmInboxDigestUi();
      return true;
    case "llm-cancel-job":
      cancelLlmQueueJob();
      toast("Annulation demandée…");
      return true;
    case "llm-qa-thread":
      void llmQaThreadUi();
      return true;
    case "llm-qa-clear":
      state.threadQaAnswer = null;
      state.threadQaStreamText = "";
      render();
      return true;
    case "qa-open-message": {
      const mid = element?.dataset.msgId?.trim();
      if (mid) scrollToThreadMessage(mid);
      return true;
    }
    default:
      return false;
  }
}
