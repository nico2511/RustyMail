import { flushComposeEditorToState } from "./composeBodyEditor";
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
  const sendHtmlEl =
    shell?.querySelector<HTMLInputElement>("#compose-send-html") ??
    document.querySelector<HTMLInputElement>("#compose-send-html");
  if (sendHtmlEl) state.draft.sendHtml = sendHtmlEl.checked;
  applyComposeRecipientsFromDom(state.draft);
}
