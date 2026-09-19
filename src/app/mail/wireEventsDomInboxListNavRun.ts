// @ts-nocheck — DOM wiring; tighten types incrementally.
import { toast } from "../lib/toast";
import { threadIdsMatch } from "../lib/threadIdsMatch";
import { openThread } from "./openThreadView";
import { switchMailbox } from "./switchMailboxAction";
import { state } from "../state";

export function wireEventsDomInboxListNav(): void {
  document.querySelectorAll<HTMLElement>("[data-toast]").forEach((element) => {
    element.addEventListener("click", () => toast(element.dataset.toast ?? "Not implemented yet"));
  });
  document.querySelectorAll<HTMLButtonElement>("[data-mailbox]").forEach((el) => {
    el.addEventListener("click", () => {
      if (el.dataset.action?.trim()) return;
      void (async () => {
        await switchMailbox(el.dataset.mailbox || "INBOX");
      })();
    });
  });
  document.querySelectorAll<HTMLElement>(".thread-row-main[data-open-thread]").forEach((element) => {
    element.addEventListener("click", () => {
      const tid = element.dataset.threadId ?? "";
      const preserveAi = Boolean(
        state.aiOutput?.trim() && threadIdsMatch(state.aiThreadScope, tid),
      );
      void openThread(tid, { preserveAi });
    });
  });
  document.querySelectorAll<HTMLButtonElement>(".digest-open-thread[data-thread-id]").forEach((element) => {
    element.addEventListener("click", (e) => {
      e.preventDefault();
      void openThread(element.dataset.threadId ?? "");
    });
  });
}
