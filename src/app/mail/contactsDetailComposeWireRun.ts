import { enterComposeView, startNewDraftSession, syncPreviewOpenFromComposeLayout } from "./composeViewWireActions";
import { getContactDetail } from "../../contactsView";
import { render } from "../dispatch";
import { state } from "../state";

export function handleContactsComposeFromDetail(): void {
  const d = getContactDetail();
  const to = d?.email || state.selectedContactEmail;
  if (!to) return;
  enterComposeView();
  startNewDraftSession();
  state.draft = {
    id: "draft-local",
    kind: "New",
    to: [{ email: to }],
    cc: [],
    bcc: [],
    subject: "",
    markdownBody: "",
    sendHtml: true,
    inReplyTo: null,
    references: [],
    attachmentPaths: [],
    threadId: null,
  };
  state.composeBody = "";
  state.composeCanonicalBody = "";
  state.composeLayout = "split";
  syncPreviewOpenFromComposeLayout();
  state.preview = undefined;
  render();
}
