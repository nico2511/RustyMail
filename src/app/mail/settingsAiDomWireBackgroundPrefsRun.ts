// @ts-nocheck — DOM wiring; tighten types incrementally.
import { state } from "../state";
import {
  invalidateIdleAiCachePrefetch,
  scheduleIdleAiCachePrefetch,
} from "./idleAiCachePrefetch";
import { persistAiPrefsImmediateFromDom } from "./settingsAiDomWirePersistRun";

export function wireSettingsAiDomBackgroundPrefsListeners(signal: AbortSignal): void {
  document.querySelector<HTMLInputElement>("#prefs-bg-auto-semantic")?.addEventListener(
    "change",
    (ev) => {
      state.appPrefs.ai.aiBackgroundAutoSemanticIndex = Boolean(
        (ev.currentTarget as HTMLInputElement)?.checked,
      );
      persistAiPrefsImmediateFromDom();
    },
    { signal },
  );

  document.querySelector<HTMLInputElement>("#prefs-bg-llm-prefetch")?.addEventListener(
    "change",
    (ev) => {
      state.appPrefs.ai.aiBackgroundLlmPrefetch = Boolean(
        (ev.currentTarget as HTMLInputElement)?.checked,
      );
      persistAiPrefsImmediateFromDom();
    },
    { signal },
  );

  document.querySelector<HTMLInputElement>("#prefs-bg-idle-ai-cache")?.addEventListener(
    "change",
    (ev) => {
      state.appPrefs.ai.aiBackgroundIdleLlmCachePrefetch = Boolean(
        (ev.currentTarget as HTMLInputElement)?.checked,
      );
      if (!state.appPrefs.ai.aiBackgroundIdleLlmCachePrefetch) invalidateIdleAiCachePrefetch();
      persistAiPrefsImmediateFromDom();
      if (state.appPrefs.ai.aiBackgroundIdleLlmCachePrefetch) scheduleIdleAiCachePrefetch();
    },
    { signal },
  );

  document.querySelector<HTMLInputElement>("#prefs-ai-cloud-fallback")?.addEventListener(
    "change",
    (ev) => {
      state.appPrefs.ai.aiCloudLlmFallback = Boolean((ev.currentTarget as HTMLInputElement)?.checked);
      persistAiPrefsImmediateFromDom();
    },
    { signal },
  );

  document.querySelector<HTMLInputElement>("#prefs-semantic-search")?.addEventListener(
    "change",
    (ev) => {
      const el = ev.currentTarget as HTMLInputElement;
      if (el.disabled) return;
      state.appPrefs.ai.semanticSearchEnabled = Boolean(el.checked);
      persistAiPrefsImmediateFromDom();
    },
    { signal },
  );
}
