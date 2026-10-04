import { flushComposeEditorToState } from "./composeBodyEditor";
import { attachmentPathsFromHiddenField } from "./composeAttachmentPaths";
import { applyComposeRecipientsFromDom } from "./composeRecipientChipsWire";
import { state } from "../state";

export function persistDraft(): void {
  if (!state.draft) return;
  const shell = document.querySelector(".composer-mail-shell");
  flushComposeEditorToState();
  state.draft.markdownBody = state.composeCanonicalBody || state.composeBody;
  state.draft.subject =
    shell?.querySelector<HTMLInputElement>("#compose-subject")?.value ??
    document.querySelector<HTMLInputElement>("#compose-subject")?.value ??
    state.draft.subject;
  const attachmentsField =
    shell?.querySelector<HTMLInputElement>("#compose-attachments") ??
    document.querySelector<HTMLInputElement>("#compose-attachments");
  if (attachmentsField) {
    // Source de vérité au save : le champ caché (aligné pick / drop / remove).
    state.draft.attachmentPaths = attachmentPathsFromHiddenField(attachmentsField.value);
  }
  state.draft.sendHtml = true;
  applyComposeRecipientsFromDom(state.draft);
}
