import { confirmAndExecuteSplitSend as confirmAndExecuteSplitSendImpl } from "./composeSendDraftRun";
import {
  composeAiGrammar as composeAiGrammarImpl,
  composeAiRewrite as composeAiRewriteImpl,
  composeAiTranslate as composeAiTranslateImpl,
  type ComposeAiScope,
} from "./composeAiComposeLlm";
import type { ComposeSelectionSnapshot } from "./composeBodyEditor";

export function composeAiRewrite(
  styleRaw: string,
  scope: ComposeAiScope = "document",
  selectionSnap?: ComposeSelectionSnapshot | null,
): void | Promise<void> {
  return composeAiRewriteImpl(styleRaw, scope, selectionSnap);
}

export function composeAiGrammar(
  scope: ComposeAiScope = "document",
  selectionSnap?: ComposeSelectionSnapshot | null,
): void | Promise<void> {
  return composeAiGrammarImpl(scope, selectionSnap);
}

export function composeAiTranslate(
  targetLang?: string,
  scope: ComposeAiScope = "document",
  selectionSnap?: ComposeSelectionSnapshot | null,
): void | Promise<void> {
  return composeAiTranslateImpl(targetLang, scope, selectionSnap);
}

export function confirmAndExecuteSplitSend(): void | Promise<void> {
  return confirmAndExecuteSplitSendImpl();
}
