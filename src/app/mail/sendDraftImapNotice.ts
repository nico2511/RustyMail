import type { SendDraftOutcome } from "../types";
import { toast } from "../lib/toast";

export function toastSendDraftImapNotice(outcome: SendDraftOutcome | undefined): void {
  const note = outcome?.imapNotice?.trim();
  if (!note) return;
  const shorten = (s: string, n = 220) => (s.length <= n ? s : `${s.slice(0, n)}…`);
  toast(`Information : ${shorten(note)}`);
}
