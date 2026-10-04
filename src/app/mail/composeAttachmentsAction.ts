import { render } from "../dispatch";
import { toast } from "../lib/toast";
import { state } from "../state";
import { syncComposeAttachmentsHiddenField } from "./composeAttachmentPaths";
import { markComposeDraftEdited } from "./composeDraftContentKey";

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
  markComposeDraftEdited();
  syncComposeAttachmentsHiddenField(state.draft.attachmentPaths);
  render();
  attachmentDeps().scheduleDraftRevisionSave(250);
}

export function clearAttachments(): void {
  if (!state.draft) return;
  state.draft.attachmentPaths = [];
  markComposeDraftEdited();
  syncComposeAttachmentsHiddenField([]);
  toast.success("Pièces jointes supprimées.");
  render();
  attachmentDeps().scheduleDraftRevisionSave(250);
}
