import {
  render,
  state,
  isTauriRuntime,
} from "./depsCore";
import {
  syncPreviewOpenFromComposeLayout,
} from "./depsSearchMail";
import {
  draftHasRecipientsExtra,
  cycleComposeLayout,
  removeAttachment,
  clearAttachments,
  sendDraft,
  refreshDraftRevisions,
  computePreview,
  pickAttachments,
  confirmAndExecuteSplitSend,
  composeAiRewrite,
  composeAiGrammar,
  composeRewriteStyleFromTone,
} from "./depsComposeThread";
import {
  applyComposeGrammarSuggestionAtIndex,
} from "../../mail/composeWireActionsRun";

export async function tryHandleComposeEditorWire(action: string, element?: HTMLElement): Promise<boolean> {
  switch (action) {
    case "toggle-preview":
      await cycleComposeLayout();
      return true;
    case "set-compose-layout": {
      const raw = element?.dataset.composeLayout?.trim();
      if (raw !== "split" && raw !== "write" && raw !== "preview" && raw !== "historique") return true;
      if (raw === "historique" && !isTauriRuntime()) return true;
      state.composeLayout = raw;
      syncPreviewOpenFromComposeLayout();
      render();
      if (raw === "historique") void refreshDraftRevisions(60);
      if (state.composeLayout !== "write" && state.composeLayout !== "historique") {
        window.setTimeout(() => void computePreview(), 0);
      }
      return true;
    }
    case "toggle-compose-advanced":
      state.composeAdvancedOpen = !state.composeAdvancedOpen;
      render();
      return true;
    case "toggle-compose-cc-bcc": {
      if (draftHasRecipientsExtra(state.draft)) return true;
      state.composeCcBccOpen = !state.composeCcBccOpen;
      render();
      return true;
    }
    case "send":
      await sendDraft();
      return true;
    case "cancel-split-send":
      state.splitSendConfirm = null;
      state.composeMessage = "";
      render();
      return true;
    case "confirm-split-send":
      void confirmAndExecuteSplitSend();
      return true;
    case "pick-attachments":
      await pickAttachments();
      return true;
    case "clear-attachments":
      clearAttachments();
      return true;
    case "remove-attachment":
      removeAttachment(element?.dataset.path ?? "");
      return true;
    case "compose-ai-rewrite": {
      const st = element?.dataset.rewriteStyle ?? "Formal";
      void composeAiRewrite(st);
      return true;
    }
    case "compose-ai-rewrite-selected-tone":
      void composeAiRewrite(composeRewriteStyleFromTone());
      return true;
    case "compose-ai-grammar":
      void composeAiGrammar();
      return true;
    case "compose-grammar-dismiss":
      state.composeGrammarSuggestions = null;
      render();
      return true;
    case "compose-grammar-apply": {
      const gi = Number(element?.dataset.grammarI ?? "");
      applyComposeGrammarSuggestionAtIndex(gi);
      return true;
    }
    default:
      return false;
  }
}
