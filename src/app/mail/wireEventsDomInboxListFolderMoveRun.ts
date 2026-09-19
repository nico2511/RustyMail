// @ts-nocheck — DOM wiring; tighten types incrementally.
import { onThreadMoveTo } from "./threadListActions";
import { state } from "../state";

export function wireEventsDomInboxListFolderMove(): void {
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
