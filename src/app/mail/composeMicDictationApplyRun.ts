import type { MicDictationTarget } from "../types";
import { state } from "../state";
import { appendComposePlainText, replaceLastComposePlainSegment } from "./composeBodyEditor";
import { composePreviewPaneActive, schedulePreviewUpdate } from "./composeComposerBridge";

export function micTargetFromView(explicit?: MicDictationTarget): MicDictationTarget {
  if (explicit) return explicit;
  return state.view === "thread" ? "thread-qa" : "compose";
}

export function applyDictationToTarget(text: string, target: MicDictationTarget): void {
  const trimmed = text.trim();
  if (!trimmed) return;
  if (target === "thread-qa") {
    const ta = document.querySelector<HTMLTextAreaElement>("#thread-qa-input");
    const base = (ta?.value ?? state.threadQaDraft).trimEnd();
    const joiner = base.length && !/\s$/.test(base) ? " " : "";
    const next = `${base}${joiner}${trimmed}`;
    state.threadQaDraft = next;
    if (ta) {
      ta.value = next;
      ta.focus();
      const end = next.length;
      ta.setSelectionRange(end, end);
    }
    return;
  }
  appendComposePlainText(trimmed);
  if (composePreviewPaneActive()) schedulePreviewUpdate(0);
}

/** Remplace le dernier segment dicté (après réécriture LLM optionnelle). */
export function replaceDictatedSegmentInTarget(
  raw: string,
  rewritten: string,
  target: MicDictationTarget,
): void {
  const oldT = raw.trim();
  const newT = rewritten.trim();
  if (!oldT || !newT || oldT === newT) return;
  if (target === "thread-qa") {
    const ta = document.querySelector<HTMLTextAreaElement>("#thread-qa-input");
    const current = ta?.value ?? state.threadQaDraft;
    const idx = current.lastIndexOf(oldT);
    if (idx < 0) return;
    const next = current.slice(0, idx) + newT + current.slice(idx + oldT.length);
    state.threadQaDraft = next;
    if (ta) {
      ta.value = next;
      ta.focus();
      const end = idx + newT.length;
      ta.setSelectionRange(end, end);
    }
    return;
  }
  if (replaceLastComposePlainSegment(oldT, newT) && composePreviewPaneActive()) {
    schedulePreviewUpdate(0);
  }
}
