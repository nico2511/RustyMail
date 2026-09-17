import type { MicDictationTarget } from "../types";
import { isTauriRuntime } from "../lib/tauriRuntime";
import { state } from "../state";
import {
  composePushToTalkShortcutLabel,
  composePushToTalkTargetCode,
} from "./composeMicPtt";

function threadQaMicFooterHint(): string {
  if (state.micState === "processing") {
    const bb = state.appPrefs.ai.dictationBackend;
    if (bb === "whisper_cpp") return "Transcription Whisper de votre question…";
    return "Insertion de la question dictée…";
  }
  if (!isTauriRuntime()) return "Dictée : l’app bureau Tauri est requise.";
  if (!state.appPrefs.ai.dictationEnabled) return "Dictée désactivée — Paramètres → IA & dictée.";
  const b = state.appPrefs.ai.dictationBackend;
  const ptt = composePushToTalkTargetCode();
  const pttFrag = ptt ? ` ou maintenir ${composePushToTalkShortcutLabel()}` : "";
  if (b === "whisper_cpp")
    return ptt
      ? `Whisper : clic micro${pttFrag}, relâcher pour dicter la question.`
      : "Whisper : clic sur le micro pour dicter la question.";
  if (b === "cloud")
    return ptt
      ? `Cloud : clic micro${pttFrag} — relâcher pour dicter la question.`
      : "Cloud : clic sur le micro pour dicter la question.";
  if (b === "local_http")
    return ptt ? `Compagnon : clic micro${pttFrag} — relâcher pour dicter.` : "Compagnon : clic sur le micro.";
  return "Dictée de question";
}

export function composeMicFooterHint(): string {
  if (state.composeMessage) return state.composeMessage;
  if (state.micState === "processing") {
    const bb = state.appPrefs.ai.dictationBackend;
    if (bb === "whisper_cpp") return "Dictée Whisper en cours…";
    return "Dictée en cours d’insertion…";
  }
  if (!isTauriRuntime()) return "Dictée : l’app bureau Tauri est requise.";
  if (!state.appPrefs.ai.dictationEnabled) return "Dictée désactivée — Paramètres → IA & dictée.";
  const b = state.appPrefs.ai.dictationBackend;
  const ptt = composePushToTalkTargetCode();
  const pttFrag = ptt ? ` ou maintenir ${composePushToTalkShortcutLabel()}` : "";
  if (b === "whisper_cpp")
    return ptt
      ? `Whisper : clic micro${pttFrag}, relâcher pour transcrire (HF auto).`
      : "Whisper : clic sur le micro pour transcrire (HF auto).";
  if (b === "cloud")
    return ptt
      ? `Cloud : clic micro${pttFrag} (clé API requise) — relâcher pour envoyer.`
      : "Cloud : clic sur le micro (clé API requise).";
  if (b === "local_http")
    return ptt ? `Compagnon : clic micro${pttFrag} — relâcher, audio HTTP.` : "Compagnon : clic sur le micro — audio HTTP.";
  return "Dictée";
}

export function composeMicButtonTitle(): string {
  if (state.micState === "recording") {
    const ptt = composePushToTalkTargetCode();
    return ptt
      ? "Enregistrement — relâcher la touche ou cliquer pour transcrire."
      : "Enregistrement — cliquer pour arrêter et transcrire.";
  }
  return composeMicFooterHint();
}

export function threadQaMicButtonTitle(): string {
  if (state.micState === "recording") {
    const ptt = composePushToTalkTargetCode();
    return ptt
      ? "Enregistrement — relâcher la touche ou cliquer pour dicter la question."
      : "Enregistrement — cliquer pour arrêter et transcrire la question.";
  }
  return threadQaMicFooterHint();
}

export function micAriaLabel(target: MicDictationTarget = "compose"): string {
  const ptt = composePushToTalkTargetCode();
  const lbl = composePushToTalkShortcutLabel();
  const qa = target === "thread-qa";
  if (state.micState === "recording") {
    return ptt
      ? `Enregistrement en cours — relâcher ${lbl} ou cliquer pour arrêter`
      : "Enregistrement en cours — cliquer pour arrêter";
  }
  if (state.micState === "processing") return qa ? "Transcription de la question en cours" : "Transcription en cours";
  return ptt
    ? `${qa ? "Dicter la question" : "Dictée"} — clic ou maintenir ${lbl}`
    : qa
      ? "Dicter la question — clic sur le micro"
      : "Dictée — clic sur le micro";
}
