import { flushComposeEditorToState } from "./composeBodyEditor";
import { draftBodyIdentity } from "./composeDraftContentKey";
import {
  attachmentPathsFromHiddenField,
  syncComposeAttachmentsHiddenField,
} from "./composeAttachmentPaths";
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
    const fromField = attachmentPathsFromHiddenField(attachmentsField.value);
    const fromState = (state.draft.attachmentPaths ?? []).map((p) => p.trim()).filter(Boolean);
    // Ne pas écraser des PJ en mémoire si le champ caché est vide (re-render / course).
    if (fromField.length === 0 && fromState.length > 0) {
      syncComposeAttachmentsHiddenField(fromState);
    } else {
      state.draft.attachmentPaths = fromField;
    }
  }
  state.draft.sendHtml = true;
  applyComposeRecipientsFromDom(state.draft);
}
