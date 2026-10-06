import { composeRewriteStyleFromTone } from "../core/composeTone";
import { render } from "../dispatch";
import { state } from "../state";
import { composeAiGrammar, composeAiRewrite, composeAiTranslate } from "./composeAiWireActions";
import {
  applyComposeGrammarSuggestionAllAtIndex,
  applyComposeGrammarSuggestionAtIndex,
  applyComposeGrammarSuggestionsEverything,
} from "./composeWireActionsRun";
import type { ComposeAiScope } from "./composeAiComposeLlm";
import { normalizeComposeTranslateLang } from "./composeTranslateLangs";

/** Barre = document entier ; clic droit passe `data-compose-scope="selection"`. */
function scopeFromElement(element?: HTMLElement): ComposeAiScope {
  return element?.dataset.composeScope === "selection" ? "selection" : "document";
}

function translateLangFromElement(element?: HTMLElement): string {
  const fromBtn = element?.dataset.translateLang?.trim();
  if (fromBtn) return normalizeComposeTranslateLang(fromBtn);
  const sel = document.querySelector<HTMLSelectElement>("#compose-translate-lang");
  if (sel?.value) return normalizeComposeTranslateLang(sel.value);
  return normalizeComposeTranslateLang(state.appPrefs.general.motherLanguage);
}

export async function tryHandleComposeEditorAiWire(action: string, element?: HTMLElement): Promise<boolean> {
  switch (action) {
    case "compose-ai-rewrite": {
      const st = element?.dataset.rewriteStyle ?? "Formal";
      void composeAiRewrite(st, scopeFromElement(element));
      return true;
    }
    case "compose-ai-rewrite-selected-tone":
      void composeAiRewrite(composeRewriteStyleFromTone(), scopeFromElement(element));
      return true;
    case "compose-ai-grammar":
      void composeAiGrammar(scopeFromElement(element));
      return true;
    case "compose-ai-translate":
      void composeAiTranslate(translateLangFromElement(element), scopeFromElement(element));
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
    case "compose-grammar-apply-all": {
      const gi = Number(element?.dataset.grammarI ?? "");
      applyComposeGrammarSuggestionAllAtIndex(gi);
      return true;
    }
    case "compose-grammar-apply-everything":
      applyComposeGrammarSuggestionsEverything();
      return true;
    default:
      return false;
  }
}
