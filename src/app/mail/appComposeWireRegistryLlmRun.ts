import { cancelActiveLlmStreamJob } from "../../llmStream";
import { abortIdleAiCachePrefetchInFlight } from "./idleAiCachePrefetch";
import { abortLlmQueueJob } from "./llmJobQueue";
import { registerLlmQueueCancelDeps } from "./llmQueueCancel";

export function registerAppComposeWireLlmDeps(): void {
  registerLlmQueueCancelDeps({
    cancelActiveLlmStreamJob,
    abortIdleAiCachePrefetchInFlight,
    abortLlmQueue: abortLlmQueueJob,
  });
}
