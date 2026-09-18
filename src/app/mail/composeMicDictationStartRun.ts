import type { MicActionOpts } from "../types";
import { isTauriRuntime } from "../lib/tauriRuntime";
import { toast } from "../lib/toast";
import { render } from "../dispatch";
import { state } from "../state";
import { micPermissionErrorMessage, requestMicStream } from "./micStreamAccess";
import { micTargetFromView } from "./composeMicDictationApplyRun";
import { micDictationCtx } from "./composeMicDictationContext";
import { stopMicDictationAndTranscribe } from "./composeMicDictationStopRun";

export function validateDictationCanStart(): boolean {
  if (!isTauriRuntime()) {
    toast("Dictée : l’app bureau Tauri est requise.");
    return false;
  }
  if (!state.appPrefs.ai.dictationEnabled) {
    toast("Activez la dictée dans Paramètres → IA & dictée.");
    return false;
  }
  const backend = state.appPrefs.ai.dictationBackend;
  if (backend === "cloud" && !state.dictationApiKeySet) {
    toast("Clé API absente : Paramètres → IA & dictée.");
    return false;
  }
  if (
    backend === "whisper_cpp" &&
    state.appPrefs.ai.whisperCloudFallback &&
    !state.dictationApiKeySet
  ) {
    toast("Repli cloud activé : enregistrez une clé API, ou désactivez le repli.");
    return false;
  }
  if (backend === "local_http" && !state.appPrefs.ai.localCompanionBaseUrl.trim()) {
    toast("Indiquez l’URL du compagnon local (Paramètres → IA & dictée).");
    return false;
  }
  return true;
}

export async function startMicDictationRecording(opts?: MicActionOpts): Promise<void> {
  micDictationCtx.micDictationTarget = micTargetFromView(opts?.target);
  if (!validateDictationCanStart()) return;
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
        void stopMicDictationAndTranscribe();
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
}
