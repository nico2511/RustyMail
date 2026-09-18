import { render } from "../dispatch";
import { formatPlainTextWithLinks } from "../lib/textFormat";
import { zenSummaryHtmlFragments } from "./threadViewUiHelpers";

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
