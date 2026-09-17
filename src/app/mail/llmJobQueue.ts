import { render } from "../dispatch";
import { state } from "../state";
import { toast } from "../lib/toast";
import { abortIdleAiCachePrefetchInFlight } from "./idleAiCachePrefetch";

let llmQueueAbort: AbortController | null = null;

export function abortLlmQueueJob(): void {
  llmQueueAbort?.abort();
}

export async function withLlmQueue<T>(
  label: string,
  fn: (signal: AbortSignal) => Promise<T>,
): Promise<T | null> {
  if (state.llmJobLabel) {
    toast(`IA occupée (${state.llmJobLabel}). Annulez ou attendez la fin.`);
    return null;
  }
  abortIdleAiCachePrefetchInFlight();
  const ac = new AbortController();
  llmQueueAbort = ac;
  state.llmJobLabel = label;
  render();
  try {
    return await fn(ac.signal);
  } finally {
    if (llmQueueAbort === ac) llmQueueAbort = null;
    state.llmJobLabel = null;
    render();
  }
}
