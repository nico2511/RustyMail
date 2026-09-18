// @ts-nocheck — DOM wiring; tighten types incrementally.
import { invoke } from "@tauri-apps/api/core";
import { MAIL_ACTION_TIMEOUT_MS } from "../core/timeouts";
import { isTauriRuntime } from "../lib/tauriRuntime";
import { tauriErrorMessage, withTimeout } from "../lib/tauriCommand";
import { toast } from "../lib/toast";
import { render } from "../dispatch";
import { state } from "../state";
import {
  invalidateIdleAiCachePrefetch,
  scheduleIdleAiCachePrefetch,
} from "./idleAiCachePrefetch";
import { refreshLlmRuntimeStatus } from "./settingsWireActions";
import { persistAiPrefsImmediateFromDom } from "./settingsAiDomWirePersistRun";

export function wireSettingsAiDomEngineAndBackgroundListeners(signal: AbortSignal): void {
  document
    .querySelector<HTMLInputElement>("#prefs-llama-server-cpu-override")
    ?.addEventListener(
      "change",
      (ev) => {
        const next = Boolean((ev.currentTarget as HTMLInputElement | null)?.checked);
        state.appPrefs.ai.llamaServerAllowCpuOverride = next;
        if (!isTauriRuntime()) return;
        void (async () => {
          try {
            await withTimeout(invoke("set_app_prefs", { prefs: state.appPrefs }), MAIL_ACTION_TIMEOUT_MS);
            toast(next ? "Override CPU autorisé (llama-server)." : "Override CPU désactivé.");
            void refreshLlmRuntimeStatus(false).then(() => {
              if (state.settingsAiModal === "engines") render();
            });
          } catch (e) {
            toast(tauriErrorMessage(e));
          }
        })();
      },
      { signal }
    );

  document
    .querySelector<HTMLInputElement>("#prefs-llama-server-spawn-enabled")
    ?.addEventListener(
      "change",
      (ev) => {
        const next = Boolean((ev.currentTarget as HTMLInputElement | null)?.checked);
        state.appPrefs.ai.llamaServerSpawnEnabled = next;
        if (!isTauriRuntime()) return;
        void (async () => {
          try {
            await withTimeout(invoke("set_app_prefs", { prefs: state.appPrefs }), MAIL_ACTION_TIMEOUT_MS);
            toast(next ? "Lancement llama-server par l’app activé." : "Lancement llama-server par l’app désactivé.");
            void refreshLlmRuntimeStatus(false).then(() => {
              if (state.settingsAiModal === "engines") render();
            });
          } catch (e) {
            toast(tauriErrorMessage(e));
          }
        })();
      },
      { signal }
    );

  document.querySelector<HTMLInputElement>("#prefs-bg-auto-semantic")?.addEventListener(
    "change",
    (ev) => {
      state.appPrefs.ai.aiBackgroundAutoSemanticIndex = Boolean(
        (ev.currentTarget as HTMLInputElement)?.checked
      );
      persistAiPrefsImmediateFromDom();
    },
    { signal }
  );

  document.querySelector<HTMLInputElement>("#prefs-bg-llm-prefetch")?.addEventListener(
    "change",
    (ev) => {
      state.appPrefs.ai.aiBackgroundLlmPrefetch = Boolean(
        (ev.currentTarget as HTMLInputElement)?.checked
      );
      persistAiPrefsImmediateFromDom();
    },
    { signal }
  );

  document.querySelector<HTMLInputElement>("#prefs-bg-idle-ai-cache")?.addEventListener(
    "change",
    (ev) => {
      state.appPrefs.ai.aiBackgroundIdleLlmCachePrefetch = Boolean(
        (ev.currentTarget as HTMLInputElement)?.checked
      );
      if (!state.appPrefs.ai.aiBackgroundIdleLlmCachePrefetch) invalidateIdleAiCachePrefetch();
      persistAiPrefsImmediateFromDom();
      if (state.appPrefs.ai.aiBackgroundIdleLlmCachePrefetch) scheduleIdleAiCachePrefetch();
    },
    { signal }
  );

  document.querySelector<HTMLInputElement>("#prefs-ai-cloud-fallback")?.addEventListener(
    "change",
    (ev) => {
      state.appPrefs.ai.aiCloudLlmFallback = Boolean((ev.currentTarget as HTMLInputElement)?.checked);
      persistAiPrefsImmediateFromDom();
    },
    { signal }
  );

  document.querySelector<HTMLInputElement>("#prefs-semantic-search")?.addEventListener(
    "change",
    (ev) => {
      const el = ev.currentTarget as HTMLInputElement;
      if (el.disabled) return;
      state.appPrefs.ai.semanticSearchEnabled = Boolean(el.checked);
      persistAiPrefsImmediateFromDom();
    },
    { signal }
  );
}
