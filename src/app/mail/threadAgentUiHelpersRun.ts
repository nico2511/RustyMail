import type { AssistSkillId } from "../../assistAgent";
import { assistStepLabel, defaultEnabledSkillIds } from "../../assistAgent";
import { state } from "../state";

export function agentOfferSlotsStep(session: NonNullable<typeof state.agentSession>): boolean {
  return session.plan?.offerSlotStep ?? session.offerSlotsStep;
}

export function agentPrepareReplyStepCount(session: NonNullable<typeof state.agentSession>): number {
  const planned = session.plan?.steps.length;
  if (planned && planned > 0) {
    return planned + (session.plan?.needsClarification ? 1 : 0);
  }
  if (session.assistMode === "quick") return agentOfferSlotsStep(session) ? 2 : 1;
  return agentOfferSlotsStep(session) ? 5 : 4;
}

export function agentStepProgressLabel(session: NonNullable<typeof state.agentSession>): string {
  const n = agentPrepareReplyStepCount(session);
  const order = ["analyzeIntent", "extractFacts", "clarification", "draftReply", "suggestSlots"];
  const idx = Math.max(0, order.indexOf(session.step));
  return `${idx + 1}/${n} · ${assistStepLabel(session.step)}`;
}

export function agentSkillEnabled(skill: AssistSkillId): boolean {
  const s = state.agentSession;
  if (!s) return false;
  const skills = s.enabledSkills.length ? s.enabledSkills : defaultEnabledSkillIds(s.assistMode);
  return skills.includes(skill);
}
