/** Lecture DOM → `AppPrefs.ai` (paramètres IA). */

import type { AiFeatureKey } from "./aiFeatures";
import {
  defaultAppPrefs,
  normalizeAiPrefsMerged,
  WHISPER_PTT_KEY_CODES,
  type AppPrefs,
  type AppPrefsAi,
} from "./prefs_defaults";

/** Aligne les cases OpenRouter / llama-server avec l’état mémoire (avant enregistrement). */
export function syncLlmEnginePrefsToDom(ai: AppPrefsAi): void {
  const set = (id: string, checked: boolean) => {
    const el = document.querySelector<HTMLInputElement>(`#${id}`);
    if (el) el.checked = checked;
  };
  set("prefs-openrouter-enabled", ai.openrouterEnabled);
  set("prefs-llama-server-enabled", ai.llamaServerEnabled);
  set("prefs-ai-cloud-fallback", ai.aiCloudLlmFallback);
}

function captureAiFeatureTogglesInto(ai: AppPrefs["ai"]): void {
  document.querySelectorAll<HTMLInputElement>("[data-ai-feature]").forEach((el) => {
    const key = el.dataset.aiFeature as AiFeatureKey | undefined;
    if (!key) return;
    ai[key] = el.checked;
  });
}

export function captureAiPrefsFieldsFromDom(target: AppPrefs): void {
  const dAi = defaultAppPrefs().ai;

  const en = document.querySelector<HTMLInputElement>("#prefs-dictation-enabled");
  if (en) target.ai.dictationEnabled = Boolean(en.checked);

  const bk = document.querySelector<HTMLSelectElement>("#prefs-dictation-backend");
  if (bk) {
    const raw = bk.value.trim();
    target.ai.dictationBackend =
      raw === "cloud" || raw === "local_http" ? raw : "whisper_cpp";
  }

  const drw = document.querySelector<HTMLInputElement>("#prefs-dictation-rewrite-style");
  if (drw) target.ai.dictationRewriteWithStyle = Boolean(drw.checked);

  const pttSel = document.querySelector<HTMLSelectElement>("#prefs-whisper-ptt-key");
  if (pttSel) {
    const rawPtt = pttSel.value.trim();
    target.ai.whisperPttKeyCode = (WHISPER_PTT_KEY_CODES as readonly string[]).includes(rawPtt)
      ? rawPtt
      : dAi.whisperPttKeyCode;
  }

  const sem = document.querySelector<HTMLInputElement>("#prefs-semantic-search");
  if (sem && !sem.disabled) {
    target.ai.semanticSearchEnabled = Boolean(sem.checked);
  }

  const whisperLang = document.querySelector<HTMLSelectElement>("#prefs-whisper-cpp-lang");
  if (whisperLang) {
    target.ai.whisperCppLanguage = whisperLang.value.trim() || dAi.whisperCppLanguage;
    target.ai.whisperModelSize =
      document.querySelector<HTMLSelectElement>("#prefs-neural-size")?.value?.trim() || dAi.whisperModelSize;
    target.ai.whisperProcessingUnit =
      document.querySelector<HTMLSelectElement>("#prefs-processing-unit")?.value?.trim() || "auto";
    target.ai.whisperTranscriptionProfile =
      document.querySelector<HTMLSelectElement>("#prefs-transcription-profile")?.value?.trim() ||
      dAi.whisperTranscriptionProfile;
    const maxSecRaw = document.querySelector<HTMLInputElement>("#prefs-max-record-sec")?.value?.trim();
    const maxSec = maxSecRaw !== undefined ? Number.parseInt(maxSecRaw, 10) : target.ai.whisperMaxRecordSeconds;
    target.ai.whisperMaxRecordSeconds = Number.isFinite(maxSec)
      ? Math.min(600, Math.max(0, maxSec))
      : dAi.whisperMaxRecordSeconds;
    const cloudFb = document.querySelector<HTMLInputElement>("#prefs-local-cloud-fallback");
    if (cloudFb) target.ai.whisperCloudFallback = Boolean(cloudFb.checked);
  }

  const openaiBase = document.querySelector<HTMLInputElement>("#prefs-openai-base");
  if (openaiBase) {
    target.ai.openaiBaseUrl = openaiBase.value.trim() || dAi.openaiBaseUrl;
    target.ai.whisperModel =
      document.querySelector<HTMLInputElement>("#prefs-whisper-model")?.value?.trim() || dAi.whisperModel;
    target.ai.translateModel =
      document.querySelector<HTMLInputElement>("#prefs-translate-model")?.value?.trim() || dAi.translateModel;
    target.ai.speechLanguage =
      document.querySelector<HTMLInputElement>("#prefs-speech-lang")?.value?.trim() || dAi.speechLanguage;
    target.ai.draftLanguage =
      document.querySelector<HTMLInputElement>("#prefs-draft-lang")?.value?.trim() || dAi.draftLanguage;
  }

  const companion = document.querySelector<HTMLInputElement>("#prefs-local-companion");
  if (companion) {
    target.ai.localCompanionBaseUrl = companion.value.trim();
  }

  const orEn = document.querySelector<HTMLInputElement>("#prefs-openrouter-enabled");
  if (orEn) {
    target.ai.openrouterEnabled = Boolean(orEn.checked);
    target.ai.openrouterBaseUrl =
      document.querySelector<HTMLInputElement>("#prefs-openrouter-base-url")?.value?.trim() ||
      dAi.openrouterBaseUrl;
    target.ai.openrouterModel =
      document.querySelector<HTMLInputElement>("#prefs-openrouter-model")?.value?.trim() ||
      dAi.openrouterModel;
  }

  const llEn = document.querySelector<HTMLInputElement>("#prefs-llama-server-enabled");
  if (llEn) {
    target.ai.llamaServerEnabled = Boolean(llEn.checked);
    target.ai.llamaServerBaseUrl =
      document.querySelector<HTMLInputElement>("#prefs-llama-server-base-url")?.value?.trim() ||
      dAi.llamaServerBaseUrl;
    target.ai.llamaServerModel =
      document.querySelector<HTMLInputElement>("#prefs-llama-server-model")?.value?.trim() ||
      dAi.llamaServerModel;
    target.ai.llamaServerAllowCpuOverride = Boolean(
      document.querySelector<HTMLInputElement>("#prefs-llama-server-cpu-override")?.checked
    );
    target.ai.llamaServerSpawnEnabled = Boolean(
      document.querySelector<HTMLInputElement>("#prefs-llama-server-spawn-enabled")?.checked
    );
    target.ai.llamaServerBinaryPath =
      document.querySelector<HTMLInputElement>("#prefs-llama-server-binary-path")?.value?.trim() ?? "";
  }

  const localRepo = document.querySelector<HTMLInputElement>("#prefs-local-llm-repo");
  if (localRepo) {
    target.ai.localLlmEnabled = true;
    target.ai.localLlmHfRepoId = localRepo.value.trim() || dAi.localLlmHfRepoId;
    target.ai.localLlmHfRevision =
      document.querySelector<HTMLInputElement>("#prefs-local-llm-rev")?.value?.trim() || dAi.localLlmHfRevision;
    target.ai.localLlmGgufFile =
      document.querySelector<HTMLInputElement>("#prefs-local-llm-file")?.value?.trim() || dAi.localLlmGgufFile;
    const ctxHidden = document.querySelector<HTMLInputElement>("#prefs-local-llm-ctx");
    const ctxRaw = ctxHidden?.value?.trim();
    const ctxN = ctxRaw !== undefined && ctxRaw !== "" ? Number.parseInt(ctxRaw, 10) : target.ai.localLlmContextSize;
    target.ai.localLlmContextSize =
      Number.isFinite(ctxN) ? Math.min(131072, Math.max(512, Math.trunc(ctxN))) : dAi.localLlmContextSize;
  }

  const localLlmEnabled = document.querySelector<HTMLInputElement>("#prefs-local-llm-enabled");
  if (localLlmEnabled && localLlmEnabled.type === "checkbox") {
    target.ai.localLlmEnabled = Boolean(localLlmEnabled.checked);
  }

  const panelEl = document.querySelector<HTMLInputElement>("#prefs-ai-panel-width");
  if (panelEl) {
    const panelRaw = panelEl.value?.trim();
    const panelN = panelRaw !== undefined && panelRaw !== "" ? Number.parseInt(panelRaw, 10) : dAi.aiPanelWidthPx;
    target.ai.aiPanelWidthPx =
      Number.isFinite(panelN) ? Math.min(640, Math.max(260, Math.trunc(panelN))) : dAi.aiPanelWidthPx;
  }

  const bgSem = document.querySelector<HTMLInputElement>("#prefs-bg-auto-semantic");
  const bgLl = document.querySelector<HTMLInputElement>("#prefs-bg-llm-prefetch");
  const bgIdleCache = document.querySelector<HTMLInputElement>("#prefs-bg-idle-ai-cache");
  const bgCloud = document.querySelector<HTMLInputElement>("#prefs-ai-cloud-fallback");
  if (bgSem) target.ai.aiBackgroundAutoSemanticIndex = Boolean(bgSem.checked);
  if (bgLl) target.ai.aiBackgroundLlmPrefetch = Boolean(bgLl.checked);
  if (bgIdleCache) target.ai.aiBackgroundIdleLlmCachePrefetch = Boolean(bgIdleCache.checked);
  if (bgCloud) target.ai.aiCloudLlmFallback = Boolean(bgCloud.checked);

  const autoMinRaw = document.querySelector<HTMLInputElement>("#prefs-auto-thread-summary-min")?.value?.trim();
  if (autoMinRaw !== undefined) {
    const autoMinN = autoMinRaw !== "" ? Number.parseInt(autoMinRaw, 10) : dAi.autoThreadSummaryMinMessages;
    target.ai.autoThreadSummaryMinMessages =
      Number.isFinite(autoMinN) ? Math.min(50, Math.max(2, Math.trunc(autoMinN))) : dAi.autoThreadSummaryMinMessages;
  }

  if (document.querySelector("[data-ai-feature]")) {
    captureAiFeatureTogglesInto(target.ai);
  }

  target.ai.threadLayout = "reading";
  target.ai = normalizeAiPrefsMerged(target.ai);
}
