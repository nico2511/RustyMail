/** Re-exports for idle AI cache prefetch (split modules). */
export { initIdleAiCachePrefetch, type IdleAiCachePrefetchDeps } from "./idleAiCachePrefetchContext";
export {
  abortIdleAiCachePrefetchInFlight,
  invalidateIdleAiCachePrefetch,
  scheduleIdleAiCachePrefetch,
} from "./idleAiCachePrefetchScheduleRun";
