// @ts-nocheck — DOM wiring; tighten types incrementally.
import { sendableAccounts } from "../core/composeSendAccount";
import { state } from "../state";
import { sendQuickReply } from "./composeSendQuickReply";
import { markComposeDraftEdited } from "./composeDraftContentKey";
import { scheduleDraftRevisionSave, bindComposerDropzone } from "./composeComposerBridge";

export function wireEventsDomComposeEditorFields(signal: AbortSignal): void {
  document.querySelector<HTMLInputElement>("#compose-subject")?.addEventListener(
    "input",
    () => {
      markComposeDraftEdited();
      scheduleDraftRevisionSave();
    },
    { signal },
  );
  document.querySelector<HTMLSelectElement>("#compose-from-account")?.addEventListener(
    "change",
    (event) => {
      const id = String((event.target as HTMLSelectElement).value ?? "").trim();
      if (!id || !sendableAccounts().some((a) => a.id === id)) return;
      state.composeSendAccountId = id;
    },
    { signal },
  );
  bindComposerDropzone();
  document.querySelector<HTMLInputElement>("[data-quick-reply]")?.addEventListener(
    "keydown",
    (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        void sendQuickReply("reply");
      }
    },
    { signal },
  );
}
