import { composeRewriteStyleFromTone } from "../core/composeTone";
import { render } from "../dispatch";
import { state } from "../state";
import { composeAiGrammar, composeAiRewrite } from "./composeAiWireActions";
import { applyComposeGrammarSuggestionAtIndex } from "./composeWireActionsRun";

export async function tryHandleComposeEditorAiWire(action: string, element?: HTMLElement): Promise<boolean> {
  switch (action) {
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
