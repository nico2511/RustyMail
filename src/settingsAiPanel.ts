import { getAiFeatureToggleGroups, isAiFeatureEnabled, type AiFeatureKey } from "./aiFeatures";
import { t } from "./i18n";
import { renderPromptsSettingsBody, type PromptCatalogItem } from "./promptsSettingsPanel";
import type { AppPrefsAi } from "./prefs_defaults";

/** Fenêtres de contexte proposées (llama-server `-c`). */
export const LLM_CONTEXT_PRESETS = [4096, 8192, 16384, 32768] as const;

export const OPENROUTER_MODEL_PRESETS: { id: string; label: string }[] = [
  { id: "openai/gpt-4o-mini", label: "OpenAI GPT-4o mini — rapide" },
  { id: "google/gemini-2.0-flash-001", label: "Google Gemini 2.0 Flash" },
  { id: "anthropic/claude-3.5-haiku", label: "Anthropic Claude 3.5 Haiku" },
  { id: "meta-llama/llama-3.3-70b-instruct", label: "Meta Llama 3.3 70B" },
  { id: "qwen/qwen-2.5-72b-instruct", label: "Qwen 2.5 72B" },
];

export const LOCAL_GGUF_PRESETS: { repo: string; file: string; label: string }[] = [
  { repo: "Qwen/Qwen2.5-3B-Instruct-GGUF", file: "qwen2.5-3b-instruct-q4_k_m.gguf", label: "Qwen 2.5 3B — léger" },
  { repo: "Qwen/Qwen2.5-7B-Instruct-GGUF", file: "qwen2.5-7b-instruct-q4_k_m.gguf", label: "Qwen 2.5 7B — équilibré" },
  { repo: "Qwen/Qwen2.5-14B-Instruct-GGUF", file: "qwen2.5-14b-instruct-q4_k_m.gguf", label: "Qwen 2.5 14B — confortable" },
];

export function contextPresetIndex(n: number): number {
  const exact = LLM_CONTEXT_PRESETS.indexOf(n as (typeof LLM_CONTEXT_PRESETS)[number]);
  if (exact >= 0) return exact;
  let best = 0;
  let bestDiff = Math.abs(LLM_CONTEXT_PRESETS[0]! - n);
  for (let i = 1; i < LLM_CONTEXT_PRESETS.length; i++) {
    const d = Math.abs(LLM_CONTEXT_PRESETS[i]! - n);
    if (d < bestDiff) {
      best = i;
      bestDiff = d;
    }
  }
  return best;
}

export function applyEngineConnectionMode(ai: AppPrefsAi, mode: "local" | "cloud" | "hybrid"): void {
  if (mode === "local") {
    ai.openrouterEnabled = false;
    ai.llamaServerEnabled = true;
    ai.aiCloudLlmFallback = false;
    ai.localLlmEnabled = true;
  } else if (mode === "cloud") {
    ai.openrouterEnabled = true;
    ai.llamaServerEnabled = false;
    ai.aiCloudLlmFallback = false;
  } else {
    ai.openrouterEnabled = true;
    ai.llamaServerEnabled = true;
    ai.aiCloudLlmFallback = true;
    ai.localLlmEnabled = true;
  }
}

export type SettingsAiModalId =
  | "features-0"
  | "features-1"
  | "features-2"
  | "features-3"
  | "features-common"
  | "dictation"
  | "semantic"
  | "engines"
  /** @deprecated Alias UI — même contenu que `engines`. */
  | "llm"
  | "background"
  | "prompts";

export type SettingsAiLlmRuntimeStatus = {
  hardwareTier: string;
  acceleratorSuggested: string;
  totalRamGb: number;
  availableRamGb: number;
  recommendedRepo: string;
  recommendedFile: string;
  profileLocalRunnable: boolean;
  profileReason?: string | null;
  modelFilePresent: boolean;
  expectedPathDisplay: string;
  localLlmEnabled: boolean;
  localRepoId: string;
  localRevision: string;
  localGgufFile: string;
  llmGateOpen: boolean;
  llmGateHint?: string | null;
  openrouterEnabled: boolean;
  openrouterApiKeySet: boolean;
  openrouterModel: string;
  llamaServerEnabled: boolean;
  llamaServerBaseUrl: string;
  llamaServerModel: string;
  llamaServerApiKeySet: boolean;
  llamaServerGpuGateOk: boolean;
  llamaServerAllowCpuOverride: boolean;
  llamaServerSpawnEnabled: boolean;
  llamaServerBinaryPath: string;
  llamaServerNCtx?: number | null;
};

export interface SettingsAiPanelDeps {
  ai: AppPrefsAi;
  escapeHtml: (s: string) => string;
  escapeAttr: (s: string) => string;
  iconSvg: (name: "close") => string;
  settingsExplainHtml: (inner: string, kind?: "lead" | "field" | "toggle") => string;
  formatWhisperPttKeyLabel: (code: string) => string;
  isTauri: boolean;
  semanticStatsBlock: string;
  semOk: boolean;
  keyHint: string;
  dictationApiKeySet: boolean;
  openrouterApiKeySet: boolean;
  llamaServerApiKeySet: boolean;
  llmRuntimeStatus: SettingsAiLlmRuntimeStatus | null;
  llmPrefetchPercent: number | null;
  llmPrefetchInFlight: boolean;
  llmCachedGgufFilenames: string[];
  bootstrapModelsCompleted: boolean;
  /** Onglet visible dans Paramètres → Moteurs (indépendant des cases cochées). */
  engineSettingsTab: "local" | "cloud" | "hybrid";
}

const SETTINGS_AI_MODAL_IDS: readonly SettingsAiModalId[] = [
  "features-0",
  "features-1",
  "features-2",
  "features-3",
  "features-common",
  "dictation",
  "semantic",
  "engines",
  "llm",
  "background",
  "prompts",
] as const;

export function normalizeSettingsAiModalId(value: string | undefined | null): SettingsAiModalId | null {
  if (!value) return null;
  if (value === "llm") return "engines";
  return isSettingsAiModalId(value) ? value : null;
}

export function isSettingsAiModalId(value: string | undefined | null): value is SettingsAiModalId {
  return Boolean(value && (SETTINGS_AI_MODAL_IDS as readonly string[]).includes(value));
}

export function settingsAiModalTitle(modalId: SettingsAiModalId): string {
  if (modalId === "features-common") return t("settings.ai.tabFeatures");
  if (modalId.startsWith("features-")) {
    const idx = Number.parseInt(modalId.replace("features-", ""), 10);
    return getAiFeatureToggleGroups()[idx]?.title ?? t("settings.ai.tabFeatures");
  }
  if (modalId === "engines" || modalId === "llm") return "Moteurs & connexion";
  const titles: Record<"dictation" | "semantic" | "background" | "prompts", string> = {
    dictation: t("settings.ai.tabDictation"),
    semantic: t("settings.ai.tabSemantic"),
    background: t("settings.ai.tabBackground"),
    prompts: t("settings.ai.tabPrompts"),
  };
  return titles[modalId as keyof typeof titles] ?? t("settings.tabs.ai");
}

const SETTINGS_AI_AUTOSAVE_HINT =
  '<p class="dim settings-ai-autosave-hint">Les changements sont enregistrés automatiquement.</p>';

export function engineConnectionMode(ai: AppPrefsAi): "local" | "cloud" | "hybrid" {
  if (ai.openrouterEnabled && ai.llamaServerEnabled && ai.aiCloudLlmFallback) return "hybrid";
  if (ai.openrouterEnabled && !ai.llamaServerEnabled) return "cloud";
  if (ai.llamaServerEnabled && !ai.openrouterEnabled) return "local";
  if (ai.openrouterEnabled && ai.llamaServerEnabled) return "hybrid";
  return "local";
}

function renderEngineModePicker(engineSettingsTab: "local" | "cloud" | "hybrid"): string {
  const mode = engineSettingsTab;
  const btn = (id: "local" | "cloud" | "hybrid", label: string, hint: string) => {
    const active = mode === id ? " settings-engine-mode-btn--active" : "";
    return `<button type="button" class="settings-engine-mode-btn${active}" data-action="ai-engine-mode" data-engine-mode="${id}" title="${hint}">
      <span class="settings-engine-mode-btn__label">${label}</span>
    </button>`;
  };
  return `
    <div class="settings-engine-mode" role="group" aria-label="Mode de connexion IA">
      ${btn("local", "Sur mon PC", "llama-server + modèle local")}
      ${btn("cloud", "Cloud", "OpenRouter (pas de gros fichier local)")}
      ${btn("hybrid", "Hybride", "PC en priorité, repli cloud si le local échoue")}
    </div>
    <p class="settings-explain settings-explain--lead dim" style="margin-top:8px">
      Comment l’app appelle le modèle de texte. Dictée et recherche sémantique : onglets dédiés.
    </p>`;
}

function renderContextSizeSlider(ai: AppPrefsAi, escapeAttr: (s: string) => string): string {
  const idx = contextPresetIndex(ai.localLlmContextSize);
  const val = LLM_CONTEXT_PRESETS[idx] ?? 4096;
  return `
    <div class="settings-form-row settings-form-row--stack">
      <label class="compose-field-label" for="prefs-local-llm-ctx-range">Mémoire de contexte</label>
      <div class="settings-ctx-slider">
        <input type="range" class="settings-ctx-slider__range" id="prefs-local-llm-ctx-range" min="0" max="${LLM_CONTEXT_PRESETS.length - 1}" step="1" value="${idx}" />
        <div class="settings-ctx-slider__labels">
          ${LLM_CONTEXT_PRESETS.map(
            (n, i) =>
              `<span class="settings-ctx-slider__tick${i === idx ? " settings-ctx-slider__tick--active" : ""}">${n >= 1024 ? `${Math.round(n / 1024)}k` : n}</span>`,
          ).join("")}
        </div>
        <input type="hidden" id="prefs-local-llm-ctx" value="${escapeAttr(String(val))}" />
        <p class="settings-form-field-hint dim"><strong id="prefs-local-llm-ctx-display">${val}</strong> jetons</p>
      </div>
    </div>`;
}

function renderUnifiedCloudKeySection(deps: SettingsAiPanelDeps): string {
  const { openrouterApiKeySet, dictationApiKeySet } = deps;
  const keySet = openrouterApiKeySet || dictationApiKeySet;
  return `
    <div class="settings-ai-subsection settings-ai-subsection--api-key">
      <h4 class="settings-ai-subsection__title">Clé API cloud</h4>
      <p class="settings-explain settings-explain--lead dim">
        Une clé pour <strong>OpenRouter</strong> (texte IA) et la <strong>dictée cloud</strong> si même fournisseur.
        ${keySet ? "Enregistrée dans le trousseau." : "Non renseignée."}
      </p>
      <div class="settings-inline-key-row">
        <input class="settings-ctl" type="password" id="prefs-cloud-api-key" placeholder="sk-or-v1-… ou clé OpenAI-compatible" autocomplete="new-password" spellcheck="false" />
        <div class="settings-inline-key-row__actions">
          <button type="button" class="primary-button" data-action="save-cloud-api-key">Enregistrer la clé</button>
          <button type="button" class="ghost-button" data-action="clear-cloud-api-key">Supprimer</button>
        </div>
      </div>
      ${SETTINGS_AI_AUTOSAVE_HINT}
    </div>`;
}

function countEnabledInGroup(groupIndex: number, ai: AppPrefsAi): { on: number; total: number } {
  const group = getAiFeatureToggleGroups()[groupIndex];
  if (!group) return { on: 0, total: 0 };
  let on = 0;
  for (const item of group.items) {
    if (isAiFeatureEnabled(ai, item.key)) on++;
  }
  return { on, total: group.items.length };
}

function renderAiFeatureGroupToggles(groupIndex: number, deps: SettingsAiPanelDeps): string {
  const group = getAiFeatureToggleGroups()[groupIndex];
  if (!group) return "";
  const { ai, escapeHtml, escapeAttr } = deps;
  return `
    <fieldset class="settings-ai-features-group ai-feature-group">
      <legend class="ai-feature-group__title">${escapeHtml(group.title)}</legend>
      <div class="ai-feature-group__items">
        ${group.items
          .map(
            (item) => `
          <label class="settings-form-check ai-feature-toggle">
            <input type="checkbox" data-ai-feature="${escapeAttr(item.key)}" ${ai[item.key as AiFeatureKey] ? "checked" : ""} />
            <span class="settings-form-check-text">
              <span class="settings-form-check-title">${escapeHtml(item.label)}</span>
              <span class="dim settings-ai-feature-desc">${escapeHtml(item.description)}</span>
            </span>
          </label>`
          )
          .join("")}
      </div>
    </fieldset>`;
}

function renderFeaturesCommonBody(deps: SettingsAiPanelDeps): string {
  const { ai, escapeAttr } = deps;
  return `
    <p class="settings-explain settings-explain--lead">
      Seuil de synthèse automatique et raccourcis pour activer ou désactiver toutes les fonctionnalités IA d’un coup.
    </p>
    <div class="settings-ai-subsection settings-ai-subsection--footer">
      <h4 class="settings-ai-subsection__title">Synthèse automatique</h4>
      <div class="settings-form-row settings-form-row--stack">
        <label class="compose-field-label" for="prefs-auto-thread-summary-min">Seuil synthèse auto (messages)</label>
        <input class="settings-ctl" type="number" id="prefs-auto-thread-summary-min" min="2" max="50" step="1"
          value="${escapeAttr(String(ai.autoThreadSummaryMinMessages))}" autocomplete="off" style="max-width:120px" />
      </div>
      <p class="dim settings-ai-feature-desc" style="margin:0 0 14px">
        Si « Synthèse auto à l’ouverture du fil » est activée, un résumé est lancé dès que le fil contient au moins ce nombre de messages (entre 2 et 50).
      </p>
      <div class="settings-form-footer" style="padding:0;border:none;display:flex;flex-wrap:wrap;gap:8px">
        <button type="button" class="ghost-button" data-action="ai-features-all-on">Tout activer</button>
        <button type="button" class="ghost-button" data-action="ai-features-all-off">Tout désactiver</button>
      </div>
      ${SETTINGS_AI_AUTOSAVE_HINT}
    </div>`;
}

function renderFeatureGroupBody(groupIndex: number, deps: SettingsAiPanelDeps): string {
  const group = getAiFeatureToggleGroups()[groupIndex];
  if (!group) return "";
  return `
    <p class="settings-explain settings-explain--lead">
      Active ou désactive les capacités IA de la catégorie « ${deps.escapeHtml(group.title)} ». Le panneau rapide « IA » dans la barre latérale reprend les mêmes interrupteurs.
    </p>
    ${renderAiFeatureGroupToggles(groupIndex, deps)}
    ${SETTINGS_AI_AUTOSAVE_HINT}`;
}

function renderSemanticBody(deps: SettingsAiPanelDeps): string {
  const { ai, semOk, semanticStatsBlock } = deps;
  return `
    <p class="settings-explain settings-explain--lead">
      Embeddings <strong>all-MiniLM-L6-v2</strong> (ONNX + tokenizer depuis Hugging Face) : télécharge ci-dessous (~90 Mo + tokenizer), ou place manuellement <code>model.onnx</code> et <code>tokenizer.json</code> dans le dossier modèles (barre d’état), puis lance une <strong>réindexation compte complète</strong> (messages déjà présents localement dans tous les dossiers).
    </p>
    ${semanticStatsBlock}
    <label class="settings-form-check" for="prefs-semantic-search">
      <input type="checkbox" id="prefs-semantic-search" ${ai.semanticSearchEnabled ? "checked" : ""} ${semOk ? "" : "disabled"} />
      <span class="settings-form-check-text"><span class="settings-form-check-title">Recherche hybride (mots-clés + sémantique)</span></span>
    </label>
    <p class="settings-explain settings-explain--lead">${semOk ? "Modèle détecté — combine mots-clés SQLite et similarité vectorielle sur les messages déjà indexés." : "Modèle absent — case à cocher désactivée ; téléchargez MiniLM ci-dessous puis réindexez."}</p>
    <p class="settings-explain settings-explain--lead dim">Bootstrap install : <strong>${deps.bootstrapModelsCompleted ? "terminé" : "en cours ou incomplet"}</strong> (MiniLM + Whisper léger au premier lancement). GGUF chat : activez le LLM local puis téléchargez depuis l’onglet « Sur mon PC ».</p>
    <div class="settings-form-footer" style="margin-top:10px;padding-top:0;border:none;display:flex;flex-wrap:wrap;gap:8px">
      <button type="button" class="ghost-button" data-action="refresh-semantic-embedding-counts">Actualiser les compteurs</button>
      <button type="button" class="ghost-button" data-action="prefetch-semantic-minilm">Télécharger MiniLM (HF)</button>
      <button type="button" class="ghost-button" data-action="reindex-semantic-account">Réindexer tout le compte (local SQLite)</button>
    </div>`;
}

function renderDictationBody(deps: SettingsAiPanelDeps): string {
  const { ai, escapeAttr, escapeHtml, formatWhisperPttKeyLabel } = deps;
  const backend =
    ai.dictationBackend === "cloud" ? "cloud"
    : ai.dictationBackend === "local_http" ? "local_http"
    : "whisper_cpp";
  const whisperBlock =
    backend === "whisper_cpp"
      ? `
    <hr class="settings-section-divider" />
    <div class="settings-ai-subsection">
      <h4 class="settings-ai-subsection__title">Whisper.cpp (local)</h4>
      <div class="settings-form-row">
        <label class="compose-field-label" for="prefs-whisper-cpp-lang">Langue whisper.cpp</label>
        <select class="settings-ctl settings-ctl-select" id="prefs-whisper-cpp-lang">
          <option value="auto" ${ai.whisperCppLanguage === "auto" ? "selected" : ""}>auto (détection)</option>
          <option value="fr" ${ai.whisperCppLanguage === "fr" ? "selected" : ""}>français</option>
          <option value="en" ${ai.whisperCppLanguage === "en" ? "selected" : ""}>anglais</option>
          <option value="de" ${ai.whisperCppLanguage === "de" ? "selected" : ""}>allemand</option>
          <option value="es" ${ai.whisperCppLanguage === "es" ? "selected" : ""}>espagnol</option>
          <option value="it" ${ai.whisperCppLanguage === "it" ? "selected" : ""}>italien</option>
          <option value="pt" ${ai.whisperCppLanguage === "pt" ? "selected" : ""}>portugais</option>
          <option value="nl" ${ai.whisperCppLanguage === "nl" ? "selected" : ""}>néerlandais</option>
          <option value="ru" ${ai.whisperCppLanguage === "ru" ? "selected" : ""}>russe</option>
          <option value="zh" ${ai.whisperCppLanguage === "zh" ? "selected" : ""}>chinois</option>
          <option value="ja" ${ai.whisperCppLanguage === "ja" ? "selected" : ""}>japonais</option>
          <option value="ko" ${ai.whisperCppLanguage === "ko" ? "selected" : ""}>coréen</option>
          <option value="pl" ${ai.whisperCppLanguage === "pl" ? "selected" : ""}>polonais</option>
          <option value="ar" ${ai.whisperCppLanguage === "ar" ? "selected" : ""}>arabe</option>
        </select>
      </div>
      <p class="settings-explain settings-explain--lead">
        Anglais + taille <code>tiny</code> à <code>medium</code> : fichier GGML <code>.en</code> si disponible.
      </p>
      <div class="settings-form-row">
        <label class="compose-field-label" for="prefs-neural-size">Taille du modèle Whisper</label>
        <select class="settings-ctl settings-ctl-select" id="prefs-neural-size">
          <option value="tiny" ${ai.whisperModelSize === "tiny" ? "selected" : ""}>tiny</option>
          <option value="base" ${ai.whisperModelSize === "base" ? "selected" : ""}>base</option>
          <option value="small" ${ai.whisperModelSize === "small" ? "selected" : ""}>small</option>
          <option value="medium" ${ai.whisperModelSize === "medium" ? "selected" : ""}>medium</option>
          <option value="large-v1" ${ai.whisperModelSize === "large-v1" ? "selected" : ""}>large-v1</option>
          <option value="large-v2" ${ai.whisperModelSize === "large-v2" ? "selected" : ""}>large-v2</option>
          <option value="large-v3" ${ai.whisperModelSize === "large-v3" ? "selected" : ""}>large-v3</option>
          <option value="large-v3-turbo" ${ai.whisperModelSize === "large-v3-turbo" ? "selected" : ""}>large-v3-turbo</option>
        </select>
      </div>
      <div class="settings-form-row">
        <label class="compose-field-label" for="prefs-processing-unit">Unité de calcul</label>
        <select class="settings-ctl settings-ctl-select" id="prefs-processing-unit">
          <option value="auto" ${ai.whisperProcessingUnit === "auto" ? "selected" : ""}>auto</option>
          <option value="cpu" ${ai.whisperProcessingUnit === "cpu" ? "selected" : ""}>CPU</option>
          <option value="cuda" ${ai.whisperProcessingUnit === "cuda" ? "selected" : ""}>CUDA / GPU</option>
        </select>
      </div>
      <div class="settings-form-row">
        <label class="compose-field-label" for="prefs-transcription-profile">Profil transcription</label>
        <select class="settings-ctl settings-ctl-select" id="prefs-transcription-profile">
          <option value="fast" ${ai.whisperTranscriptionProfile === "fast" ? "selected" : ""}>fast</option>
          <option value="balanced" ${ai.whisperTranscriptionProfile === "balanced" ? "selected" : ""}>balanced</option>
          <option value="accurate" ${ai.whisperTranscriptionProfile === "accurate" ? "selected" : ""}>accurate</option>
        </select>
      </div>
      <div class="settings-form-row">
        <label class="compose-field-label" for="prefs-max-record-sec">Durée max enregistrement (s)</label>
        <input class="settings-ctl" type="number" id="prefs-max-record-sec" min="0" max="600" step="1" value="${escapeAttr(String(ai.whisperMaxRecordSeconds))}" autocomplete="off" />
      </div>
      <p class="settings-explain settings-explain--lead">Décompte automatique puis arrêt ; <strong>0</strong> = pas de limite.</p>
      <label class="settings-form-check" for="prefs-local-cloud-fallback" style="margin-top:8px">
        <input type="checkbox" id="prefs-local-cloud-fallback" ${ai.whisperCloudFallback ? "checked" : ""} />
        <span class="settings-form-check-text"><span class="settings-form-check-title">Repli cloud si Whisper échoue</span> (clé dans Moteurs &amp; connexion)</span>
      </label>
      <p class="settings-explain settings-explain--lead">
        Cache <code>ggerganov/whisper.cpp</code> — téléchargez le GGML pour la langue et la taille choisies.
      </p>
      <div class="settings-form-footer" style="margin-top:14px;padding-top:0;border:none;display:flex;flex-wrap:wrap;gap:8px">
        <button type="button" class="ghost-button" data-action="prefetch-whisper-models">Télécharger le modèle Whisper (HF)</button>
        <button type="button" class="ghost-button" data-action="dictation-test-mic">Tester le micro (3s)</button>
      </div>
    </div>`
      : "";
  const cloudBlock =
    backend === "cloud"
      ? `
    <hr class="settings-section-divider" />
    <div class="settings-ai-subsection">
      <h4 class="settings-ai-subsection__title">Cloud (API)</h4>
      <div class="settings-form-row">
        <label class="compose-field-label" for="prefs-openai-base">URL de base API</label>
        <input class="settings-ctl" type="url" id="prefs-openai-base" value="${escapeAttr(ai.openaiBaseUrl)}" placeholder="https://api.openai.com/v1" autocomplete="off" spellcheck="false" />
      </div>
      <div class="settings-form-row">
        <label class="compose-field-label" for="prefs-whisper-model">Modèle Whisper (API)</label>
        <input class="settings-ctl" type="text" id="prefs-whisper-model" value="${escapeAttr(ai.whisperModel)}" autocomplete="off" spellcheck="false" />
      </div>
      <div class="settings-form-duo settings-form-duo--stack">
        <div class="settings-form-duo-cell settings-form-field-stack">
          <label class="compose-field-label" for="prefs-speech-lang">Langue parlée</label>
          <input class="settings-ctl" type="text" id="prefs-speech-lang" value="${escapeAttr(ai.speechLanguage)}" placeholder="fr ou auto" autocomplete="off" spellcheck="false" />
        </div>
        <div class="settings-form-duo-cell settings-form-field-stack">
          <label class="compose-field-label" for="prefs-draft-lang">Langue du texte inséré</label>
          <input class="settings-ctl" type="text" id="prefs-draft-lang" value="${escapeAttr(ai.draftLanguage)}" placeholder="fr" autocomplete="off" spellcheck="false" />
        </div>
      </div>
      <div class="settings-form-row">
        <label class="compose-field-label" for="prefs-translate-model">Modèle traduction (si langues différentes)</label>
        <input class="settings-ctl" type="text" id="prefs-translate-model" value="${escapeAttr(ai.translateModel)}" autocomplete="off" spellcheck="false" />
      </div>
      <p class="settings-explain settings-explain--lead dim">Clé API : <strong>Moteurs &amp; connexion</strong>.</p>
    </div>`
      : "";
  const companionBlock =
    backend === "local_http"
      ? `
    <hr class="settings-section-divider" />
    <div class="settings-ai-subsection">
      <h4 class="settings-ai-subsection__title">Compagnon HTTP local</h4>
      <div class="settings-form-row">
        <label class="compose-field-label" for="prefs-local-companion">URL de base</label>
        <input class="settings-ctl" type="url" id="prefs-local-companion" value="${escapeAttr(ai.localCompanionBaseUrl)}" placeholder="http://127.0.0.1:8787/v1" autocomplete="off" spellcheck="false" />
      </div>
      <p class="settings-explain settings-explain--lead"><code>POST …/v1/audio/transcriptions</code> (compatible OpenAI).</p>
    </div>`
      : "";
  return `
    <p class="settings-explain settings-explain--lead settings-ai-led settings-ai-block-led">
      <strong>Whisper.cpp</strong> (micro local), <strong>cloud</strong> ou <strong>compagnon HTTP</strong>. Les réglages affichés suivent le moteur choisi.
    </p>
    <div class="settings-ai-subsection">
      <h4 class="settings-ai-subsection__title">Activation & raccourci</h4>
      <label class="settings-form-check" for="prefs-dictation-enabled">
        <input type="checkbox" id="prefs-dictation-enabled" ${ai.dictationEnabled ? "checked" : ""} />
        <span class="settings-form-check-text"><span class="settings-form-check-title">Activer la dictée dans le compositeur</span></span>
      </label>
      <p class="settings-explain settings-explain--lead">
        ${
          (ai.whisperPttKeyCode ?? "").trim()
            ? `Dans le compositeur : touche ou bouton micro (maintenir <strong>${escapeHtml(formatWhisperPttKeyLabel(ai.whisperPttKeyCode))}</strong>, relâcher pour transcrire).`
            : "Dans le compositeur : utiliser le bouton micro dans la zone d’édition, ou choisir une touche push‑to‑talk ci‑dessous."
        }
      </p>
      <div class="settings-form-row" style="margin-top:14px">
        <label class="compose-field-label" for="prefs-whisper-ptt-key">Touche push-to-talk</label>
        <select class="settings-ctl settings-ctl-select" id="prefs-whisper-ptt-key">
          <option value="" ${(ai.whisperPttKeyCode ?? "").trim() === "" ? "selected" : ""}>Désactivé (micro au clic)</option>
          <option value="F9" ${ai.whisperPttKeyCode === "F9" ? "selected" : ""}>F9 (recommandé)</option>
          <option value="F8" ${ai.whisperPttKeyCode === "F8" ? "selected" : ""}>F8</option>
          <option value="F10" ${ai.whisperPttKeyCode === "F10" ? "selected" : ""}>F10</option>
          <option value="F11" ${ai.whisperPttKeyCode === "F11" ? "selected" : ""}>F11</option>
          <option value="F12" ${ai.whisperPttKeyCode === "F12" ? "selected" : ""}>F12</option>
          <option value="Pause" ${ai.whisperPttKeyCode === "Pause" ? "selected" : ""}>Pause</option>
          <option value="ScrollLock" ${ai.whisperPttKeyCode === "ScrollLock" ? "selected" : ""}>Arrêt défil.</option>
          <option value="Insert" ${ai.whisperPttKeyCode === "Insert" ? "selected" : ""}>Insertion</option>
          <option value="Backquote" ${ai.whisperPttKeyCode === "Backquote" ? "selected" : ""}>Touche sous Échap (Backquote)</option>
        </select>
      </div>
      <p class="settings-explain settings-explain--lead">
        Une seule touche maintenue ; les touches de fonction limitent les conflits pendant la frappe.
      </p>
    </div>
    <hr class="settings-section-divider" />
    <div class="settings-ai-subsection">
      <h4 class="settings-ai-subsection__title">Moteur de transcription</h4>
      <div class="settings-form-row">
        <label class="compose-field-label" for="prefs-dictation-backend">Moteur</label>
        <select class="settings-ctl settings-ctl-select" id="prefs-dictation-backend">
          <option value="whisper_cpp" ${backend === "whisper_cpp" ? "selected" : ""}>Whisper.cpp (micro local)</option>
          <option value="cloud" ${backend === "cloud" ? "selected" : ""}>Cloud (clé API)</option>
          <option value="local_http" ${backend === "local_http" ? "selected" : ""}>Compagnon HTTP local</option>
        </select>
      </div>
      <label class="settings-form-check" for="prefs-dictation-rewrite-style" style="margin-top:12px">
        <input type="checkbox" id="prefs-dictation-rewrite-style" ${ai.dictationRewriteWithStyle ? "checked" : ""} />
        <span class="settings-form-check-text"><span class="settings-form-check-title">Réécrire le segment dicté selon le style du compositeur</span> (appel LLM supplémentaire ; désactivé par défaut).</span>
      </label>
    </div>
    ${whisperBlock}
    ${cloudBlock}
    ${companionBlock}
    ${SETTINGS_AI_AUTOSAVE_HINT}`;
}

function renderLlmPrefetchProgressRow(
  llmProg: number | null,
  inFlight: boolean,
): string {
  const active = inFlight || (typeof llmProg === "number" && Number.isFinite(llmProg));
  const pct =
    typeof llmProg === "number" && Number.isFinite(llmProg) ? Math.min(100, Math.max(0, llmProg)) : 0;
  const label =
    typeof llmProg === "number" && Number.isFinite(llmProg)
      ? `Téléchargement : <strong>${pct}%</strong>`
      : "Téléchargement du modèle…";
  return `<div class="llm-prefetch-row" data-llm-prefetch-block style="margin:0 0 14px"${active ? "" : " hidden"}>
      <div class="llm-prefetch-row__head">
        <p class="dim" data-llm-prefetch-label style="margin:0;font-size:12px">${label}</p>
        <button type="button" class="ghost-button ghost-button-sm" data-action="cancel-llm-prefetch" title="Arrêter le téléchargement du modèle">Annuler</button>
      </div>
      <div class="llm-prefetch-row__track" role="progressbar" data-llm-prefetch-track aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100">
        <div data-llm-prefetch-fill style="height:100%;width:${pct}%;background:var(--accent);transition:width .2s ease"></div>
      </div>
    </div>`;
}

function renderEnginesHybridFallbackSection(ai: AppPrefsAi): string {
  return `
    <hr class="settings-section-divider" />
    <div class="settings-ai-subsection">
      <h4 class="settings-ai-subsection__title">Priorité hybride</h4>
      <label class="settings-form-check" for="prefs-ai-cloud-fallback">
        <input type="checkbox" id="prefs-ai-cloud-fallback" ${ai.aiCloudLlmFallback ? "checked" : ""} />
        <span class="settings-form-check-text"><span class="settings-form-check-title">Repli cloud si llama-server échoue</span> <span class="dim">(OpenRouter utilisé seulement si le moteur local ne démarre pas)</span></span>
      </label>
    </div>`;
}

function renderEnginesOpenRouterSection(deps: SettingsAiPanelDeps): string {
  const { ai, escapeAttr } = deps;
  const current = ai.openrouterModel.trim();
  const presetOpts = OPENROUTER_MODEL_PRESETS.map(
    (p) =>
      `<option value="${escapeAttr(p.id)}" ${current === p.id ? "selected" : ""}>${p.label}</option>`,
  ).join("");
  const customSelected = current && !OPENROUTER_MODEL_PRESETS.some((p) => p.id === current);
  return `
    <div class="settings-ai-subsection">
      <h4 class="settings-ai-subsection__title">Cloud (OpenRouter)</h4>
      <label class="settings-form-check" for="prefs-openrouter-enabled" style="margin-bottom:10px">
        <input type="checkbox" id="prefs-openrouter-enabled" ${ai.openrouterEnabled ? "checked" : ""} />
        <span class="settings-form-check-text"><span class="settings-form-check-title">Activer OpenRouter</span></span>
      </label>
      <div class="settings-form-row">
        <label class="compose-field-label" for="prefs-openrouter-model-preset">Modèle</label>
        <select class="settings-ctl settings-ctl-select" id="prefs-openrouter-model-preset">
          <option value="" ${!current ? "selected" : ""}>— Choisir —</option>
          ${presetOpts}
          <option value="__custom__" ${customSelected ? "selected" : ""}>Autre identifiant…</option>
        </select>
      </div>
      <div class="settings-form-row" style="margin-top:8px">
        <label class="compose-field-label" for="prefs-openrouter-model">Identifiant modèle</label>
        <input class="settings-ctl" type="text" id="prefs-openrouter-model" value="${escapeAttr(ai.openrouterModel)}" placeholder="openai/gpt-4o-mini" autocomplete="off" spellcheck="false" />
      </div>
      <p class="settings-form-field-hint dim">
        <a href="https://openrouter.ai/models" target="_blank" rel="noopener noreferrer">Liste des modèles OpenRouter ↗</a>
      </p>
      <div class="settings-form-row" style="margin-top:10px">
        <label class="compose-field-label" for="prefs-openrouter-base-url">URL API</label>
        <input class="settings-ctl" type="url" id="prefs-openrouter-base-url" value="${escapeAttr(ai.openrouterBaseUrl)}" placeholder="https://openrouter.ai/api/v1" autocomplete="off" spellcheck="false" />
      </div>
    </div>`;
}

function renderEnginesLlamaSection(deps: SettingsAiPanelDeps): string {
  const { ai, escapeAttr, llamaServerApiKeySet } = deps;
  const binaryPlaceholder = ai.llamaServerBinaryPath.trim() || "llama-server";
  return `
    <div class="settings-ai-subsection">
      <h4 class="settings-ai-subsection__title">Sur votre PC (llama-server)</h4>
      <label class="settings-form-check" for="prefs-llama-server-enabled" style="margin-bottom:10px">
        <input type="checkbox" id="prefs-llama-server-enabled" ${ai.llamaServerEnabled ? "checked" : ""} />
        <span class="settings-form-check-text"><span class="settings-form-check-title">Activer llama-server</span></span>
      </label>
      <label class="settings-form-check" for="prefs-llama-server-spawn-enabled" style="margin-bottom:10px">
        <input type="checkbox" id="prefs-llama-server-spawn-enabled" ${ai.llamaServerSpawnEnabled ? "checked" : ""} />
        <span class="settings-form-check-text"><span class="settings-form-check-title">Lancer llama-server depuis RustyMail</span></span>
      </label>
      <div class="settings-form-row">
        <label class="compose-field-label" for="prefs-llama-server-binary-path">Commande llama-server</label>
        <input class="settings-ctl" type="text" id="prefs-llama-server-binary-path" value="${escapeAttr(ai.llamaServerBinaryPath)}" placeholder="${escapeAttr(binaryPlaceholder)}" autocomplete="off" spellcheck="false" />
      </div>
      <div class="settings-form-footer" style="margin:8px 0;padding:0;border:none;display:flex;flex-wrap:wrap;gap:8px">
        <button type="button" class="ghost-button" data-action="pick-llama-server-binary-path">Parcourir…</button>
        <button type="button" class="ghost-button" data-action="llama-server-winget-install">Installer via winget</button>
      </div>
      <div class="settings-form-row">
        <label class="compose-field-label" for="prefs-llama-server-base-url">URL API</label>
        <input class="settings-ctl" type="url" id="prefs-llama-server-base-url" value="${escapeAttr(ai.llamaServerBaseUrl)}" placeholder="http://127.0.0.1:8080/v1" autocomplete="off" spellcheck="false" />
      </div>
      <div class="settings-form-row" style="margin-top:8px">
        <label class="compose-field-label" for="prefs-llama-server-model">Modèle côté serveur</label>
        <input class="settings-ctl" type="text" id="prefs-llama-server-model" value="${escapeAttr(ai.llamaServerModel)}" placeholder="Vide si lancement auto" autocomplete="off" spellcheck="false" />
      </div>
      ${renderContextSizeSlider(ai, escapeAttr)}
      <label class="settings-form-check" for="prefs-llama-server-cpu-override" style="margin-top:10px">
        <input type="checkbox" id="prefs-llama-server-cpu-override" ${ai.llamaServerAllowCpuOverride ? "checked" : ""} />
        <span class="settings-form-check-text"><span class="settings-form-check-title">Autoriser llama-server sans GPU détecté</span></span>
      </label>
      <details class="settings-ai-advanced-inline" style="margin-top:12px">
        <summary class="dim" style="cursor:pointer">Clé Bearer optionnelle (serveur local)</summary>
        <p class="dim" style="margin:8px 0;font-size:12px">${llamaServerApiKeySet ? "Clé enregistrée." : "Aucune clé."}</p>
        <div class="settings-inline-key-row">
          <input class="settings-ctl" type="password" id="prefs-llama-server-api-key" placeholder="Bearer optionnel" autocomplete="new-password" spellcheck="false" />
          <div class="settings-inline-key-row__actions">
            <button type="button" class="primary-button" data-action="save-llama-server-api-key">Enregistrer</button>
            <button type="button" class="ghost-button" data-action="clear-llama-server-api-key">Supprimer</button>
          </div>
        </div>
      </details>
    </div>`;
}

function renderEnginesLocalModelSection(deps: SettingsAiPanelDeps): string {
  const { ai, escapeAttr, escapeHtml, llmPrefetchPercent, llmPrefetchInFlight } = deps;
  const matchPreset = LOCAL_GGUF_PRESETS.find(
    (p) => p.repo === ai.localLlmHfRepoId.trim() && p.file === ai.localLlmGgufFile.trim(),
  );
  const presetOpts = LOCAL_GGUF_PRESETS.map(
    (p) =>
      `<option value="${escapeAttr(`${p.repo}|${p.file}`)}" ${matchPreset === p ? "selected" : ""}>${escapeHtml(p.label)}</option>`,
  ).join("");
  return `
    <div class="settings-ai-subsection">
      <h4 class="settings-ai-subsection__title">Modèle sur le disque (.gguf)</h4>
      ${
        llmPrefetchInFlight || (typeof llmPrefetchPercent === "number" && Number.isFinite(llmPrefetchPercent))
          ? renderLlmPrefetchProgressRow(llmPrefetchPercent, llmPrefetchInFlight)
          : ""
      }
      <div class="settings-form-row">
        <label class="compose-field-label" for="prefs-local-gguf-preset">Modèle prédéfini</label>
        <select class="settings-ctl settings-ctl-select" id="prefs-local-gguf-preset">
          <option value="" ${!matchPreset ? "selected" : ""}>— Choisir —</option>
          ${presetOpts}
          <option value="__custom__" ${!matchPreset && (ai.localLlmHfRepoId.trim() || ai.localLlmGgufFile.trim()) ? "selected" : ""}>Personnalisé…</option>
        </select>
      </div>
      <div class="settings-form-duo settings-form-duo--stack" style="margin-top:10px">
        <div class="settings-form-duo-cell settings-form-field-stack">
          <label class="compose-field-label" for="prefs-local-llm-repo">Dépôt Hugging Face</label>
          <input class="settings-ctl" type="text" id="prefs-local-llm-repo" value="${escapeAttr(ai.localLlmHfRepoId)}" placeholder="Organisation/nom-modèle-GGUF" autocomplete="off" spellcheck="false" />
        </div>
        <div class="settings-form-duo-cell settings-form-field-stack">
          <label class="compose-field-label" for="prefs-local-llm-file">Fichier .gguf</label>
          <input class="settings-ctl" type="text" id="prefs-local-llm-file" value="${escapeAttr(ai.localLlmGgufFile)}" placeholder="modele-q4_k_m.gguf" autocomplete="off" spellcheck="false" />
        </div>
      </div>
      <input type="hidden" id="prefs-local-llm-rev" value="${escapeAttr(ai.localLlmHfRevision || "main")}" />
      <input type="hidden" id="prefs-local-llm-enabled" value="true" />
      <div class="settings-form-footer" style="margin-top:14px;padding:0;border:none;display:flex;flex-wrap:wrap;gap:8px;align-items:center">
        <button type="button" class="primary-button" data-action="llm-setup-recommended">Configurer recommandé</button>
        <button type="button" class="ghost-button" data-action="prefetch-llm-model">Télécharger le modèle</button>
      </div>
    </div>`;
}

function renderEnginesBody(deps: SettingsAiPanelDeps): string {
  const { ai, escapeHtml, isTauri, engineSettingsTab, llmRuntimeStatus: ls } = deps;
  const showCloud = engineSettingsTab === "cloud" || engineSettingsTab === "hybrid";
  const showLocal = engineSettingsTab === "local" || engineSettingsTab === "hybrid";
  const cloudSections = showCloud
    ? `
    <hr class="settings-section-divider" />
    ${renderUnifiedCloudKeySection(deps)}
    <hr class="settings-section-divider" />
    ${renderEnginesOpenRouterSection(deps)}`
    : "";
  const hybridSection = engineSettingsTab === "hybrid" ? renderEnginesHybridFallbackSection(ai) : "";
  const localSections = showLocal
    ? `
    <hr class="settings-section-divider" />
    ${renderEnginesLlamaSection(deps)}
    ${renderEnginesLocalModelSection(deps)}`
    : "";
  return `
    ${renderEngineModePicker(engineSettingsTab)}
    ${cloudSections}
    ${hybridSection}
    ${localSections}
    ${SETTINGS_AI_AUTOSAVE_HINT}
    ${
      !isTauri
        ? `<p class="settings-explain settings-explain--lead">Statut LLM : app desktop uniquement.</p>`
        : ls
          ? `<div class="settings-semantic-stats surface-sm" style="margin:14px 0 0;padding:12px 14px;border-radius:var(--radius-lg);font-size:13px;line-height:1.55" role="status">
            <strong>Statut</strong>
            <ul style="margin:8px 0 0;padding-left:1.15em">
              <li>OpenRouter : <strong>${ls.openrouterEnabled ? "activé" : "désactivé"}</strong>${ls.openrouterEnabled ? ` · modèle <code>${escapeHtml(ls.openrouterModel)}</code>` : ""}${ls.openrouterApiKeySet ? "" : ' · <span class="dim">clé manquante</span>'}</li>
              <li>llama-server : <strong>${ls.llamaServerEnabled ? "activé" : "désactivé"}</strong>${ls.llamaServerEnabled ? ` · <code style="word-break:break-all">${escapeHtml(ls.llamaServerBaseUrl)}</code>` : ""}</li>
              <li>Fichier modèle : <strong>${ls.modelFilePresent ? "présent" : "absent"}</strong>${ls.expectedPathDisplay ? ` · <code style="word-break:break-all;font-size:12px">${escapeHtml(ls.expectedPathDisplay)}</code>` : ""}</li>
              <li>Fonctions IA : <strong>${ls.llmGateOpen ? "disponibles" : "indisponibles"}</strong></li>
            </ul>
          </div>`
          : `<p class="settings-explain settings-explain--lead dim" style="margin-top:12px">Statut inconnu — utilisez <strong>Configurer recommandé</strong>.</p>`
    }`;
}

function renderBackgroundBody(deps: SettingsAiPanelDeps): string {
  const { ai } = deps;
  return `
    <p class="settings-explain settings-explain--lead">
      Ces options sont enregistrées dans <code>app_prefs.json</code> et pilotent un comportement réel quand l’app Tauri est utilisée.
    </p>
    <label class="settings-form-check" for="prefs-bg-auto-semantic" style="margin-bottom:10px">
      <input type="checkbox" id="prefs-bg-auto-semantic" ${ai.aiBackgroundAutoSemanticIndex ? "checked" : ""} />
      <span class="settings-form-check-text"><span class="settings-form-check-title">Indexation sémantique automatique après sync</span> <span class="dim">(dossier courant · MiniLM si modèle présent)</span></span>
    </label>
    <label class="settings-form-check" for="prefs-bg-llm-prefetch" style="margin-bottom:10px">
      <input type="checkbox" id="prefs-bg-llm-prefetch" ${ai.aiBackgroundLlmPrefetch ? "checked" : ""} />
      <span class="settings-form-check-text"><span class="settings-form-check-title">Pré‑téléchargement / warmup LLM au démarrage</span> <span class="dim">(GGUF Hugging Face · discret ; second essai ~45s après le lancement si LLM local ou cette option)</span></span>
    </label>
    <label class="settings-form-check" for="prefs-bg-idle-ai-cache" style="margin-bottom:10px">
      <input type="checkbox" id="prefs-bg-idle-ai-cache" ${ai.aiBackgroundIdleLlmCachePrefetch ? "checked" : ""} />
      <span class="settings-form-check-text"><span class="settings-form-check-title">Cache IA en période calme (liste)</span> <span class="dim">(après chargement du dossier : synthèses et traductions de fil vers SQLite pour les conversations visibles — sans ouvrir le panneau IA ; requiert moteur prêt)</span></span>
    </label>
    <label class="settings-form-check" for="prefs-ai-cloud-fallback">
      <input type="checkbox" id="prefs-ai-cloud-fallback" ${ai.aiCloudLlmFallback ? "checked" : ""} />
      <span class="settings-form-check-text"><span class="settings-form-check-title">Repli cloud si le LLM local ne démarre pas</span> <span class="dim">(OpenRouter utilisé seulement si les deux moteurs sont configurés et que llama-server échoue à l’initialisation)</span></span>
    </label>
    <p class="dim settings-ai-autosave-hint" style="margin-top:12px">Le mode <strong>Hybride</strong> se règle aussi dans <strong>Moteurs &amp; connexion</strong>.</p>
    ${SETTINGS_AI_AUTOSAVE_HINT}`;
}

function hubRow(modalId: SettingsAiModalId, title: string, meta: string): string {
  return `
    <button type="button" class="settings-ai-hub-row" data-action="open-settings-ai-modal" data-ai-modal="${modalId}">
      <span class="settings-ai-hub-row__main">
        <span class="settings-ai-hub-row__title">${title}</span>
        <span class="settings-ai-hub-row__meta dim">${meta}</span>
      </span>
      <span class="settings-ai-hub-row__chev" aria-hidden="true">›</span>
    </button>`;
}

export function renderSettingsAiHub(deps: SettingsAiPanelDeps): string {
  const { ai, escapeHtml, llmRuntimeStatus: ls, semOk } = deps;
  const featureRows = getAiFeatureToggleGroups().map((group, idx) => {
    const { on, total } = countEnabledInGroup(idx, ai);
    const modalId = `features-${idx}` as SettingsAiModalId;
    return hubRow(modalId, escapeHtml(group.title), `${on}/${total} activée${on !== 1 ? "s" : ""}`);
  }).join("");
  const bgOn = [
    ai.aiBackgroundAutoSemanticIndex,
    ai.aiBackgroundLlmPrefetch,
    ai.aiBackgroundIdleLlmCachePrefetch,
    ai.aiCloudLlmFallback,
  ].filter(Boolean).length;
  const dictBackend =
    ai.dictationBackend === "cloud" ? "cloud"
    : ai.dictationBackend === "local_http" ? "local_http"
    : "whisper_cpp";
  const dictationMeta =
    ai.dictationEnabled ?
      dictBackend === "whisper_cpp" ? "Whisper.cpp"
      : dictBackend === "cloud" ? "Cloud"
      : "Compagnon HTTP"
    : "Désactivée";
  const semanticMeta =
    semOk ?
      ai.semanticSearchEnabled ? "Hybride activée" : "Hybride désactivée"
    : "Modèle absent";
  const llmMeta =
    ls?.llmGateOpen ? "Moteur prêt"
    : ai.openrouterEnabled || ai.llamaServerEnabled ? "Configuration incomplète"
    : "Non configuré";
  return `
    <div class="settings-ai-hub">
      <p class="settings-explain settings-explain--lead">
        <strong>Fonctionnalités</strong> (ce que l’IA fait) et <strong>moteurs</strong> (comment elle tourne : PC, cloud, hybride) sont séparés. Ouvrez une ligne pour régler une catégorie.
      </p>
      <h3 class="thread-kicker settings-form-kicker settings-ai-block-heading">Moteurs</h3>
      ${hubRow("engines", "Moteurs &amp; connexion", llmMeta)}
      <h3 class="thread-kicker settings-form-kicker settings-ai-block-heading" style="margin-top:18px">Fonctionnalités</h3>
      ${featureRows}
      ${hubRow("features-common", "Options communes", `Seuil auto : ${ai.autoThreadSummaryMinMessages} msg.`)}
      <h3 class="thread-kicker settings-form-kicker settings-ai-block-heading" style="margin-top:18px">Autres moteurs</h3>
      ${hubRow("dictation", "Dictée", dictationMeta)}
      ${hubRow("semantic", "Recherche locale", semanticMeta)}
      ${hubRow("background", escapeHtml(t("settings.ai.tabBackground")), `${bgOn}/4`)}
      ${hubRow("prompts", escapeHtml(t("settings.ai.tabPrompts")), escapeHtml(t("settings.ai.promptsReadOnly")))}
    </div>`;
}

export function renderPromptsModalBody(
  deps: SettingsAiPanelDeps,
  catalog: PromptCatalogItem[] | null,
  loadError: string,
  outputLanguage: string,
): string {
  return renderPromptsSettingsBody(deps, catalog, loadError, outputLanguage);
}

export function renderSettingsAiModalShell(
  modalId: SettingsAiModalId,
  title: string,
  bodyHtml: string,
  deps: SettingsAiPanelDeps
): string {
  return `
    <div class="modal-backdrop settings-ai-modal-backdrop" data-action="close-settings-ai-modal">
      <div class="modal surface-elevated settings-ai-modal modal-shell-stop-prop" role="dialog" aria-modal="true" aria-labelledby="settings-ai-modal-title-${modalId}">
        <div class="modal-header">
          <strong id="settings-ai-modal-title-${modalId}">${title}</strong>
          <button type="button" class="icon-pill" data-action="close-settings-ai-modal" aria-label="Fermer">${deps.iconSvg("close")}</button>
        </div>
        <div class="modal-body settings-ai-modal-body">
          ${bodyHtml}
        </div>
        <div class="modal-footer">
          <button type="button" class="ghost-button" data-action="close-settings-ai-modal">Fermer</button>
        </div>
      </div>
    </div>`;
}

export function renderSettingsAiModalBody(modalId: SettingsAiModalId, deps: SettingsAiPanelDeps): string {
  if (modalId === "features-common") return renderFeaturesCommonBody(deps);
  if (modalId.startsWith("features-")) {
    const idx = Number.parseInt(modalId.replace("features-", ""), 10);
    if (Number.isFinite(idx)) return renderFeatureGroupBody(idx, deps);
  }
  switch (modalId) {
    case "dictation":
      return renderDictationBody(deps);
    case "semantic":
      return renderSemanticBody(deps);
    case "engines":
    case "llm":
      return renderEnginesBody(deps);
    case "background":
      return renderBackgroundBody(deps);
    case "prompts":
      return "";
    default:
      return "";
  }
}

export function renderSettingsAiModalBodyWithPrompts(
  modalId: SettingsAiModalId,
  deps: SettingsAiPanelDeps,
  promptsCatalog: PromptCatalogItem[] | null,
  promptsLoadError: string,
  outputLanguage: string,
): string {
  if (modalId === "prompts") {
    return renderPromptsModalBody(deps, promptsCatalog, promptsLoadError, outputLanguage);
  }
  return renderSettingsAiModalBody(modalId, deps);
}
