import { isTauriRuntime } from "../lib/tauriRuntime";
import { state } from "../state";
import { composePushToTalkTargetCode, pushToTalkKeyMatches } from "./composeMicPtt";
import { micTargetFromView } from "./composeMicDictationApplyRun";
import { micDictationCtx } from "./composeMicDictationContext";
import { micAction } from "./composeMicDictationMicActionRun";

export function bindMicPushToTalk(): void {
  document.addEventListener(
    "keydown",
    (event: KeyboardEvent) => {
      if (!state.appPrefs.ai.dictationEnabled || !isTauriRuntime() || event.repeat) return;
      if (!pushToTalkKeyMatches(event)) return;
      if (state.micState !== "idle") return;
      event.preventDefault();
      micDictationCtx.micPttKeyHeld = true;
      void micAction({ fromPushToTalk: true, target: micTargetFromView() });
    },
    true,
  );
  document.addEventListener(
    "keyup",
    (event: KeyboardEvent) => {
      if (!micDictationCtx.micPttKeyHeld) return;
      const target = composePushToTalkTargetCode();
      if (!target || event.code !== target) return;
      micDictationCtx.micPttKeyHeld = false;
      if (state.micState === "recording") {
        event.preventDefault();
        void micAction();
      }
    },
    true,
  );
}
