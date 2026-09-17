import { state } from "../state";

export function newDraftSessionId(): string {
  const anyCrypto = (globalThis as { crypto?: Crypto }).crypto;
  const gen = anyCrypto?.randomUUID?.bind(anyCrypto);
  if (gen) return String(gen());
  return `ds-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function startNewDraftSession(): void {
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
}

export function composeDraftHasMeaningfulContent(): boolean {
  if (!state.draft) return false;
  const d = state.draft;
  if (d.subject.trim()) return true;
  if (d.markdownBody.trim()) return true;
  if (d.to.length > 0 || d.cc.length > 0 || d.bcc.length > 0) return true;
  if ((d.attachmentPaths?.length ?? 0) > 0) return true;
  return false;
}
