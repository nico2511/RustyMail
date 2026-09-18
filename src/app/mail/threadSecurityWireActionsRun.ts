import {
  addNewsletterRuleFromSenderEmail,
  appendSecurityFilterToSearchDraft,
  moveThreadToJunkFromSecurityAction,
} from "./threadSecurityActionsRun";
import { state } from "../state";

export async function tryHandleThreadSecurityWire(action: string, element?: HTMLElement): Promise<boolean> {
  switch (action) {
    case "security-mark-newsletter": {
      const email = element?.dataset.senderEmail?.trim() ?? "";
      void addNewsletterRuleFromSenderEmail(email);
      return true;
    }
    case "security-move-junk": {
      const tid = element?.dataset.threadId?.trim() ?? "";
      const source = element?.dataset.sourceMailbox?.trim() || state.selectedMailbox || "INBOX";
      void moveThreadToJunkFromSecurityAction(tid, source);
      return true;
    }
    case "security-filter-search":
      appendSecurityFilterToSearchDraft();
      return true;
    default:
      return false;
  }
}
