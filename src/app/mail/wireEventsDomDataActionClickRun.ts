// @ts-nocheck — DOM wiring; tighten types incrementally.
import { handleAction } from "./handleActionRun";

export function wireEventsDomDataActionClick(): void {
  document.querySelectorAll<HTMLElement>("[data-action]").forEach((host) => {
    host.addEventListener("click", (ev: MouseEvent) => {
      const cur = ev.currentTarget as HTMLElement | null;
      const el = cur ?? host;
      const action = (el.dataset.action ?? "").trim();
      void handleAction(action, el);
    });
  });
}
