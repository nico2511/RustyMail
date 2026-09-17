import { invoke } from "@tauri-apps/api/core";
import type { MicActionOpts, MicDictationTarget } from "../types";
import { isTauriRuntime } from "../lib/tauriRuntime";
import { tauriErrorMessage, withTimeout } from "../lib/tauriCommand";
import { toast } from "../lib/toast";
import { render } from "../dispatch";
import { state } from "../state";
import { rewriteDictatedSegmentWithTone } from "./composeDictationRewrite";
import {
  composePreviewPaneActive,
  loadComposeMarkdownIntoEditor,
  schedulePreviewUpdate,
} from "./composeComposerBridge";
import { composePushToTalkTargetCode, pushToTalkKeyMatches } from "./composeMicPtt";
import { bytesToBase64, mediaBlobToWav16kMonoPcm16 } from "./micAudioUtil";
import { micPermissionErrorMessage, requestMicStream } from "./micStreamAccess";

let micTimer: number | undefined;
let micMediaRecorder: MediaRecorder | null = null;
let micChunks: Blob[] = [];
let micStream: MediaStream | null = null;
let micDictationTarget: MicDictationTarget = "compose";
let micPttKeyHeld = false;

function micTargetFromView(explicit?: MicDictationTarget): MicDictationTarget {
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

function applyDictationToTarget(text: string, target: MicDictationTarget): void {
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

export function bindMicPushToTalk(): void {
  document.addEventListener(
    "keydown",
    (event: KeyboardEvent) => {
      if (!state.appPrefs.ai.dictationEnabled || !isTauriRuntime() || event.repeat) return;
      if (!pushToTalkKeyMatches(event)) return;
      if (state.micState !== "idle") return;
      event.preventDefault();
      micPttKeyHeld = true;
      void micAction({ fromPushToTalk: true, target: micTargetFromView() });
    },
    true,
  );
  document.addEventListener(
    "keyup",
    (event: KeyboardEvent) => {
      if (!micPttKeyHeld) return;
      const target = composePushToTalkTargetCode();
      if (!target || event.code !== target) return;
      micPttKeyHeld = false;
      if (state.micState === "recording") {
        event.preventDefault();
        void micAction();
      }
    },
    true,
  );
}

export async function micAction(opts?: MicActionOpts): Promise<void> {
  if (state.micState === "idle") {
    micDictationTarget = micTargetFromView(opts?.target);
    if (!isTauriRuntime()) {
      toast("Dictée : l’app bureau Tauri est requise.");
      return;
    }
    if (!state.appPrefs.ai.dictationEnabled) {
      toast("Activez la dictée dans Paramètres → IA & dictée.");
      return;
    }
    const backend = state.appPrefs.ai.dictationBackend;
    if (backend === "cloud" && !state.dictationApiKeySet) {
      toast("Clé API absente : Paramètres → IA & dictée.");
      return;
    }
    if (
      backend === "whisper_cpp" &&
      state.appPrefs.ai.whisperCloudFallback &&
      !state.dictationApiKeySet
    ) {
      toast("Repli cloud activé : enregistrez une clé API, ou désactivez le repli.");
      return;
    }
    if (backend === "local_http" && !state.appPrefs.ai.localCompanionBaseUrl.trim()) {
      toast("Indiquez l’URL du compagnon local (Paramètres → IA & dictée).");
      return;
    }
    try {
      micStream = await requestMicStream();
      if (opts?.fromPushToTalk && !micPttKeyHeld) {
        micStream.getTracks().forEach((t) => t.stop());
        micStream = null;
        render();
        return;
      }
      micChunks = [];
      const mimeOpt =
        typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
          ? "audio/webm;codecs=opus"
          : "audio/webm";
      micMediaRecorder = new MediaRecorder(micStream, { mimeType: mimeOpt });
      micMediaRecorder.ondataavailable = (ev) => {
        if (ev.data && ev.data.size > 0) micChunks.push(ev.data);
      };
      if (opts?.fromPushToTalk && !micPttKeyHeld) {
        micStream.getTracks().forEach((t) => t.stop());
        micStream = null;
        micMediaRecorder = null;
        render();
        return;
      }
      micMediaRecorder.start(250);
      state.micState = "recording";
      state.micSeconds = 0;
      const maxRec = state.appPrefs.ai.whisperMaxRecordSeconds;
      micTimer = window.setInterval(() => {
        state.micSeconds += 1;
        if (maxRec > 0 && state.micSeconds >= maxRec) {
          void micAction();
          return;
        }
        render();
      }, 1000);
      render();
    } catch (e) {
      toast(micPermissionErrorMessage(e));
      micStream?.getTracks().forEach((t) => t.stop());
      micStream = null;
      micMediaRecorder = null;
    }
    return;
  }
  if (state.micState === "recording") {
    if (micTimer) {
      window.clearInterval(micTimer);
      micTimer = undefined;
    }
    const backend = state.appPrefs.ai.dictationBackend;
    if (!micMediaRecorder) {
      state.micState = "idle";
      state.micSeconds = 0;
      render();
      return;
    }
    state.micState = "processing";
    if (backend === "whisper_cpp" && micDictationTarget === "compose") {
      state.composeMessage =
        "Whisper : téléchargement du modèle HF au premier usage si besoin — patientez.";
    }
    render();
    try {
      const blob: Blob = await new Promise((resolve, reject) => {
        const rec = micMediaRecorder!;
        rec.onerror = () => reject(new Error("Enregistrement interrompu"));
        rec.onstop = () => {
          micStream?.getTracks().forEach((t) => t.stop());
          micStream = null;
          resolve(new Blob(micChunks, { type: rec.mimeType || "audio/webm" }));
        };
        rec.stop();
      });
      micMediaRecorder = null;
      micChunks = [];
      const buf = new Uint8Array(await blob.arrayBuffer());
      const b64 = bytesToBase64(buf);
      const ext = blob.type.includes("wav") ? "wav" : "webm";
      let audioWavBase64: string | undefined;
      if (backend === "whisper_cpp") {
        const wavBytes = await mediaBlobToWav16kMonoPcm16(blob);
        audioWavBase64 = bytesToBase64(wavBytes);
        if (micDictationTarget === "compose") {
          state.composeMessage = "Transcription Whisper en cours…";
          render();
        }
      }
      let text = await withTimeout(
        invoke<string>("transcribe_dictation", {
          args: {
            audioBase64: b64,
            ...(audioWavBase64 ? { audioWavBase64 } : {}),
            fileName: `dictation.${ext}`,
            mimeType: blob.type || "audio/webm",
          },
        }),
        120_000,
      );
      if (
        micDictationTarget === "compose" &&
        state.appPrefs.ai.dictationRewriteWithStyle &&
        text.trim()
      ) {
        state.composeMessage = "Réécriture du texte dicté…";
        render();
        text = await rewriteDictatedSegmentWithTone(text);
      }
      applyDictationToTarget(text, micDictationTarget);
      state.composeMessage = "";
    } catch (e) {
      console.error("transcribe_dictation", e);
      const errMsg = tauriErrorMessage(e);
      if (micDictationTarget === "compose") state.composeMessage = errMsg;
      toast(errMsg);
    }
    state.micState = "idle";
    state.micSeconds = 0;
    render();
  }
}
