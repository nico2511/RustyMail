import { removeAttachment, clearAttachments } from "./composeAttachmentsAction";
import { pickAttachments } from "./composePickAttachments";

export async function tryHandleComposeEditorAttachmentsWire(action: string, element?: HTMLElement): Promise<boolean> {
  switch (action) {
    case "pick-attachments":
      await pickAttachments();
      return true;
    case "clear-attachments":
      clearAttachments();
      return true;
    case "remove-attachment":
      removeAttachment(element?.dataset.path ?? "");
      return true;
    default:
      return false;
  }
}
