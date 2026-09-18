// @ts-nocheck — DOM wiring; tighten types incrementally.
import { invoke } from "@tauri-apps/api/core";
import { captureAiFeatureTogglesFromDom, captureAiPrefsFieldsFromDom, persistAiFeaturePrefs, syncLlmEnginePrefsToDom } from "../../../aiPrefsPersist";
import { normalizeAiPrefsMerged } from "../../../prefs_defaults";
import { applyEngineConnectionMode } from "../../../settingsAiPanel";
import { tauriErrorMessage, withTimeout } from "../../lib/tauriCommand";
import { MAIL_ACTION_TIMEOUT_MS } from "../../core/timeouts";
import { isTauriRuntime } from "../../lib/tauriRuntime";
import { toast } from "../../lib/toast";
import {
  invalidateIdleAiCachePrefetch,
  scheduleIdleAiCachePrefetch,
} from "../../mail/idleAiCachePrefetch";
import {
  refreshLlmRuntimeStatus,
  schedulePersistAiPrefsFromDom,
  applyContextSliderIndex,
  persistEngineCheckboxToggle,
} from "../../mail/settingsWireActions";
import { state } from "../../state";
import { render } from "../../dispatch";
import { wireEventsContext } from "./wireEventsContext";

export function wireEventsDomSettingsAi(signal: AbortSignal): void {
  document.querySelectorAll<HTMLInputElement>("[data-ai-feature]").forEach((el) => {
    el.addEventListener(
      "change",
      () => {
        captureAiFeatureTogglesFromDom();
        state.appPrefs.ai = normalizeAiPrefsMerged(state.appPrefs.ai);
        void (async () => {
          try {
            await persistAiFeaturePrefs();
          } catch (e) {
            toast(tauriErrorMessage(e));
          }
        })();
      },
      { signal }
    );
  });

  document.addEventListener(
    "change",
    (ev: Event) => {
      if (!state.settingsAiModal) return;
      const t = ev.target as HTMLElement | null;
      if (!t?.closest(".settings-ai-modal-body")) return;
      const id = (t as HTMLInputElement | HTMLSelectElement).id ?? "";
      if (id && wireEventsContext().AI_PREFS_IMMEDIATE_CHECKBOX_IDS.has(id)) {
        if (id === "prefs-openrouter-enabled" && t instanceof HTMLInputElement) {
          const next = t.checked;
          if (!next) {
            applyEngineConnectionMode(state.appPrefs.ai, "local");
            state.aiEngineSettingsTab = "local";
          } else {
            state.appPrefs.ai.openrouterEnabled = true;
          }
          syncLlmEnginePrefsToDom(state.appPrefs.ai);
          void persistEngineCheckboxToggle(next ? "OpenRouter activé." : "OpenRouter désactivé — bascule PC.");
        } else if (id === "prefs-llama-server-enabled" && t instanceof HTMLInputElement) {
          state.appPrefs.ai.llamaServerEnabled = t.checked;
          void persistEngineCheckboxToggle(t.checked ? "llama-server activé." : "llama-server désactivé.");
        }
        return;
      }
      if (t.matches('select[id^="prefs-"]')) {
        if (id === "prefs-dictation-backend" && t instanceof HTMLSelectElement) {
          const raw = t.value.trim();
          state.appPrefs.ai.dictationBackend =
            raw === "cloud" || raw === "local_http" ? raw : "whisper_cpp";
          captureAiPrefsFieldsFromDom(state.appPrefs);
          schedulePersistAiPrefsFromDom({ skipDomCapture: true });
          render();
          return;
        }
        if (id === "prefs-openrouter-model-preset" && t instanceof HTMLSelectElement) {
          const v = t.value.trim();
          if (v && v !== "__custom__") {
            state.appPrefs.ai.openrouterModel = v;
            const inp = document.querySelector<HTMLInputElement>("#prefs-openrouter-model");
            if (inp) inp.value = v;
          }
          captureAiPrefsFieldsFromDom(state.appPrefs);
          schedulePersistAiPrefsFromDom({ skipDomCapture: true });
          return;
        }
        if (id === "prefs-local-gguf-preset" && t instanceof HTMLSelectElement) {
          const v = t.value.trim();
          if (v && v !== "__custom__") {
            const sep = v.indexOf("|");
            if (sep > 0) {
              const repo = v.slice(0, sep);
              const file = v.slice(sep + 1);
              state.appPrefs.ai.localLlmHfRepoId = repo;
              state.appPrefs.ai.localLlmGgufFile = file;
              state.appPrefs.ai.localLlmEnabled = true;
              const repoEl = document.querySelector<HTMLInputElement>("#prefs-local-llm-repo");
              const fileEl = document.querySelector<HTMLInputElement>("#prefs-local-llm-file");
              if (repoEl) repoEl.value = repo;
              if (fileEl) fileEl.value = file;
            }
          }
          captureAiPrefsFieldsFromDom(state.appPrefs);
          schedulePersistAiPrefsFromDom({ skipDomCapture: true });
          return;
        }
        captureAiPrefsFieldsFromDom(state.appPrefs);
        schedulePersistAiPrefsFromDom({ skipDomCapture: true });
        return;
      }
      if (t instanceof HTMLInputElement && t.type === "checkbox" && id.startsWith("prefs-")) {
        captureAiPrefsFieldsFromDom(state.appPrefs);
        schedulePersistAiPrefsFromDom({ skipDomCapture: true });
        return;
      }
      if (t.matches("[data-ai-feature]")) return;
      if (
        t instanceof HTMLInputElement &&
        t.classList.contains("settings-ctl") &&
        t.id?.startsWith("prefs-") &&
        t.type !== "password" &&
        t.type !== "checkbox"
      ) {
        if (id === "prefs-local-llm-ctx-range") {
          applyContextSliderIndex(Number.parseInt(t.value, 10));
        }
        captureAiPrefsFieldsFromDom(state.appPrefs);
        schedulePersistAiPrefsFromDom({ skipDomCapture: true });
      }
    },
    { signal }
  );

  document.addEventListener(
    "input",
    (ev: Event) => {
      if (!state.settingsAiModal) return;
      const t = ev.target as HTMLElement | null;
      if (!(t instanceof HTMLInputElement) || t.id !== "prefs-local-llm-ctx-range") return;
      if (!t.closest(".settings-ai-modal-body")) return;
      applyContextSliderIndex(Number.parseInt(t.value, 10));
      captureAiPrefsFieldsFromDom(state.appPrefs);
      schedulePersistAiPrefsFromDom({ skipDomCapture: true });
    },
    { signal }
  );

  const persistAiImmediate = (): void => {
    if (!isTauriRuntime()) return;
    void (async () => {
      try {
        await withTimeout(invoke("set_app_prefs", { prefs: state.appPrefs }), MAIL_ACTION_TIMEOUT_MS);
        toast("Réglage IA enregistré.");
      } catch (e) {
        toast(tauriErrorMessage(e));
      }
    })();
  };

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
      persistAiImmediate();
    },
    { signal }
  );

  document.querySelector<HTMLInputElement>("#prefs-bg-llm-prefetch")?.addEventListener(
    "change",
    (ev) => {
      state.appPrefs.ai.aiBackgroundLlmPrefetch = Boolean(
        (ev.currentTarget as HTMLInputElement)?.checked
      );
      persistAiImmediate();
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
      persistAiImmediate();
      if (state.appPrefs.ai.aiBackgroundIdleLlmCachePrefetch) scheduleIdleAiCachePrefetch();
    },
    { signal }
  );

  document.querySelector<HTMLInputElement>("#prefs-ai-cloud-fallback")?.addEventListener(
    "change",
    (ev) => {
      state.appPrefs.ai.aiCloudLlmFallback = Boolean((ev.currentTarget as HTMLInputElement)?.checked);
      persistAiImmediate();
    },
    { signal }
  );

  document.querySelector<HTMLInputElement>("#prefs-semantic-search")?.addEventListener(
    "change",
    (ev) => {
      const el = ev.currentTarget as HTMLInputElement;
      if (el.disabled) return;
      state.appPrefs.ai.semanticSearchEnabled = Boolean(el.checked);
      persistAiImmediate();
    },
    { signal }
  );
}
