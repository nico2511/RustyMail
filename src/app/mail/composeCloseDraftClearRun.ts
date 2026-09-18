import { render } from "../dispatch";
import { state } from "../state";
import { requireComposeCloseFlowDeps } from "./composeCloseFlowContext";

export function clearDraftSession(): void {
  const d = requireComposeCloseFlowDeps();
  state.draftSessionId = null;
  state.savedDraftRecordId = null;
  state.draftRevisionsLoading = false;
  state.draftRevisions = [];
  state.draftDiffRevisionId = null;
  state.draftDiffLoading = false;
  state.draftDiffLines = [];
  state.draftDiffView = "preview";
  state.draftDiffOtherBody = "";
  state.draftRevisionPreview = null;
  state.draftVersionsListExpanded = false;
  d.clearDraftRevisionDebounce();
}
