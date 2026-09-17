export type ThreadAiWireActionsDeps = {
  summarizeThread: () => Promise<void>;
  llmTranslateThreadUi: () => void | Promise<void>;
  llmTranslateMessageUi: (messageId: string, forceRefresh?: boolean) => void | Promise<void>;
  llmQuickRepliesThreadUi: () => void | Promise<void>;
  llmInboxDigestUi: () => void | Promise<void>;
  llmQaThreadUi: () => void | Promise<void>;
};

let threadAiWireActionsDeps: ThreadAiWireActionsDeps | null = null;

export function registerThreadAiWireActionsDeps(deps: ThreadAiWireActionsDeps): void {
  threadAiWireActionsDeps = deps;
}

function threadAi(): ThreadAiWireActionsDeps {
  if (!threadAiWireActionsDeps) throw new Error("registerThreadAiWireActionsDeps not called");
  return threadAiWireActionsDeps;
}

export function summarizeThread(): Promise<void> {
  return threadAi().summarizeThread();
}

export function llmTranslateThreadUi(): void | Promise<void> {
  return threadAi().llmTranslateThreadUi();
}

export function llmTranslateMessageUi(messageId: string, forceRefresh = false): void | Promise<void> {
  return threadAi().llmTranslateMessageUi(messageId, forceRefresh);
}

export function llmQuickRepliesThreadUi(): void | Promise<void> {
  return threadAi().llmQuickRepliesThreadUi();
}

export function llmInboxDigestUi(): void | Promise<void> {
  return threadAi().llmInboxDigestUi();
}

export function llmQaThreadUi(): void | Promise<void> {
  return threadAi().llmQaThreadUi();
}
