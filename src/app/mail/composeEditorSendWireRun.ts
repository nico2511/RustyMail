import { render } from "../dispatch";
import { state } from "../state";
import { confirmAndExecuteSplitSend } from "./composeAiWireActions";
import { sendDraft } from "./composeSendDraftAction";

export async function tryHandleComposeEditorSendWire(action: string): Promise<boolean> {
  switch (action) {
    case "send":
      await sendDraft();
      return true;
    case "cancel-split-send":
      state.splitSendConfirm = null;
      state.composeMessage = "";
      render();
      return true;
    case "confirm-split-send":
      void confirmAndExecuteSplitSend();
      return true;
    default:
      return false;
  }
}
