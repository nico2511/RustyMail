export type ComposeAssistWireActionsDeps = {
  summarizeSenderThreadsLight: () => void | Promise<void>;
  llmQuickRepliesComposeUi: () => void | Promise<void>;
};

let composeAssistWireActionsDeps: ComposeAssistWireActionsDeps | null = null;

export function registerComposeAssistWireActionsDeps(deps: ComposeAssistWireActionsDeps): void {
  composeAssistWireActionsDeps = deps;
}

function composeAssist(): ComposeAssistWireActionsDeps {
  if (!composeAssistWireActionsDeps) throw new Error("registerComposeAssistWireActionsDeps not called");
  return composeAssistWireActionsDeps;
}

export function summarizeSenderThreadsLight(): void | Promise<void> {
  return composeAssist().summarizeSenderThreadsLight();
}

export function llmQuickRepliesComposeUi(): void | Promise<void> {
  return composeAssist().llmQuickRepliesComposeUi();
}
