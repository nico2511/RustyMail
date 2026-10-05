import { confirmAndExecuteSplitSend as confirmAndExecuteSplitSendImpl } from "./composeSendDraftRun";
import {
  composeAiGrammar as composeAiGrammarImpl,
  composeAiRewrite as composeAiRewriteImpl,
  type ComposeAiScope,
} from "./composeAiComposeLlm";

export function composeAiRewrite(styleRaw: string, scope: ComposeAiScope = "document"): void | Promise<void> {
  return composeAiRewriteImpl(styleRaw, scope);
}

export function composeAiGrammar(scope: ComposeAiScope = "document"): void | Promise<void> {
  return composeAiGrammarImpl(scope);
}

export function confirmAndExecuteSplitSend(): void | Promise<void> {
  return confirmAndExecuteSplitSendImpl();
}
