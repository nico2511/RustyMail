import { flushComposeEditorToState } from "./composeBodyEditor";
import { draftBodyIdentity } from "./composeDraftContentKey";
import { attachmentPathsFromHiddenField } from "./composeAttachmentPaths";
import { applyComposeRecipientsFromDom } from "./composeRecipientChipsWire";
import { state } from "../state";

export function persistDraft(): void {
  if (!state.draft) return;
  const shell = document.querySelector(".composer-mail-shell");
  flushComposeEditorToState();
  const nextBody = state.composeCanonicalBody || state.composeBody || "";
  if (draftBodyIdentity(nextBody) !== draftBodyIdentity(state.draft.markdownBody ?? "")) {
    state.draft.markdownBody = nextBody;
  }
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
