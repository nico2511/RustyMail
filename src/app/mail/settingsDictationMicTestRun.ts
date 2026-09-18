import { invoke } from "@tauri-apps/api/core";
import { MAIL_ACTION_TIMEOUT_MS } from "../core/timeouts";
import { isTauriRuntime } from "../lib/tauriRuntime";
import { tauriErrorMessage, withTimeout } from "../lib/tauriCommand";
import { toast } from "../lib/toast";
import { render } from "../dispatch";
import { bytesToBase64, mediaBlobToWav16kMonoPcm16 } from "./micAudioUtil";
import { micPermissionErrorMessage, requestMicStream } from "./micStreamAccess";

export async function runSettingsDictationMicTest(): Promise<void> {
  if (!isTauriRuntime()) {
    toast("Test micro : lancez l’app Tauri.");
    return;
  }
  toast("Test micro : enregistrement 3s…");
  let stream: MediaStream | null = null;
  let recorder: MediaRecorder | null = null;
  const chunks: Blob[] = [];
  try {
    stream = await requestMicStream();
    if (!stream) {
      toast("Micro inaccessible.");
      return;
    }
    const mimeOpt =
      typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : "audio/webm";
    recorder = new MediaRecorder(stream, { mimeType: mimeOpt });
    recorder.ondataavailable = (ev) => {
      if (ev.data && ev.data.size > 0) chunks.push(ev.data);
    };
    recorder.start(250);
    await new Promise((resolve) => window.setTimeout(resolve, 3000));
    const blob: Blob = await new Promise((resolve, reject) => {
      const r = recorder!;
      r.onerror = () => reject(new Error("Enregistrement interrompu"));
      r.onstop = () => resolve(new Blob(chunks, { type: r.mimeType || "audio/webm" }));
      r.stop();
    });
    stream.getTracks().forEach((track) => track.stop());
    stream = null;
    recorder = null;
    const wavBytes = await mediaBlobToWav16kMonoPcm16(blob);
    const audioWavBase64 = bytesToBase64(wavBytes);
    toast("Test micro : transcription…");
    const res = await withTimeout(
      invoke<{
        durationS: number;
        rms: number;
        elapsedMs: number;
        text?: string | null;
        error?: { kind: string; seconds?: number; rms?: number; message?: string } | null;
      }>("dictation_test_run", { audioWavBase64 }),
      180_000,
    );
    if (res.error) {
      const msg =
        res.error.kind === "audio_too_short"
          ? `Audio trop court (${(res.error.seconds ?? res.durationS).toFixed(2)}s).`
          : res.error.kind === "audio_silent"
            ? `Audio quasi silencieux (RMS=${(res.error.rms ?? res.rms).toFixed(4)}).`
            : res.error.message
              ? res.error.message
              : "Échec transcription.";
      toast(`Test micro : ${msg}`);
    } else {
      toast(
        `Test micro OK (${res.durationS.toFixed(2)}s, RMS=${res.rms.toFixed(4)}, ${Math.round(res.elapsedMs)}ms) : ${String(res.text ?? "").slice(0, 140)}`,
      );
    }
  } catch (e) {
    toast(`Test micro : ${micPermissionErrorMessage(e)}`);
  } finally {
    try {
      recorder?.stop();
    } catch {
      // ignore
    }
    stream?.getTracks().forEach((track) => track.stop());
  }
  render();
}
