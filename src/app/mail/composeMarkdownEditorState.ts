import {
  collapseLargeDataImageMarkdown,
  expandInlineImagePlaceholders,
} from "../../composeMarkdownImages";
import { state } from "../state";
import { syncComposeEditorFromState } from "./composeBodyEditor";

function composeDisplayToCanonical(display: string): string {
  return expandInlineImagePlaceholders(display, state.composeCanonicalBody || state.draft?.markdownBody || display);
}

export function setComposeFromTextareaValue(textareaValue: string) {
  state.composeBody = textareaValue;
  const canonical = composeDisplayToCanonical(textareaValue);
  state.composeCanonicalBody = canonical;
  if (state.draft) state.draft.markdownBody = canonical;
  syncComposeEditorFromState();
}

export function loadComposeMarkdownIntoEditor(markdown: string) {
  state.composeCanonicalBody = markdown;
  state.composeBody = collapseLargeDataImageMarkdown(markdown);
  if (state.draft) state.draft.markdownBody = markdown;
  syncComposeEditorFromState();
}

/** L’historique d’annulation est celui de TipTap, recréé avec l’éditeur. */
export function resetMarkdownEditorHistory() {}
