import { flushComposeEditorToState } from "./composeBodyEditor";
import { draftBodyIdentity } from "./composeDraftContentKey";
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
  state.draft.sendHtml = true;
  applyComposeRecipientsFromDom(state.draft);
}
