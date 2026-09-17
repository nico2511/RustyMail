import { pickSystemMailboxes } from "../../mailboxKinds";
import { state } from "../state";

export function pickImapMailboxFallback(): string {
  if (state.mailboxes.includes("INBOX")) return "INBOX";
  const sys = pickSystemMailboxes(state.mailboxes);
  if (sys[0]?.name) return sys[0].name;
  return state.mailboxes[0] ?? "INBOX";
}
