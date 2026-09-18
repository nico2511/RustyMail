import type { MicDictationTarget } from "../types";
import { state } from "../state";
import {
  composePreviewPaneActive,
  loadComposeMarkdownIntoEditor,
  schedulePreviewUpdate,
} from "./composeComposerBridge";

export function micTargetFromView(explicit?: MicDictationTarget): MicDictationTarget {
  if (explicit) return explicit;
  return state.view === "thread" ? "thread-qa" : "compose";
}

function dictationBaseTextForTarget(target: MicDictationTarget): string {
  if (target === "thread-qa") {
    const ta = document.querySelector<HTMLTextAreaElement>("#thread-qa-input");
    return ta?.value ?? state.threadQaDraft ?? "";
  }
  return state.composeCanonicalBody || state.draft?.markdownBody || state.composeBody || "";
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
  const base = dictationBaseTextForTarget("compose").trimEnd();
  const joiner = base.length ? "\n\n" : "";
  loadComposeMarkdownIntoEditor(`${base}${joiner}${trimmed}`);
  if (composePreviewPaneActive()) schedulePreviewUpdate(0);
}
