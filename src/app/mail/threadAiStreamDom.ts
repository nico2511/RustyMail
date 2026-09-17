import type { AssistSkillId } from "../../assistAgent";
import { assistStepLabel, defaultEnabledSkillIds } from "../../assistAgent";
import { render } from "../dispatch";
import { formatPlainTextWithLinks } from "../lib/textFormat";
import { threadIdsMatch } from "../lib/threadIdsMatch";
import { state } from "../state";
import { zenSummaryHtmlFragments } from "./threadViewUiHelpers";

export function threadAiSummaryLiveFor(threadId: string): boolean {
  const tid = String(threadId).trim();
  return (
    state.view === "thread" &&
    Boolean(tid) &&
    threadIdsMatch(state.selectedThreadId, tid) &&
    threadIdsMatch(state.aiThreadScope, tid)
  );
}

export function applyThreadAiOutputIfLive(threadId: string, text: string): boolean {
  if (!threadAiSummaryLiveFor(threadId)) return false;
  state.aiOutput = text;
  return true;
}

let aiStreamPaintRaf = 0;
let aiStreamPaintFn: (() => void) | null = null;

export function scheduleAiStreamDomPaint(paint: () => void): void {
  aiStreamPaintFn = paint;
  if (aiStreamPaintRaf) return;
  aiStreamPaintRaf = window.requestAnimationFrame(() => {
    aiStreamPaintRaf = 0;
    aiStreamPaintFn?.();
    aiStreamPaintFn = null;
  });
}

export function paintThreadAiSummaryDom(text: string): void {
  scheduleAiStreamDomPaint(() => {
    const trimmed = text.trim();
    if (!trimmed) return;
    const html = zenSummaryHtmlFragments(trimmed);
    document.querySelectorAll<HTMLElement>(".thread-reading .thread-zen .thread-zen-body").forEach((el) => {
      el.classList.add("is-ai-streaming");
      if (el.innerHTML !== html) el.innerHTML = html;
    });
    document.querySelectorAll<HTMLElement>(".ai-thread-summary__body").forEach((el) => {
      el.classList.add("is-ai-streaming");
      if (el.innerHTML !== html) el.innerHTML = html;
    });
  });
}

export function paintThreadQaStreamDom(text: string): void {
  scheduleAiStreamDomPaint(() => {
    const el = document.querySelector<HTMLElement>(".ai-qa-answer--stream .ai-qa-answer__text");
    if (!el) return;
    const html = formatPlainTextWithLinks(text);
    if (el.innerHTML !== html) el.innerHTML = html;
  });
}

export function paintAgentDraftDom(text: string): void {
  const ta = document.querySelector<HTMLTextAreaElement>("#agent-draft-text");
  if (!ta) {
    render();
    return;
  }
  scheduleAiStreamDomPaint(() => {
    if (ta.value !== text) ta.value = text;
  });
}

export function threadAiSummaryScoped(): boolean {
  return Boolean(state.aiOutput?.trim() && state.aiThreadScope);
}

export function threadAiSummaryForCurrentThread(): boolean {
  return threadAiSummaryScoped() && threadAiSummaryLiveFor(String(state.aiThreadScope));
}

export function threadAiSummaryShownInZen(): boolean {
  return state.view === "thread" && Boolean(state.selectedThread) && threadAiSummaryForCurrentThread();
}

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
