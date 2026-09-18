import { invoke } from "@tauri-apps/api/core";
import { tauriErrorMessage, withTimeout } from "../lib/tauriCommand";
import { toast } from "../lib/toast";
import { render } from "../dispatch";
import { state } from "../state";
import { rewriteDictatedSegmentWithTone } from "./composeDictationRewrite";
import { bytesToBase64, mediaBlobToWav16kMonoPcm16 } from "./micAudioUtil";
import { applyDictationToTarget } from "./composeMicDictationApplyRun";
import { micDictationCtx } from "./composeMicDictationContext";

export async function stopMicDictationAndTranscribe(): Promise<void> {
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
