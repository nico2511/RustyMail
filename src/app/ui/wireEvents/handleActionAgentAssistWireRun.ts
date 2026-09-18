import { state, render } from "./depsCore";
import {
  agentInsertDraftIntoCompose,
  agentPrepareReplyContinue,
  agentPrepareReplyStart,
  bulkTrashVisibleThreads,
  llmQuickRepliesComposeUi,
  micAction,
  onEmptyTrashMailbox,
  saveAccount,
  stopAgentTelemetry,
  summarizeSenderThreadsLight,
  syncInbox,
} from "./depsSearchMail";

export async function tryHandleAgentAssistWire(action: string, element?: HTMLElement): Promise<boolean> {
  switch (action) {
    case "agent-prepare-start":
      void agentPrepareReplyStart();
      return true;
    case "agent-prepare-continue":
      void agentPrepareReplyContinue();
      return true;
    case "agent-prepare-cancel":
      void Promise.resolve(stopAgentTelemetry()).then(() => {
        state.agentSession = null;
        render();
      });
      return true;
    case "agent-insert-compose":
      void agentInsertDraftIntoCompose();
      return true;
    case "agent-append-slot": {
      const slot = element?.dataset.slot?.trim();
      if (slot) void agentInsertDraftIntoCompose(slot);
      return true;
    }
    case "agent-append-all-slots": {
      const s = state.agentSession;
      if (s?.slots.length) void agentInsertDraftIntoCompose(s.slots.join("\n"));
      return true;
    }
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
    case "save-account":
      await saveAccount();
      return true;
    case "sync-inbox":
      void syncInbox({ background: state.view === "thread" });
      return true;
    case "empty-trash-mailbox":
      void onEmptyTrashMailbox();
      return true;
    case "bulk-trash-visible":
      void bulkTrashVisibleThreads();
      return true;
    default:
      return false;
  }
}
