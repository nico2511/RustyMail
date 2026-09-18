// @ts-nocheck — DOM wiring; tighten types incrementally.
import { toast } from "../lib/toast";
import { threadIdsMatch } from "../lib/threadIdsMatch";
import { openThread } from "./openThreadView";
import { onThreadMove, onThreadMoveTo } from "./threadListActions";
import { switchMailbox } from "./switchMailboxAction";
import { state } from "../state";

export function wireEventsDomInboxList(signal: AbortSignal): void {
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
        state.aiOutput?.trim() && threadIdsMatch(state.aiThreadScope, tid)
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
  document.querySelectorAll<HTMLButtonElement>("[data-mv=trash][data-thread-id]").forEach((el) => {
    el.addEventListener("click", (e) => {
      e.stopPropagation();
      void onThreadMove("trash", el.dataset.threadId ?? "", el.dataset.sourceMailbox);
    });
  });
  document.querySelectorAll<HTMLButtonElement>("[data-mv=archive][data-thread-id]").forEach((el) => {
    el.addEventListener("click", (e) => {
      e.stopPropagation();
      void onThreadMove("archive", el.dataset.threadId ?? "", el.dataset.sourceMailbox);
    });
  });
  document.querySelectorAll<HTMLSelectElement>("select.inbox-thread-folder-move").forEach((el) => {
    el.addEventListener("mousedown", (e) => e.stopPropagation());
    el.addEventListener("click", (e) => e.stopPropagation());
    el.addEventListener("change", (e) => {
      e.stopPropagation();
      const dest = el.value.trim();
      const tid = el.dataset.threadId ?? "";
      if (!dest || !tid) return;
      el.value = "";
      void onThreadMoveTo(tid, dest);
    });
  });
  document.querySelector<HTMLSelectElement>("#move-target-select")?.addEventListener("change", (event) => {
    state.moveTargetMailbox = (event.currentTarget as HTMLSelectElement).value || state.moveTargetMailbox;
  });
}
