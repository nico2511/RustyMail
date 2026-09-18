// @ts-nocheck — DOM wiring; tighten types incrementally.
import { defaultEnabledSkillIds, type AssistMode, type AssistSkillId } from "../../assistAgent";
import { agentRefreshPlanFromDraft } from "./agentWireActions";
import { enqueueMailboxDigestRefreshWhenIdle, mailboxDigestSlotInList } from "./mailboxDigest";
import { state } from "../state";
import { render } from "../dispatch";
import { handleAction } from "./handleActionRun";

export function wireEventsDomDataActionDispatch(signal: AbortSignal): void {
  document.querySelectorAll<HTMLElement>("[data-action]").forEach((host) => {
    host.addEventListener("click", (ev: MouseEvent) => {
      const cur = ev.currentTarget as HTMLElement | null;
      const el = cur ?? host;
      const action = (el.dataset.action ?? "").trim();
      void handleAction(action, el);
    });
  });

  document.addEventListener(
    "change",
    (ev: Event) => {
      const t = ev.target as HTMLElement | null;
      if (t?.dataset.action === "agent-toggle-skill") {
        const skill = t.dataset.skill as AssistSkillId | undefined;
        const s = state.agentSession;
        if (!skill || !s || s.busy) return;
        const checked = (t as HTMLInputElement).checked;
        const set = new Set(s.enabledSkills);
        if (checked) set.add(skill);
        else set.delete(skill);
        if (!set.has("analyzeIntent")) set.add("analyzeIntent");
        if (!set.has("draftReply")) set.add("draftReply");
        s.enabledSkills = [...set];
        void agentRefreshPlanFromDraft().then(() => render());
        return;
      }
      if (t?.dataset.action === "mailbox-brief-mode") {
        const v = (t as HTMLSelectElement).value as "auto" | "quick" | "decision" | "deep";
        if (v === state.mailboxBriefMode) return;
        state.mailboxBriefMode = v;
        if (mailboxDigestSlotInList()) {
          void enqueueMailboxDigestRefreshWhenIdle(true);
        }
        render();
        return;
      }
      if (t?.dataset.action !== "agent-set-mode") return;
      const mode = (t as HTMLSelectElement).value as AssistMode;
      const s = state.agentSession;
      if (!s || s.busy) return;
      s.assistMode = mode;
      s.enabledSkills = defaultEnabledSkillIds(mode);
      void agentRefreshPlanFromDraft().then(() => render());
    },
    { signal }
  );
}
