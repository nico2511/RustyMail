import {
  LOCAL_SAVED_DRAFTS_MAILBOX,
} from "../../mailboxKinds";
import { state } from "../state";

export type ThreadListActionsDeps = {
  loadMailboxUnread: () => Promise<void>;
};

let threadListActionsDeps: ThreadListActionsDeps | null = null;

export function registerThreadListActionsDeps(deps: ThreadListActionsDeps): void {
  threadListActionsDeps = deps;
}

export function requireThreadListActionsDeps(): ThreadListActionsDeps {
  if (!threadListActionsDeps) throw new Error("registerThreadListActionsDeps not called");
  return threadListActionsDeps;
}

export function sourceMailboxForThread(threadId: string): string {
  const row = state.threads.find((t) => String(t.id) === String(threadId));
  const raw = row?.mailbox ?? state.selectedMailbox ?? "INBOX";
  const trimmed = String(raw ?? "").trim();
  return trimmed && trimmed !== LOCAL_SAVED_DRAFTS_MAILBOX ? trimmed : (state.selectedMailbox || "INBOX");
}
