import { state } from "../state";
import { clearComposeGrammarUi } from "./composeGrammarPanelSync";
import { requireComposeCloseFlowDeps } from "./composeCloseFlowContext";

export function clearDraftSession(): void {
  clearComposeGrammarUi();
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
