import { llmQuickRepliesComposeUi, summarizeSenderThreadsLight } from "./composeAssistWireActions";
import { micAction } from "./composeMicDictationMicActionRun";

export async function tryHandleAgentAssistComposeWire(action: string): Promise<boolean> {
  switch (action) {
    case "summarize-sender-threads":
      void summarizeSenderThreadsLight();
      return true;
    case "llm-quick-replies-compose":
      void llmQuickRepliesComposeUi();
      return true;
    case "mic":
      await micAction({ target: "compose" });
      return true;
    case "mic-thread-qa":
      await micAction({ target: "thread-qa" });
      return true;
    default:
      return false;
  }
}
