// @ts-nocheck — DOM wiring; tighten types incrementally.
import { toast } from "../lib/toast";
import { switchMailbox } from "./switchMailboxAction";

export function wireEventsDomInboxListSidebarNav(): void {
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
}
