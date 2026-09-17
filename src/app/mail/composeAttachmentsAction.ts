import { render } from "../dispatch";
import { toast } from "../lib/toast";
import { state } from "../state";
import { attachmentPathsJoinedForHiddenField } from "./composeAttachmentPaths";

export type ComposeAttachmentsActionDeps = {
  scheduleDraftRevisionSave: (delayMs?: number) => void;
};

let composeAttachmentsActionDeps: ComposeAttachmentsActionDeps | null = null;

export function registerComposeAttachmentsActionDeps(deps: ComposeAttachmentsActionDeps): void {
  composeAttachmentsActionDeps = deps;
}

function attachmentDeps(): ComposeAttachmentsActionDeps {
  if (!composeAttachmentsActionDeps) throw new Error("registerComposeAttachmentsActionDeps not called");
  return composeAttachmentsActionDeps;
}

export function removeAttachment(path: string): void {
  if (!state.draft) return;
  const p = path.trim();
  if (!p) return;
  state.draft.attachmentPaths = (state.draft.attachmentPaths ?? []).filter((x) => x !== p);
  const attachmentsField = document.querySelector<HTMLInputElement>("#compose-attachments");
  if (attachmentsField) attachmentsField.value = attachmentPathsJoinedForHiddenField(state.draft.attachmentPaths);
  render();
  attachmentDeps().scheduleDraftRevisionSave(250);
}

export function clearAttachments(): void {
  if (!state.draft) return;
  state.draft.attachmentPaths = [];
  toast("Pièces jointes supprimées.");
  render();
  attachmentDeps().scheduleDraftRevisionSave(250);
}
