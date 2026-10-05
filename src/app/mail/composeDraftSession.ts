import { ensureComposeSendAccountId } from "../core/composeSendAccount";
import { state } from "../state";
import { draftHasMeaningfulContent, resetDraftContentMemory } from "./composeDraftContentKey";
import { clearComposeGrammarUi } from "./composeGrammarPanelSync";

export function newDraftSessionId(): string {
  const anyCrypto = (globalThis as { crypto?: Crypto }).crypto;
  const gen = anyCrypto?.randomUUID?.bind(anyCrypto);
  if (gen) return String(gen());
  return `ds-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function startNewDraftSession(opts?: { sendAccountId?: string | null }): void {
  resetDraftContentMemory();
  clearComposeGrammarUi();
  state.draftSessionId = newDraftSessionId();
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
  ensureComposeSendAccountId(opts?.sendAccountId);
}

export function composeDraftHasMeaningfulContent(): boolean {
  return draftHasMeaningfulContent(state.draft);
}
