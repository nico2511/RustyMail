import { confirmAndExecuteSplitSend as confirmAndExecuteSplitSendImpl } from "./composeSendDraftRun";
import { composeAiGrammar as composeAiGrammarImpl, composeAiRewrite as composeAiRewriteImpl } from "./composeAiComposeLlm";

export function composeAiRewrite(styleRaw: string): void | Promise<void> {
  return composeAiRewriteImpl(styleRaw);
}

export function composeAiGrammar(): void | Promise<void> {
  return composeAiGrammarImpl();
}

export function confirmAndExecuteSplitSend(): void | Promise<void> {
  return confirmAndExecuteSplitSendImpl();
}
