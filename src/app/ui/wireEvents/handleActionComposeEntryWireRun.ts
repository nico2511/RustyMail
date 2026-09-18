import {
  render,
  state,
} from "./depsCore";
import {
  enterComposeView,
  startNewDraftSession,
  syncPreviewOpenFromComposeLayout,
} from "./depsSearchMail";
import {
  prepareReply,
  threadIsAutoMail,
  clearThreadAiSummaryState,
  computePreview,
  resetMarkdownEditorHistory,
  scheduleDraftRevisionSave,
} from "./depsComposeThread";

export async function tryHandleComposeEntryWire(action: string, element?: HTMLElement): Promise<boolean> {
  switch (action) {
    case "compose":
      state.aiOpen = false;
      clearThreadAiSummaryState();
      if (
        state.view === "thread" &&
        state.selectedThreadId?.trim() &&
        !threadIsAutoMail(state.selectedThread, state.selectedThreadId)
      ) {
        void prepareReply();
        return true;
      }
      enterComposeView();
      startNewDraftSession();
      state.draft = {
        id: "draft-local",
        kind: "New",
        to: [],
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
      state.composeAdvancedOpen = false;
      state.composeCcBccOpen = false;
      resetMarkdownEditorHistory();
      render();
      window.setTimeout(() => void computePreview(), 0);
      scheduleDraftRevisionSave(350);
      return true;
    default:
      return false;
  }
}
