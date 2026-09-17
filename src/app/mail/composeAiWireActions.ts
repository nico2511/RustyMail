import { confirmAndExecuteSplitSend as confirmAndExecuteSplitSendImpl } from "./composeSendDraftRun";

export type ComposeAiWireActionsDeps = {
  composeAiRewrite: (styleRaw: string) => void | Promise<void>;
  composeAiGrammar: () => void | Promise<void>;
};

let composeAiWireActionsDeps: ComposeAiWireActionsDeps | null = null;

export function registerComposeAiWireActionsDeps(deps: ComposeAiWireActionsDeps): void {
  composeAiWireActionsDeps = deps;
}

function composeAi(): ComposeAiWireActionsDeps {
  if (!composeAiWireActionsDeps) throw new Error("registerComposeAiWireActionsDeps not called");
  return composeAiWireActionsDeps;
}

export function composeAiRewrite(styleRaw: string): void | Promise<void> {
  return composeAi().composeAiRewrite(styleRaw);
}

export function composeAiGrammar(): void | Promise<void> {
  return composeAi().composeAiGrammar();
}

export function confirmAndExecuteSplitSend(): void | Promise<void> {
  return confirmAndExecuteSplitSendImpl();
}
