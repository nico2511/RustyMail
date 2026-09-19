// @ts-nocheck — DOM wiring; tighten types incrementally.
import { tryHandleAgentDataActionChange } from "./wireEventsDomDataActionAgentChangeRun";
import { tryHandleMailboxBriefModeChange } from "./wireEventsDomDataActionMailboxBriefChangeRun";

export function wireEventsDomDataActionChange(signal: AbortSignal): void {
  document.addEventListener(
    "change",
    (ev: Event) => {
      const t = ev.target as HTMLElement | null;
      if (!t) return;
      if (tryHandleAgentDataActionChange(t)) return;
      tryHandleMailboxBriefModeChange(t);
    },
    { signal },
  );
}
