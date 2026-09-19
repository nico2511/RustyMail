// @ts-nocheck — DOM wiring; tighten types incrementally.
import { onAttachmentAction } from "./mailContentWireActions";

export function wireEventsDomThreadAttachmentButtons(): void {
  document.querySelectorAll<HTMLButtonElement>("[data-att-download][data-msg-id]").forEach((el) => {
    el.addEventListener("click", (e) => {
      e.stopPropagation();
      void onAttachmentAction("download", el.dataset.msgId ?? "", el.dataset.attDownload ?? "");
    });
  });
  document.querySelectorAll<HTMLButtonElement>("[data-att-open][data-msg-id]").forEach((el) => {
    el.addEventListener("click", (e) => {
      e.stopPropagation();
      void onAttachmentAction("open", el.dataset.msgId ?? "", el.dataset.attOpen ?? "", el.dataset.attName ?? "");
    });
  });
}
