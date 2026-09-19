// @ts-nocheck — DOM wiring; tighten types incrementally.
import { defaultEnabledSkillIds, type AssistMode, type AssistSkillId } from "../../assistAgent";
import { agentRefreshPlanFromDraft } from "./agentWireActions";
import { state } from "../state";
import { render } from "../dispatch";

export function tryHandleAgentDataActionChange(t: HTMLElement): boolean {
  if (t.dataset.action === "agent-toggle-skill") {
    const skill = t.dataset.skill as AssistSkillId | undefined;
    const s = state.agentSession;
    if (!skill || !s || s.busy) return true;
    const checked = (t as HTMLInputElement).checked;
    const set = new Set(s.enabledSkills);
    if (checked) set.add(skill);
    else set.delete(skill);
    if (!set.has("analyzeIntent")) set.add("analyzeIntent");
    if (!set.has("draftReply")) set.add("draftReply");
    s.enabledSkills = [...set];
    void agentRefreshPlanFromDraft().then(() => render());
    return true;
  }
  if (t.dataset.action !== "agent-set-mode") return false;
  const mode = (t as HTMLSelectElement).value as AssistMode;
  const s = state.agentSession;
  if (!s || s.busy) return true;
  s.assistMode = mode;
  s.enabledSkills = defaultEnabledSkillIds(mode);
  void agentRefreshPlanFromDraft().then(() => render());
  return true;
}
