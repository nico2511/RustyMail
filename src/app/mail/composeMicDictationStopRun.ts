import { invoke } from "@tauri-apps/api/core";
import { tauriErrorMessage, withTimeout } from "../lib/tauriCommand";
import { toast } from "../lib/toast";
import { render } from "../dispatch";
import { state } from "../state";
import { rewriteDictatedSegmentWithTone } from "./composeDictationRewrite";
import { bytesToBase64, mediaBlobToWav16kMonoPcm16 } from "./micAudioUtil";
import { applyDictationToTarget, replaceDictatedSegmentInTarget } from "./composeMicDictationApplyRun";
import { micDictationCtx } from "./composeMicDictationContext";
import { patchMicButtonsDom } from "./composeMicUiPatch";

export async function stopMicDictationAndTranscribe(): Promise<void> {
  if (micDictationCtx.stopInFlight) return;
  micDictationCtx.stopInFlight = true;
  if (micDictationCtx.micTimer) {
    window.clearInterval(micDictationCtx.micTimer);
    micDictationCtx.micTimer = undefined;
  }
  const backend = state.appPrefs.ai.dictationBackend;
  const target = micDictationCtx.micDictationTarget;
  if (!micDictationCtx.micMediaRecorder) {
    state.micState = "idle";
    state.micSeconds = 0;
    patchMicButtonsDom();
    micDictationCtx.stopInFlight = false;
    return;
  }
  state.micState = "processing";
  if (backend === "whisper_cpp" && target === "compose") {
    state.composeMessage = "Transcription Whisper en cours…";
  }
  // Un seul remount à l’arrêt (pas pendant l’enregistrement).
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
      if (rec.state === "inactive") {
        micDictationCtx.micStream?.getTracks().forEach((t) => t.stop());
        micDictationCtx.micStream = null;
        resolve(new Blob(micDictationCtx.micChunks, { type: rec.mimeType || "audio/webm" }));
        return;
      }
      rec.stop();
    });
    micDictationCtx.micMediaRecorder = null;
    micDictationCtx.micChunks.length = 0;

    const cloudFallback = Boolean(state.appPrefs.ai.whisperCloudFallback);
    const needWebmForIpc = backend !== "whisper_cpp" || cloudFallback;
    const ext = blob.type.includes("wav") ? "wav" : "webm";
    let audioBase64 = "";
    if (needWebmForIpc) {
      const buf = new Uint8Array(await blob.arrayBuffer());
      audioBase64 = bytesToBase64(buf);
    }

    let audioWavBase64: string | undefined;
    if (backend === "whisper_cpp") {
      const wavBytes = await mediaBlobToWav16kMonoPcm16(blob);
      audioWavBase64 = bytesToBase64(wavBytes);
      if (target === "compose") {
        state.composeMessage = "Transcription Whisper en cours…";
        patchMicButtonsDom();
      }
    }

    const text = await withTimeout(
      invoke<string>("transcribe_dictation", {
        args: {
          audioBase64,
          ...(audioWavBase64 ? { audioWavBase64 } : {}),
          fileName: `dictation.${ext}`,
          mimeType: blob.type || "audio/webm",
        },
      }),
      180_000,
    );

    // Insérer tout de suite — ne pas attendre une éventuelle réécriture LLM.
    applyDictationToTarget(text, target);
    render();

    const shouldRewrite =
      target === "compose" &&
      state.appPrefs.ai.dictationRewriteWithStyle &&
      Boolean(text.trim());
    if (shouldRewrite) {
      // Garder le micro « occupé » pendant la rewrite pour éviter une 2e dictée
      // qui écraserait le segment en cours de remplacement.
      state.composeMessage = "Réécriture du texte dicté…";
      patchMicButtonsDom();
      try {
        const rewritten = await rewriteDictatedSegmentWithTone(text);
        const next = rewritten.trim();
        if (next && next !== text.trim()) {
          replaceDictatedSegmentInTarget(text, next, target);
        }
      } finally {
        state.composeMessage = "";
        state.micState = "idle";
        state.micSeconds = 0;
        micDictationCtx.stopInFlight = false;
        render();
      }
    } else {
      state.composeMessage = "";
      state.micState = "idle";
      state.micSeconds = 0;
      micDictationCtx.stopInFlight = false;
      render();
    }
  } catch (e) {
    console.error("transcribe_dictation", e);
    const errMsg = tauriErrorMessage(e);
    if (target === "compose") state.composeMessage = errMsg;
    toast.error(errMsg);
    state.micState = "idle";
    state.micSeconds = 0;
    micDictationCtx.stopInFlight = false;
    render();
  }
}
