export type InboxListFilter = "all" | "unread" | "starred" | "focused" | "auto";

export type OrgKeywordRule = {
  label: string;
  keywords: string[];
  targetMailbox?: string | null;
};

export type AppPrefsGeneral = {
  motherLanguage: string;
  /** Dialog d’accueil minimal fermé. */
  firstRunDismissed?: boolean;
  /** MiniLM + Whisper bootstrap effectués. */
  bootstrapModelsCompleted?: boolean;
  addressBookGlobalScope?: boolean;
  /** Filtre liste boîte par défaut (puces Tout / Non lus / …). */
  defaultListFilter?: InboxListFilter;
  /** Compte IMAP sélectionné au démarrage de l’app (id SQLite). */
  defaultAccountId?: string;
  /** `flat` ou `hierarchical` */
  archiveLayout?: string;
  archiveRoot?: string;
  orgKeywordRules?: OrgKeywordRule[];
  /** Suggestions de vues basées sur l'activité locale (on-device). */
  activitySuggestionsEnabled?: boolean;
};

export type AppPrefsAi = {
  dictationEnabled: boolean;
  dictationBackend: "whisper_cpp" | "cloud" | "local_http";
  openaiBaseUrl: string;
  localCompanionBaseUrl: string;
  whisperModel: string;
  translateModel: string;
  speechLanguage: string;
  draftLanguage: string;
  whisperHfRepoId: string;
  whisperHfRevision: string;
  /** Langue pour whisper.cpp uniquement (`auto`, `fr`, `en`, …). */
  whisperCppLanguage: string;
  whisperModelSize: string;
  whisperProcessingUnit: string;
  whisperTranscriptionProfile: string;
  whisperMaxRecordSeconds: number;
  whisperCloudFallback: boolean;
  /** Après dictée : réécrire uniquement le segment dicté via LLM (style = ton du compositeur). Coût / latence en plus. */
  dictationRewriteWithStyle: boolean;
  /** Code `KeyboardEvent.code` pour maintenir = enregistrer (ex. `F9`). Vide = désactivé. */
  whisperPttKeyCode: string;
  /** Recherche hybride (lexical + MiniLM) si le modèle ONNX est présent. */
  semanticSearchEnabled: boolean;

  localLlmEnabled: boolean;
  /** Dépôt HF du GGUF (serde `localLlmHfRepoId`). */
  localLlmHfRepoId: string;
  localLlmHfRevision: string;
  localLlmGgufFile: string;
  localLlmContextSize: number;
  localLlmGpuPreferred: boolean;
  /** Inférence via OpenRouter ; la clé API est dans le trousseau OS, pas dans les prefs. */
  openrouterEnabled: boolean;
  openrouterBaseUrl: string;
  openrouterModel: string;
  llamaServerEnabled: boolean;
  llamaServerBaseUrl: string;
  llamaServerModel: string;
  llamaServerAllowCpuOverride: boolean;
  /** Lance llama-server.exe avec le GGUF du cache (loopback uniquement). */
  llamaServerSpawnEnabled: boolean;
  /** `llama-server` (PATH winget) ou chemin absolu vers l’exe. */
  llamaServerBinaryPath: string;
  aiPanelWidthPx: number;
  /** Disposition fil : seule la lecture type document est prise en charge. */
  threadLayout: "reading";
  aiBackgroundAutoSemanticIndex: boolean;
  aiBackgroundLlmPrefetch: boolean;
  /** Quand l’interface est au calme : remplir le cache local (synthèses / traductions de fil) pour les conversations visibles en liste. */
  aiBackgroundIdleLlmCachePrefetch: boolean;
  aiCloudLlmFallback: boolean;

  featureThreadSummaryEnabled: boolean;
  featureThreadTranslateEnabled: boolean;
  featureMessageTranslateEnabled: boolean;
  featureComposeRewriteEnabled: boolean;
  featureComposeGrammarEnabled: boolean;
  featureQuickReplyThreadEnabled: boolean;
  featureQuickReplyComposeEnabled: boolean;
  featureInboxDigestEnabled: boolean;
  featureSearchNlEnabled: boolean;
  featureThreadQaEnabled: boolean;
  featureSecurityLlmEnabled: boolean;
  featureAddressAutocompleteEnabled: boolean;
  featureAutoThreadSummaryEnabled: boolean;
  featureAgentPrepareReplyEnabled: boolean;
  featureContactProfileEnabled: boolean;
  featureOrgProposalsEnabled: boolean;
  autoThreadSummaryMinMessages: number;
};

export type AppPrefs = {
  version: number;
  general: AppPrefsGeneral;
  ai: AppPrefsAi;
};

/** Valeurs persistées connues (`KeyboardEvent.code`). Autre valeur → défaut pour éviter collisions accidentelles avec la frappe. */
export const WHISPER_PTT_KEY_CODES = ["", "F8", "F9", "F10", "F11", "F12", "Pause", "ScrollLock", "Insert", "Backquote"] as const;

export function defaultAppPrefs(): AppPrefs {
  return {
    version: 1,
    general: {
      motherLanguage: "fr",
      firstRunDismissed: false,
      bootstrapModelsCompleted: false,
      addressBookGlobalScope: false,
      defaultListFilter: "all",
      archiveLayout: "hierarchical",
      archiveRoot: "Archive",
      orgKeywordRules: [],
      activitySuggestionsEnabled: true,
    },
    ai: {
      dictationEnabled: false,
      dictationBackend: "whisper_cpp",
      openaiBaseUrl: "https://api.openai.com/v1",
      localCompanionBaseUrl: "",
      whisperModel: "whisper-1",
      translateModel: "gpt-4o-mini",
      speechLanguage: "fr",
      draftLanguage: "fr",
      whisperHfRepoId: "ggerganov/whisper.cpp",
      whisperHfRevision: "main",
      whisperCppLanguage: "fr",
      whisperModelSize: "base",
      whisperProcessingUnit: "auto",
      whisperTranscriptionProfile: "fast",
      whisperMaxRecordSeconds: 25,
      whisperCloudFallback: false,
      dictationRewriteWithStyle: true,
      whisperPttKeyCode: "F9",
      semanticSearchEnabled: true,
      localLlmEnabled: false,
      localLlmHfRepoId: "Qwen/Qwen2.5-3B-Instruct-GGUF",
      localLlmHfRevision: "main",
      localLlmGgufFile: "qwen2.5-3b-instruct-q4_k_m.gguf",
      localLlmContextSize: 4096,
      localLlmGpuPreferred: false,
      openrouterEnabled: false,
      openrouterBaseUrl: "https://openrouter.ai/api/v1",
      openrouterModel: "openai/gpt-4o-mini",
      llamaServerEnabled: false,
      llamaServerBaseUrl: "http://127.0.0.1:8080/v1",
      llamaServerModel: "",
      llamaServerAllowCpuOverride: false,
      llamaServerSpawnEnabled: false,
      llamaServerBinaryPath: "",
      aiPanelWidthPx: 340,
      threadLayout: "reading",
      aiBackgroundAutoSemanticIndex: false,
      aiBackgroundLlmPrefetch: false,
      aiBackgroundIdleLlmCachePrefetch: false,
      aiCloudLlmFallback: false,
      featureThreadSummaryEnabled: true,
      featureThreadTranslateEnabled: true,
      featureMessageTranslateEnabled: true,
      featureComposeRewriteEnabled: true,
      featureComposeGrammarEnabled: true,
      featureQuickReplyThreadEnabled: true,
      featureQuickReplyComposeEnabled: false,
      featureInboxDigestEnabled: true,
      featureSearchNlEnabled: true,
      featureThreadQaEnabled: false,
      featureSecurityLlmEnabled: false,
      featureAddressAutocompleteEnabled: true,
      featureAutoThreadSummaryEnabled: false,
      featureAgentPrepareReplyEnabled: false,
      featureContactProfileEnabled: false,
      featureOrgProposalsEnabled: true,
      autoThreadSummaryMinMessages: 6,
    },
  };
}

export function normalizeAiPrefsMerged(ai: AppPrefsAi): AppPrefsAi {
  const d = defaultAppPrefs().ai;
  const merged = ai as AppPrefsAi & {
    onnxCloudFallback?: boolean;
    dictationBackend?: string;
    whisperPttKeyCode?: string;
  };
  if (typeof merged.whisperCloudFallback !== "boolean" && typeof merged.onnxCloudFallback === "boolean") {
    merged.whisperCloudFallback = merged.onnxCloudFallback;
  }
  if (String(merged.dictationBackend) === "onnx" || String(merged.dictationBackend) === "demo") {
    merged.dictationBackend = "whisper_cpp";
  }
  if (
    merged.dictationBackend !== "whisper_cpp" &&
    merged.dictationBackend !== "cloud" &&
    merged.dictationBackend !== "local_http"
  ) {
    merged.dictationBackend = "whisper_cpp";
  }
  if (!merged.whisperCppLanguage?.trim()) {
    merged.whisperCppLanguage = defaultAppPrefs().ai.whisperCppLanguage;
  }
  let pttNorm: string;
  if (merged.whisperPttKeyCode === undefined || merged.whisperPttKeyCode === null) {
    pttNorm = defaultAppPrefs().ai.whisperPttKeyCode;
  } else {
    pttNorm = String(merged.whisperPttKeyCode).trim();
  }
  merged.whisperPttKeyCode = (WHISPER_PTT_KEY_CODES as readonly string[]).includes(pttNorm)
    ? pttNorm
    : defaultAppPrefs().ai.whisperPttKeyCode;
  merged.threadLayout = "reading";
  merged.localLlmHfRepoId = (merged.localLlmHfRepoId ?? d.localLlmHfRepoId).trim() || d.localLlmHfRepoId;
  merged.localLlmHfRevision = (merged.localLlmHfRevision ?? d.localLlmHfRevision).trim() || d.localLlmHfRevision;
  merged.localLlmGgufFile = (merged.localLlmGgufFile ?? d.localLlmGgufFile).trim() || d.localLlmGgufFile;
  const ctx =
    typeof merged.localLlmContextSize === "number" && Number.isFinite(merged.localLlmContextSize) ?
      Math.trunc(merged.localLlmContextSize)
    : d.localLlmContextSize;
  merged.localLlmContextSize = ctx > 0 ? Math.min(131072, ctx) : d.localLlmContextSize;
  const w =
    typeof merged.aiPanelWidthPx === "number" && Number.isFinite(merged.aiPanelWidthPx) ?
      Math.trunc(merged.aiPanelWidthPx)
    : d.aiPanelWidthPx;
  merged.aiPanelWidthPx = w >= 260 && w <= 640 ? w : d.aiPanelWidthPx;
  if (typeof merged.semanticSearchEnabled !== "boolean") {
    merged.semanticSearchEnabled = d.semanticSearchEnabled;
  }
  if (typeof merged.dictationRewriteWithStyle !== "boolean") {
    merged.dictationRewriteWithStyle = d.dictationRewriteWithStyle;
  }
  if (typeof merged.dictationEnabled !== "boolean") {
    merged.dictationEnabled = d.dictationEnabled;
  }
  if (typeof merged.aiBackgroundAutoSemanticIndex !== "boolean") {
    merged.aiBackgroundAutoSemanticIndex = d.aiBackgroundAutoSemanticIndex;
  }
  if (typeof merged.aiBackgroundLlmPrefetch !== "boolean") {
    merged.aiBackgroundLlmPrefetch = d.aiBackgroundLlmPrefetch;
  }
  if (typeof merged.aiBackgroundIdleLlmCachePrefetch !== "boolean") {
    merged.aiBackgroundIdleLlmCachePrefetch = d.aiBackgroundIdleLlmCachePrefetch;
  }
  if (typeof merged.aiCloudLlmFallback !== "boolean") {
    merged.aiCloudLlmFallback = d.aiCloudLlmFallback;
  }
  if (typeof merged.openrouterEnabled !== "boolean") {
    merged.openrouterEnabled = d.openrouterEnabled;
  }
  merged.openrouterBaseUrl = (merged.openrouterBaseUrl ?? d.openrouterBaseUrl).trim() || d.openrouterBaseUrl;
  merged.openrouterModel = (merged.openrouterModel ?? d.openrouterModel).trim() || d.openrouterModel;
  if (typeof merged.llamaServerEnabled !== "boolean") {
    merged.llamaServerEnabled = d.llamaServerEnabled;
  }
  merged.llamaServerBaseUrl =
    (merged.llamaServerBaseUrl ?? d.llamaServerBaseUrl).trim() || d.llamaServerBaseUrl;
  merged.llamaServerModel = (merged.llamaServerModel ?? d.llamaServerModel).trim();
  if (typeof merged.llamaServerAllowCpuOverride !== "boolean") {
    merged.llamaServerAllowCpuOverride = d.llamaServerAllowCpuOverride;
  }
  if (typeof merged.llamaServerSpawnEnabled !== "boolean") {
    merged.llamaServerSpawnEnabled = d.llamaServerSpawnEnabled;
  }
  merged.llamaServerBinaryPath = (merged.llamaServerBinaryPath ?? d.llamaServerBinaryPath).trim();
  for (const key of [
    "featureThreadSummaryEnabled",
    "featureThreadTranslateEnabled",
    "featureMessageTranslateEnabled",
    "featureComposeRewriteEnabled",
    "featureComposeGrammarEnabled",
    "featureQuickReplyThreadEnabled",
    "featureQuickReplyComposeEnabled",
    "featureInboxDigestEnabled",
    "featureSearchNlEnabled",
    "featureThreadQaEnabled",
    "featureSecurityLlmEnabled",
    "featureAddressAutocompleteEnabled",
    "featureAutoThreadSummaryEnabled",
    "featureOrgProposalsEnabled",
  ] as const) {
    if (typeof merged[key] !== "boolean") {
      merged[key] = d[key];
    }
  }
  const minMsg =
    typeof merged.autoThreadSummaryMinMessages === "number" && Number.isFinite(merged.autoThreadSummaryMinMessages)
      ? Math.trunc(merged.autoThreadSummaryMinMessages)
      : d.autoThreadSummaryMinMessages;
  merged.autoThreadSummaryMinMessages = minMsg >= 2 ? Math.min(minMsg, 50) : d.autoThreadSummaryMinMessages;
  return merged;
}
