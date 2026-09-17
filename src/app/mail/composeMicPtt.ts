import { isAiFeatureEnabled } from "../../aiFeatures";
import { state } from "../state";

export function composePushToTalkTargetCode(): string {
  return (state.appPrefs.ai.whisperPttKeyCode ?? "").trim();
}

export function formatWhisperPttKeyLabel(code: string): string {
  const c = code.trim();
  if (!c) return "";
  const labels: Record<string, string> = {
    F8: "F8",
    F9: "F9",
    F10: "F10",
    F11: "F11",
    F12: "F12",
    Pause: "Pause",
    ScrollLock: "Arrêt défil.",
    Insert: "Insertion",
    Backquote: "² / sous Échap (selon clavier)",
  };
  return labels[c] ?? c;
}

export function composePushToTalkShortcutLabel(): string {
  return formatWhisperPttKeyLabel(composePushToTalkTargetCode());
}

export function pushToTalkKeyMatches(event: KeyboardEvent): boolean {
  const code = composePushToTalkTargetCode();
  if (!code) return false;
  const pttViewOk =
    state.view === "compose" ||
    (state.view === "thread" && isAiFeatureEnabled(state.appPrefs.ai, "featureThreadQaEnabled"));
  if (!pttViewOk) return false;
  if (event.ctrlKey || event.altKey || event.metaKey || event.shiftKey) return false;
  return event.code === code;
}
