import type { MicActionOpts } from "../types";
import { state } from "../state";
import { micDictationCtx } from "./composeMicDictationContext";
import { startMicDictationRecording } from "./composeMicDictationStartRun";
import { stopMicDictationAndTranscribe } from "./composeMicDictationStopRun";

export async function micAction(opts?: MicActionOpts): Promise<void> {
  if (state.micState === "processing" || micDictationCtx.startInFlight || micDictationCtx.stopInFlight) {
    return;
  }
  if (state.micState === "idle") {
    await startMicDictationRecording(opts);
    return;
  }
  if (state.micState === "recording") {
    await stopMicDictationAndTranscribe();
  }
}
