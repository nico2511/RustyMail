import { mailboxesAllowedForMove } from "../../mailboxKinds";
import { render } from "../dispatch";
import { state } from "../state";
import { sourceMailboxForThread } from "./threadListActionsContext";

export function openMoveDialog(threadId: string): void {
  state.moveThreadId = threadId;
  const source = sourceMailboxForThread(threadId).toLowerCase();
  const allowed = mailboxesAllowedForMove(state.mailboxes).filter((m) => m.toLowerCase() !== source);
  state.moveTargetMailbox = allowed.includes("INBOX") ? "INBOX" : (allowed[0] ?? "INBOX");
  state.moveOpen = true;
  render();
}
