import { render } from "../dispatch";
import { state } from "../state";
import {
  agentInsertDraftIntoCompose,
  agentPrepareReplyContinue,
  agentPrepareReplyStart,
  stopAgentTelemetry,
} from "./agentWireActions";

export async function tryHandleAgentAssistSessionWire(action: string, element?: HTMLElement): Promise<boolean> {
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
    default:
      return false;
  }
}
