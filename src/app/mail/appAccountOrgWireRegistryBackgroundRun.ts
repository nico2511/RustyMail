import { currentAccount } from "../core/accountContext";
import { tauriErrorMessage, withTimeout } from "../lib/tauriCommand";
import { aiCacheKeySegment } from "./aiCacheKeySegment";
import { initIdleAiCachePrefetch } from "./idleAiCachePrefetch";
import { initMailboxDigest } from "./mailboxDigest";
import { refreshLlmRuntimeStatus } from "./settingsLlmRuntime";
import {
  summarizeThreadCore,
  translateThreadCore,
} from "./threadAiRun";
import { threadIsAutoMail } from "./threadAutoMail";
import { langFromKindTags } from "./threadLangGuess";
import { normalizeIso639Primary } from "./threadLangGuessSamples";

export function registerAppBackgroundServices(): void {
  initMailboxDigest({
    withTimeout,
    currentAccount,
    refreshLlmRuntimeStatus,
    tauriErrorMessage,
  });

  initIdleAiCachePrefetch({
    withTimeout,
    currentAccount,
    aiCacheKeySegment,
    refreshLlmRuntimeStatus,
    threadIsAutoMail,
    langFromKindTags,
    normalizeIso639Primary,
    summarizeThreadCore,
    translateThreadCore,
  });
}
