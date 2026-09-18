import type { MicDictationTarget } from "../types";

export const micDictationCtx = {
  micTimer: undefined as number | undefined,
  micMediaRecorder: null as MediaRecorder | null,
  micChunks: [] as Blob[],
  micStream: null as MediaStream | null,
  micDictationTarget: "compose" as MicDictationTarget,
  micPttKeyHeld: false,
};
