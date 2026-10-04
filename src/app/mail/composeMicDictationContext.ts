import type { MicDictationTarget } from "../types";

export const micDictationCtx = {
  micTimer: undefined as number | undefined,
  micMediaRecorder: null as MediaRecorder | null,
  micChunks: [] as Blob[],
  micStream: null as MediaStream | null,
  micDictationTarget: "compose" as MicDictationTarget,
  micPttKeyHeld: false,
  /** Empêche un second start pendant getUserMedia / MediaRecorder. */
  startInFlight: false,
  /** Empêche un double stop → double invoke Whisper. */
  stopInFlight: false,
};
