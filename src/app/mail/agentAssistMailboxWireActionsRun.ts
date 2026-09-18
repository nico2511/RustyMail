import { state } from "../state";
import { saveAccount } from "./accountWireActions";
import { bulkTrashVisibleThreads } from "./bulkTrashList";
import { onEmptyTrashMailbox } from "./emptyTrashMailbox";
import { syncInbox } from "./syncInboxAction";

export async function tryHandleAgentAssistMailboxWire(action: string): Promise<boolean> {
  switch (action) {
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
