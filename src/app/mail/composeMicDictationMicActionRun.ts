import { invoke } from "@tauri-apps/api/core";
import type { MicActionOpts } from "../types";
import { isTauriRuntime } from "../lib/tauriRuntime";
import { tauriErrorMessage, withTimeout } from "../lib/tauriCommand";
import { toast } from "../lib/toast";
import { render } from "../dispatch";
import { state } from "../state";
import { rewriteDictatedSegmentWithTone } from "./composeDictationRewrite";
import { bytesToBase64, mediaBlobToWav16kMonoPcm16 } from "./micAudioUtil";
import { micPermissionErrorMessage, requestMicStream } from "./micStreamAccess";
import { applyDictationToTarget, micTargetFromView } from "./composeMicDictationApplyRun";
import { micDictationCtx } from "./composeMicDictationContext";

export async function micAction(opts?: MicActionOpts): Promise<void> {
  if (state.micState === "idle") {
    micDictationCtx.micDictationTarget = micTargetFromView(opts?.target);
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
      micDictationCtx.micStream = await requestMicStream();
      if (opts?.fromPushToTalk && !micDictationCtx.micPttKeyHeld) {
        micDictationCtx.micStream.getTracks().forEach((t) => t.stop());
        micDictationCtx.micStream = null;
        render();
        return;
      }
      micDictationCtx.micChunks.length = 0;
      const mimeOpt =
        typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
          ? "audio/webm;codecs=opus"
          : "audio/webm";
      micDictationCtx.micMediaRecorder = new MediaRecorder(micDictationCtx.micStream, { mimeType: mimeOpt });
      micDictationCtx.micMediaRecorder.ondataavailable = (ev) => {
        if (ev.data && ev.data.size > 0) micDictationCtx.micChunks.push(ev.data);
      };
      if (opts?.fromPushToTalk && !micDictationCtx.micPttKeyHeld) {
        micDictationCtx.micStream.getTracks().forEach((t) => t.stop());
        micDictationCtx.micStream = null;
        micDictationCtx.micMediaRecorder = null;
        render();
        return;
      }
      micDictationCtx.micMediaRecorder.start(250);
      state.micState = "recording";
      state.micSeconds = 0;
      const maxRec = state.appPrefs.ai.whisperMaxRecordSeconds;
      micDictationCtx.micTimer = window.setInterval(() => {
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
      micDictationCtx.micStream?.getTracks().forEach((t) => t.stop());
      micDictationCtx.micStream = null;
      micDictationCtx.micMediaRecorder = null;
    }
    return;
  }
  if (state.micState === "recording") {
    if (micDictationCtx.micTimer) {
      window.clearInterval(micDictationCtx.micTimer);
      micDictationCtx.micTimer = undefined;
    }
    const backend = state.appPrefs.ai.dictationBackend;
    if (!micDictationCtx.micMediaRecorder) {
      state.micState = "idle";
      state.micSeconds = 0;
      render();
      return;
    }
    state.micState = "processing";
    if (backend === "whisper_cpp" && micDictationCtx.micDictationTarget === "compose") {
      state.composeMessage =
        "Whisper : téléchargement du modèle HF au premier usage si besoin — patientez.";
    }
    render();
    try {
      const blob: Blob = await new Promise((resolve, reject) => {
        const rec = micDictationCtx.micMediaRecorder!;
        rec.onerror = () => reject(new Error("Enregistrement interrompu"));
        rec.onstop = () => {
          micDictationCtx.micStream?.getTracks().forEach((t) => t.stop());
          micDictationCtx.micStream = null;
          resolve(new Blob(micDictationCtx.micChunks, { type: rec.mimeType || "audio/webm" }));
        };
        rec.stop();
      });
      micDictationCtx.micMediaRecorder = null;
      micDictationCtx.micChunks.length = 0;
      const buf = new Uint8Array(await blob.arrayBuffer());
      const b64 = bytesToBase64(buf);
      const ext = blob.type.includes("wav") ? "wav" : "webm";
      let audioWavBase64: string | undefined;
      if (backend === "whisper_cpp") {
        const wavBytes = await mediaBlobToWav16kMonoPcm16(blob);
        audioWavBase64 = bytesToBase64(wavBytes);
        if (micDictationCtx.micDictationTarget === "compose") {
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
        micDictationCtx.micDictationTarget === "compose" &&
        state.appPrefs.ai.dictationRewriteWithStyle &&
        text.trim()
      ) {
        state.composeMessage = "Réécriture du texte dicté…";
        render();
        text = await rewriteDictatedSegmentWithTone(text);
      }
      applyDictationToTarget(text, micDictationCtx.micDictationTarget);
      state.composeMessage = "";
    } catch (e) {
      console.error("transcribe_dictation", e);
      const errMsg = tauriErrorMessage(e);
      if (micDictationCtx.micDictationTarget === "compose") state.composeMessage = errMsg;
      toast(errMsg);
    }
    state.micState = "idle";
    state.micSeconds = 0;
    render();
  }
}
