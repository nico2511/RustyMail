// @ts-nocheck — DOM wiring; tighten types incrementally.
import { onThreadMove } from "./threadListActions";

export function wireEventsDomInboxListTrashArchive(): void {
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
}
