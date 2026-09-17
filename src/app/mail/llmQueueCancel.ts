export type LlmQueueCancelDeps = {
  cancelActiveLlmStreamJob: () => void;
  abortIdleAiCachePrefetchInFlight: () => void;
  abortLlmQueue: () => void;
};

let llmQueueCancelDeps: LlmQueueCancelDeps | null = null;

export function registerLlmQueueCancelDeps(deps: LlmQueueCancelDeps): void {
  llmQueueCancelDeps = deps;
}

export function cancelLlmQueueJob(): void {
  const d = llmQueueCancelDeps;
  if (!d) throw new Error("registerLlmQueueCancelDeps not called");
  d.cancelActiveLlmStreamJob();
  d.abortIdleAiCachePrefetchInFlight();
  d.abortLlmQueue();
}
