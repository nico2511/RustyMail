import { invoke } from "@tauri-apps/api/core";
import { listen, TauriEvent } from "@tauri-apps/api/event";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import DOMPurify from "dompurify";
import { ipcThrottleMs, invokeAiCacheGet } from "./ipc_bridge";
import type { AppPrefs, AppPrefsAi } from "./prefs_defaults";
import {
  WHISPER_PTT_KEY_CODES,
  defaultAppPrefs,
  normalizeAiPrefsMerged,
} from "./prefs_defaults";
import { getUiLocale, localeTag, setLocale, t } from "./i18n";
import type { PromptCatalogItem } from "./promptsSettingsPanel";
import { maybeShowFirstRunWizard } from "./setupWizard";
import "./styles.css";
import { escapeAttr, escapeHtml } from "./ui/sanitize";
import {
  renderStatusBarProgressInlineHtml,
  type StatusBarProgressJob,
} from "./statusBarProgress";
import {
  accountFieldTouched,
  applyDomainPresetIfSafe,
  oauthProviderFallbackPreset,
  renderAccountFormMarkup,
  serverFieldSelectors,
  serverSidesFromDiscovery,
  serverSidesFromPreset,
  type Account,
  type DiscoverMailServersResult,
  type MailAuthKind,
  type OAuthAccountWizardPhase,
  type SecurityMode,
} from "./accountSetup";
import { attachAtAutocomplete } from "./atAutocomplete";
import { attachHashAutocomplete, isHashAutocompletePanelOpen, type InboxFilterHit } from "./hashAutocomplete";
import { isAtAutocompletePanelOpen } from "./atAutocomplete";
import { parseSearchBarDraft } from "./searchBarParse";
import {
  applyNlSearchQueryToState,
  extractNlSearchFallbackText,
  parsedSearchBarHasModifiers,
  hasCommittedSearchCriteria,
  hasSavableSearchCriteria,
  resetSearchStructuralState,
  searchCriteriaSnapshotsEqual,
  snapshotFromStructuralState,
  type SearchCriteriaSnapshot,
  type SearchStructuralState,
} from "./searchQueryState";
import { buildSearchQueryPayload } from "./searchQueryBuild";
import {
  applySavedSearchToState,
  buildSavedSearchUiState,
  buildSavedSearchUpsert,
} from "./savedSearchApply";
import {
  applySavedSearchCmd,
  deleteSavedSearchCmd,
  listSavedSearchesCmd,
  markSavedSearchSeenCmd,
  upsertSavedSearchCmd,
  type SavedSearchListItem,
} from "./savedSearches";
import { renderSavedSearchesSidebarHtml, renderSuggestedViewsCardHtml } from "./savedSearchView";
import {
  clearSuggestionShownKeys,
  dismissViewSuggestionCmd,
  flushActivityQueue,
  listSuggestedSavedViewsCmd,
  markSuggestionShownOnce,
  recordActivity,
  recordActivityImmediate,
  setActivityAccountId,
  setActivityRecordingEnabled,
  type SuggestedSavedView,
} from "./activity";
import {
  mountComposeRecipientChips,
  type ComposeRecipientChipsHandle,
  type ComposeRecipientField,
  type RecipientChip,
} from "./composeRecipientChips";
import {
  AI_FEATURE_TOGGLE_GROUPS,
  type AiFeatureKey,
  isAiFeatureEnabled,
  setAllAiFeatures,
} from "./aiFeatures";
import {
  applyEngineConnectionMode,
  engineConnectionMode,
  isSettingsAiModalId,
  LLM_CONTEXT_PRESETS,
  normalizeSettingsAiModalId,
  renderSettingsAiHub,
  renderSettingsAiModalBodyWithPrompts,
  renderSettingsAiModalShell,
  settingsAiModalTitle,
  type SettingsAiModalId,
  type SettingsAiPanelDeps,
} from "./settingsAiPanel";
import { captureAiPrefsFieldsFromDom, syncLlmEnginePrefsToDom } from "./aiPrefsPersist";
import {
  getAssistSkillUi,
  assistModeLabel,
  assistPhaseForSkill,
  assistSafetyFlagLabel,
  assistSkillLabel,
  assistStepLabel,
  bindAssistTelemetry,
  buildAssistPayload,
  defaultEnabledSkillIds,
  type AssistFactsSnapshot,
  type AssistRecommendation,
  type AssistResult,
  type AssistRoutingPlan,
  type AssistRunStep,
  type AssistMode,
  type AssistSkillId,
} from "./assistAgent";
import { cancelActiveLlmStreamJob, extractPartialJsonStringField, isLlmCancelledError, runLlmStreamJob } from "./llmStream";
import {
  clearContactProfile,
  getContactDetail,
  getContactsKeywordDraft,
  getContactsListQuery,
  loadContactDetail,
  loadContactProfile,
  contactsListHasMore,
  isContactsListLoading,
  loadContactsList,
  renderContactDetailPage,
  renderContactsListPage,
  setContactsKeywordDraft,
  setContactsListQuery,
} from "./contactsView";
import {
  navApplyPendingScrollRestore,
  navJumpToStackIndex,
  navRenderTrailHtml,
  navCanGoBack,
  navCanGoForward,
  navClearForward,
  navPop,
  navPopForward,
  navPush,
  navPushBackEntry,
  navPushForward,
  navQueueScrollRestore,
  navReset,
  readContactsScrollY,
  readListScrollY,
  type AppView,
  type NavSnapshot,
  type NavSettingsTab,
} from "./navigation";
import {
  defaultOrganizationState,
  optimisticOrgRemoveThreads,
  optimisticPatchOrgReport,
  orgApplyProposal,
  orgRetagAccount,
  orgScanAccount,
  formatOrgApplyImpact,
  renderOrganizationView,
  type OrgProposal,
  type OrgThreadRef,
  type OrganizationViewState,
} from "./organizationView";
import {
  defaultOrganizationV2State,
  optimisticOrgV2PatchAfterApply,
  optimisticOrgV2RemoveProposal,
  orgV2IgnoreMailbox,
  orgV2RecordDecision,
  orgV2ScanAccount,
  orgV2UnignoreMailbox,
  renderOrganizationV2View,
  type OrganizationV2ViewState,
} from "./organizationViewV2";
import {
  archiveMailboxThreads,
  defaultFolderManagerState,
  deleteMailboxWithContents,
  fetchMailboxTree,
  renderFolderManagerView,
  setMailboxLocked,
  type FolderManagerViewState,
} from "./folderManagerView";
import {
  isDescendantMailboxPath,
  loadFolderTreeExpanded,
  saveFolderTreeExpanded,
  splitMailboxSegments,
} from "./mailboxTree";

type View = AppView;

let llmQueueAbort: AbortController | null = null;

let composeChipsTo: ComposeRecipientChipsHandle | null = null;
let composeChipsCc: ComposeRecipientChipsHandle | null = null;
let composeChipsBcc: ComposeRecipientChipsHandle | null = null;
/** Saisie destinataire non validée, conservée à travers les `render()` du compositeur. */
const composeRecipientPendingInput: Partial<Record<ComposeRecipientField, string>> = {};
let atAutocompleteDetach: (() => void) | null = null;
let hashAutocompleteDetach: (() => void) | null = null;

let addressBookListQuery = "";
let addressBookEditEmail: string | null = null;
let securityLlmAugmentBusy: Record<string, boolean> = {};
const securityLlmAugmentCache: Record<string, MailSecuritySignals> = {};
const securityLlmAugmentFailed: Record<string, boolean> = {};
let autoThreadSummaryDoneFor: string | null = null;
let senderBatchSummarizeAbort: AbortController | null = null;
let senderBatchSummarizeActive = false;

/** Mode d’affichage du composer plein écran (Split = éditeur + aperçu ; Historique = éditeur + versions). */
type ComposeLayout = "split" | "write" | "preview" | "historique";
type MicState = "idle" | "recording" | "processing";
type Tone = "Professional" | "Casual" | "Assertive" | "Empathetic";
type MessageViewMode = "clean" | "original";

// Vue clean : HTML après `mail_cleaning` (`cleanedHtmlBody`) sinon texte `cleanedText`.
const ENABLE_CLEAN_MESSAGE_VIEW = true;

type Tag = {
  family: "Source" | "Kind" | "Entity" | "State";
  value: string;
};

type Entity = {
  kind: "Date" | "Person" | "Email" | "Link" | "Identifier" | "ActionItem";
  value: string;
  sourceMessageId?: string | null;
};

type SearchViewBatchJob = {
  phase: "create" | "move";
  done: number;
  total: number;
  target: string;
};

type ThreadListItem = {
  id: string;
  subject: string;
  preview: string;
  participants: string[];
  lastActivity: string;
  messageCount: number;
  unread: boolean;
  /** Suivi local (SQLite) — bouton étoile « Suivre ce fil ». */
  followed?: boolean;
  /** Suivi local ou message épinglé IMAP (filtre « mis en avant » historique). */
  pinned: boolean;
  tags: Tag[];
  /** Dossier IMAP (depuis SQLite ; optionnel en mode démo). */
  mailbox?: string;
  /** Nombre total de pièces jointes sur le fil (Tauri / JSON camelCase). */
  attachmentCount?: number;
  /** Fil détecté comme expéditeur automatique (règles newsletter). */
  isNewsletterThread?: boolean;
  /** Entrée « Sauvés » : nombre de révisions `draft_revisions` pour la session. */
  savedRevisionCount?: number;
  /** ISO création (ligne `saved_drafts`). */
  savedCreatedAt?: string;
};

type MailSecuritySeverity = "ok" | "attention" | "suspicion";
type MailSecurityFindingSeverity = "info" | "attention" | "suspicion";

type MailSecurityFindingKind = "heuristic" | "llmIntent";

type MailSecurityFinding = {
  kind?: MailSecurityFindingKind;
  code: string;
  severity: MailSecurityFindingSeverity;
  messageFr: string;
};

type TokenBudgetSnapshot = {
  nCtx?: number;
  inputTokens?: number;
  outputTokens?: number;
  truncated?: boolean;
  strategy?: string;
  itemsIn?: number;
  itemsUsed?: number;
};

type MailSecuritySignals = {
  severity: MailSecuritySeverity;
  summaryFr: string;
  findings: MailSecurityFinding[];
  llmBudget?: TokenBudgetSnapshot | null;
};

/** Réponses `llm_translate_*` — camelCase Tauri. */
type LlmTranslationResult = {
  sourceMessageId: string;
  sourceLang: string;
  targetLang: string;
  translatedText: string;
  preservedEntityIds: string[];
};

type HtmlCleaningProviderKind = "generic" | "amazon" | "deblock";

type CleanedMessageView = {
  messageId: string;
  sender: string;
  senderEmail: string;
  /** Couvert par une règle « expéditeur automatique » (domaine + locale ou *.domaine). */
  isNewsletter?: boolean;
  /** ISO 639-1 depuis la base (sync) ; absent si inconnu / `und`. */
  detectedLang?: string | null;
  receivedAt: string;
  sourceText: string;
  cleanedText: string;
  htmlBody?: string | null;
  /** HTML après nettoyage générique + plugin expéditeur (pour HTML→Markdown). */
  cleanedHtmlBody?: string | null;
  /** Présent avec une partie HTML ; hors `generic` = digest plugin (registry). */
  htmlCleaningProvider?: HtmlCleaningProviderKind | null;
  attachments: Array<{ id: string; fileName: string; mimeType: string; sizeBytes: number; kind: "Inline" | "Regular" }>;
  collapsedQuotes: string[];
  dimmedBlocks: string[];
  /** To + Cc (fusion), pour affichage du diff d’enveloppe entre messages. */
  recipients?: Array<{ name?: string | null; email: string }>;
  tags: Tag[];
  entities: Entity[];
  mailSecurity?: MailSecuritySignals | null;
};

type DiscussionThreadView = {
  id: string;
  subject: string;
  messages: CleanedMessageView[];
  tags: Tag[];
  entities: Entity[];
  /** Dernier message entrant couvert par une règle auto — masque réponses. */
  isNewsletterThread?: boolean;
  /** Aligné sur le backend ; repli si le fil n’est pas dans `state.threads`. */
  unread?: boolean;
};

type Draft = {
  id: string;
  kind: "New" | "Reply" | "Forward";
  to: Array<{ name?: string | null; email: string }>;
  cc: Array<{ name?: string | null; email: string }>;
  bcc: Array<{ name?: string | null; email: string }>;
  subject: string;
  markdownBody: string;
  sendHtml: boolean;
  inReplyTo?: string | null;
  references: string[];
  attachmentPaths: string[];
  /** Présent pour réponse / transfert depuis un fil : copie locale après envoi. */
  threadId?: string | null;
};

/** Unit separator ASCII : autorisé pour lister plusieurs chemins, absent des chemins fichier réels. */
const ATTACH_PATH_FIELD_SEP = "\u001f";

function attachmentPathsJoinedForHiddenField(paths: string[]): string {
  return paths.join(ATTACH_PATH_FIELD_SEP);
}

/** Objet envoyé tel quel au backend Rust (évite champs omis / perdus après re-render avant `invoke`). */
function draftPayloadForRust(d: Draft): Draft {
  const pathsRaw = Array.isArray(d.attachmentPaths) ? d.attachmentPaths : [];
  const attachmentPaths = Array.from(new Set(pathsRaw.map((p) => p.trim()).filter(Boolean)));
  return {
    id: d.id ?? "draft-local",
    kind: d.kind ?? "New",
    to: [...(d.to ?? [])],
    cc: [...(d.cc ?? [])],
    bcc: [...(d.bcc ?? [])],
    subject: d.subject ?? "",
    markdownBody: d.markdownBody ?? "",
    sendHtml: d.sendHtml !== false,
    inReplyTo: d.inReplyTo ?? null,
    references: [...(d.references ?? [])],
    attachmentPaths,
    threadId: d.threadId ?? null,
  };
}

type DraftPreview = {
  textPlain: string;
  html: string;
};

type DraftRevisionListItem = {
  id: string;
  createdAt: string;
};

type SavedDraftListItem = {
  id: string;
  sessionId: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  revisionCount: number;
};

type SavedDraftOpenPayload = {
  draft: Draft;
  sessionId: string;
  savedDraftId: string;
};

type DraftDiffLine = { kind: "eq" | "add" | "del"; text: string };
type DraftCompareView = "preview" | "diff";

type SummaryResult = {
  title: string;
  bullets: string[];
  sourceMessageIds: string[];
  budget?: TokenBudgetSnapshot | null;
};

type AppStatus = {
  appName: string;
  version: string;
  walEnabled: boolean;
  vaultKeyLocation: string;
  aiRuntime: string;
};

type AppPathsView = {
  dbPath: string;
  prefsPath: string;
  modelsDir: string;
  llmModelsDir: string;
};

/** Aligné sur `LlmStatusPayload` (infra) — camelCase Tauri. */
type LlmRuntimeStatus = {
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

type AppCapabilities = {
  mailCore: boolean;
  readabilityModules: boolean;
  aiModules: boolean;
  dictation: boolean;
  storage: string;
};

type MailboxFolderStatsRow = {
  mailbox: string;
  unreadCount: number;
  totalThreads: number;
};

type InboxFilterCounts = {
  all: number;
  unread: number;
  starred: number;
  focused: number;
  auto: number;
};

/** Aligné sur `SemanticEmbeddingCountsSnapshot` (infra) — invoke camelCase. */
type SemanticEmbeddingCountsSnapshot = {
  accountId: string;
  mailbox: string;
  modelId: string;
  embeddingsTotalForAccount: number;
  embeddingsInMailbox: number;
  messagesInMailboxCached: number;
};

/** Règle « expéditeur automatique » : suffixe `domain` + `localPart` exact, ou `*` = toute locale sur ce domaine. */
type NewsletterRuleRow = { domain: string; localPart: string };

/** Réponse `llm_inbox_digest` (Brief d'action) — camelCase Tauri. */
type ActionBriefEvidenceLink = {
  threadId: string;
  messageIds: string[];
  label?: string | null;
};
type ActionBriefChange = {
  id: string;
  summary: string;
  sinceLastBrief: boolean;
  evidenceLinks: ActionBriefEvidenceLink[];
};
type ActionBriefDecision = {
  rank: number;
  title: string;
  impact: string;
  optionsHint: string[];
  evidenceLinks: ActionBriefEvidenceLink[];
};
type ActionBriefRecommendedAction = {
  rank: number;
  action: string;
  suggestedOwner: string;
  suggestedDue?: string | null;
  priority: string;
  evidenceLinks: ActionBriefEvidenceLink[];
};
type ActionBriefRisk = {
  label: string;
  severity: string;
  detail: string;
  evidenceLinks: ActionBriefEvidenceLink[];
};
type ActionBriefAmbiguity = {
  question: string;
  whyItMatters: string;
  evidenceLinks: ActionBriefEvidenceLink[];
};
type ActionBriefResult = {
  accountId: string;
  mailbox: string;
  mode: string;
  changes: ActionBriefChange[];
  decisions: ActionBriefDecision[];
  recommendedActions: ActionBriefRecommendedAction[];
  risks: ActionBriefRisk[];
  ambiguities: ActionBriefAmbiguity[];
  evidenceLinks: ActionBriefEvidenceLink[];
  confidence: number;
  priorityBucket: string;
  verificationRecommended: boolean;
  executedSkills: string[];
};

type CloseComposeModal =
  | null
  | {
      subject: string;
      hasSavedRecord: boolean;
    };

type State = {
  view: View;
  accounts: Account[];
  selectedAccountId?: string;
  /** Dans Paramètres → Comptes : `new` = formulaire nouveau compte, sinon id du compte édité. */
  settingsSelectedAccountId: string;
  settingsTab:
    | "accounts"
    | "general"
    | "appearance"
    | "autoSenders"
    | "ai"
    | "addressBook"
    | "storage"
    | "shortcuts"
    | "developer";
  /** Modale de recherche globale (Ctrl+T). */
  searchModalOpen: boolean;
  /** Modale Paramètres → IA (catégorie ouverte). */
  settingsAiModal: SettingsAiModalId | null;
  /** Onglet visible dans Paramètres → Moteurs (PC / Cloud / Hybride). */
  aiEngineSettingsTab: "local" | "cloud" | "hybrid";
  promptCatalog: PromptCatalogItem[] | null;
  promptCatalogLoadError: string;
  appPrefs: AppPrefs;
  dictationApiKeySet: boolean;
  openrouterApiKeySet: boolean;
  llamaServerApiKeySet: boolean;
  oauthGoogleConfigured: boolean;
  oauthMicrosoftConfigured: boolean;
  /** Règles expéditeurs automatiques (domaine + locale), pour Paramètres + actions depuis un mail. */
  newsletterRules: NewsletterRuleRow[];
  accountMessage: string;
  /** Échec `list_accounts` au boot (les comptes peuvent encore exister dans SQLite). */
  accountsLoadError: string;
  /** Dernière erreur de chargement liste (`list_threads`) — affichée sous la barre du dossier. */
  mailListError: string;
  syncMessage: string;
  syncInProgress: boolean;
  /** Lot sync IMAP (index de batch) pour la barre de progression. */
  syncProgressBatch: { current: number; total: number } | null;
  /** Tâches longues avec progression explicite (archivage lot, corbeille, etc.). */
  statusBarJobs: StatusBarProgressJob[];
  /** Derniers chemins disque renvoyés par `app_paths` (Paramètres → Stockage). */
  lastAppPaths: AppPathsView | null;
  /** Erreur du dernier chargement des chemins (stockage). */
  settingsPathsLoadError: string;
  composeMessage: string;
  selectedMailbox: string;
  mailboxes: string[];
  mailboxUnread: Record<string, number>;
  /** Compteurs puces filtre liste (dossier courant + suivis compte). */
  inboxFilterCounts: InboxFilterCounts | null;
  mailboxTotal: Record<string, number>;
  threads: ThreadListItem[];
  threadOffset: number;
  threadPageSize: number;
  hasMoreThreads: boolean;
  selectedThread?: DiscussionThreadView;
  selectedThreadId?: string;
  /** Autorisation explicite de charger les images distantes, par message. */
  remoteImagesAllowedByMessage: Record<string, boolean>;
  /** Email du contact affiché (vue `contact`). */
  selectedContactEmail?: string;
  /** Nombre de contacts carnet (compte courant, portée préf.). */
  addressBookSidebarCount: number | null;
  /** Centre d'organisation (scan / cartes / apply). */
  organization: OrganizationViewState;
  /** Organiser V2 (file d’actions + mémoire). */
  organizationV2: OrganizationV2ViewState;
  /** Vue Dossiers personnels (arbre interactif). */
  folderManager: FolderManagerViewState;
  /** Vues de recherche enregistrées (sidebar). */
  savedSearches: SavedSearchListItem[];
  /** Suggestions de vues (activité locale). */
  suggestedSavedViews: SuggestedSavedView[];
  /** Vue pin active (surveillance / orchestration lot). */
  activeSavedSearchId: string | null;
  /** Marquage « vu » en cours (feedback UI). */
  savedSearchMarkingSeenId: string | null;
  /** Lot IMAP depuis une vue recherche (Affiner, etc.) — progression barre / sous-titre. */
  searchViewBatchJob: SearchViewBatchJob | null;
  search: string;
  /** Texte dans la barre de recherche (non appliqué tant qu’Entrée / validation). */
  searchDraft: string;
  /** Contacts `@` (un ou plusieurs, OU logique). */
  searchSenders: string[];
  /** Dossier explicite `#local:nom` (chemin IMAP résolu côté serveur). */
  searchMailboxPath: string | null;
  /** Compte cible `#compte:email` (id compte interne). */
  searchAccountOverrideId: string | null;
  /** Tags `#tag:…` / recherche NL (ET logique). */
  searchTags: Tag[];
  /** Catalogue tags distincts (autocomplétion `#`). */
  searchTagCatalog: Tag[];
  /** Règle expéditeur auto (sélection `#` dans la barre de recherche). */
  searchNewsletterRule: NewsletterRuleRow | null;
  /** Portée recherche / filtres `#` : compte entier (défaut) ou dossier courant. */
  searchScope: "account" | "mailbox";
  /** `#` / `@` appliqués depuis la barre (Entrée possible sans texte libre). */
  searchModifiersTouched: boolean;
  /** Mode recherche issu de `llm_search_nl` ; `null` = heuristique locale. */
  searchNlMode: "lexical" | "semantic" | "hybrid" | null;
  /** Filtre langue ISO 639-1 issu de `llm_search_nl`. */
  searchLanguageFilter: string | null;
  /** Libellé de l’opération LLM en cours (file unique). */
  llmJobLabel: string | null;
  aiOpen: boolean;
  /** Panneau rapide des interrupteurs IA (barre d’état). */
  aiQuickPanelOpen: boolean;
  aiOutput: string;
  /** Dérivé de `composeLayout` en mode compose : faux seulement en mode Write. */
  previewOpen: boolean;
  /** Onglet composer : Split (défaut), Write (markdown seul), Preview (HTML seul). */
  composeLayout: ComposeLayout;
  preview?: DraftPreview;
  draft?: Draft;
  /** Contenu affiché dans le textarea (placeholders pour les grosses data:image). */
  composeBody: string;
  /** Markdown complet (data URLs réelles) utilisé pour preview + envoi. */
  composeCanonicalBody: string;
  /** Session locale de rédaction, pour historiser un brouillon (snapshots) côté SQLite. */
  draftSessionId: string | null;
  /** Ligne `saved_drafts` liée au composer (créée / mise à jour par « Enregistrer »). */
  savedDraftRecordId: string | null;
  draftRevisionsLoading: boolean;
  draftRevisions: DraftRevisionListItem[];
  draftDiffRevisionId: string | null;
  draftDiffLoading: boolean;
  draftDiffLines: DraftDiffLine[];
  draftDiffView: DraftCompareView;
  draftDiffOtherBody: string;
  draftRevisionPreview: DraftPreview | null;
  /** Historique : liste des versions repliée par défaut (UX plus discrète). */
  draftVersionsListExpanded: boolean;
  micState: MicState;
  micSeconds: number;
  tone: Tone;
  status?: AppStatus;
  capabilities?: AppCapabilities;
  moveOpen: boolean;
  moveThreadId?: string;
  moveTargetMailbox: string;
  mailboxManageOpen: boolean;
  messageViewMode: MessageViewMode;
  personalFoldersOpen: boolean;
  composeAdvancedOpen: boolean;
  /** Afficher les champs Cc / Cci lorsque présents ou ouverts explicitement. */
  composeCcBccOpen: boolean;
  /** Filtre d’affichage sur l’index (style client mail). */
  listFilter: "all" | "unread" | "starred" | "focused" | "auto";
  /** Bannière panneau brief (HTML interne, cartes type RustyMail — pas de Markdown). */
  mailboxBriefBannerHtml: string;
  /** Dernier brief d’action structuré (`llm_inbox_digest`). */
  mailboxActionBrief: ActionBriefResult | null;
  /** Mode demandé au backend (`quick` | `decision` | `deep`). */
  /** `auto` : mode effectif selon fenêtre de contexte (Paramètres IA / llama-server). */
  mailboxBriefMode: "auto" | "quick" | "decision" | "deep";
  /** Clé `accountId|mailbox` si le digest correspond à la boîte courante. */
  mailboxDigestKey: string;
  /** Après un digest réussi : rafraîchir automatiquement quand la liste change (sync, recherche…). */
  mailboxDigestLive: boolean;
  /** Panneau digest visible à droite (fermable par l’utilisateur). */
  mailboxDigestPanelOpen: boolean;
  /** Requête « live » en cours (sans remplacer tout le panneau par « Génération… »). */
  mailboxDigestRefreshing: boolean;
  /** Fil pour lequel `aiOutput` / résumé zen sont valides (évite mélange entre fils). */
  aiThreadScope: string | null;
  /** Traduction LLM par message : clé `${messageId}|${lang}` → texte affiché dans la carte. */
  messageTranslations: Record<string, string>;
  /** message_id en cours de traduction (affiche un indicateur léger). */
  messageTranslationBusy: Record<string, boolean>;
  /** Suggestions réponses rapides (actions injecter / copier). */
  quickReplySuggestions: Array<{ text: string; tone: string; rationale?: string }>;
  /** Agent multi-étapes « Préparer une réponse » (fil ouvert). */
  agentSession: null | {
    threadId: string;
    accountId: string;
    assistMode: AssistMode;
    enabledSkills: AssistSkillId[];
    step: "analyzeIntent" | "extractFacts" | "clarification" | "draftReply" | "suggestSlots";
    intent?: { intent: string; toneHint: string; needsScheduling: boolean };
    facts?: AssistFactsSnapshot;
    clarificationQuestions: string[];
    confidence?: number;
    consistencyIssues: string[];
    safetyFlags: string[];
    forceDraft: boolean;
    draft: string;
    slots: string[];
    recommendations: AssistRecommendation[];
    busy: boolean;
    plan?: AssistRoutingPlan;
    offerSlotsStep: boolean;
    telemetry: AssistRunStep[];
    unlistenTelemetry?: () => void;
  };
  /** Brouillon question Q&A fil. */
  threadQaDraft: string;
  /** Réponse Q&A fil (hors streaming). */
  threadQaAnswer: { answer: string; evidenceMessageIds: string[] } | null;
  /** Texte brut pendant streaming Q&A. */
  threadQaStreamText: string;
  /** Suggestions correction orthographe / formulation LLM (compositeur). */
  composeGrammarSuggestions: Array<{ reason: string; replacement: string; original: string }> | null;
  /** Modale : citations repliées regroupées par mail / fragment « On … wrote ». */
  quoteFoldModal: null | { senderLabel: string; blocks: string[]; foldedLines: number };
  /** Bloc réponse rapide en bas du fil (lecture). */
  threadQuickReplyOpen: boolean;
  /** Modale utilitaire : tags du fil (kind, source, domaine…). */
  threadTagsModalOpen: boolean;
  /** Lightbox images (preview + thread HTML). */
  imageModal: null | { src: string; alt: string; revokeObjectUrl?: string | null };
  /** Modale : envoi découpé en plusieurs mails (pièces jointes volumineuses). */
  splitSendConfirm: SplitPlan | null;
  /** `model.onnx` + `tokenizer.json` présents sous le répertoire modèles (Tauri). */
  semanticModelAvailable: boolean;
  /** Compteurs SQLite embeddings (réglages IA) — dernier résultat de `semantic_embedding_counts`. */
  semanticEmbeddingCounts: SemanticEmbeddingCountsSnapshot | null;
  /** Synthèse `llm_status` (OpenRouter, présence GGUF optionnelle, RAM, build llama). */
  llmRuntimeStatus: LlmRuntimeStatus | null;
  /** Fichiers `.gguf` listés dans le cache `local-llm` (suggestions champ « modèle » llama-server). */
  llmCachedGgufFilenames: string[];
  /** Pourcentage 0–100 pendant `prefetch_llm_model`. */
  llmPrefetchPercent: number | null;
  /** Téléchargement GGUF lancé depuis les réglages (non bloquant). */
  llmPrefetchInFlight: boolean;
  /** Passage « idle » : écriture cache synthèse / traduction (SQLite) en arrière-plan. */
  idleAiCachePrefetchBusy: boolean;
  /** Panneau dossiers gauche masqué (largeur lecture seule au centre). */
  sidebarCollapsed: boolean;
  /** Nombre de brouillons « Sauvés » (hors IMAP) pour le compte courant. */
  savedDraftsMailboxCount: number;
  /** Arbre dossiers perso : nœuds ouverts (clé = chemin). */
  personalTreeOpen: Record<string, boolean>;
  /** Après flux OAuth : e-mail du formulaire verrouillé jusqu’à enregistrement. */
  oauthLockedEmail: string | null;
  /** Nouveau compte : `password` ou OAuth (Google / Microsoft). */
  accountFormAuthKind: MailAuthKind;
  /** Pré-remplissage identité après OAuth (survit au cycle render → capture DOM). */
  accountFormOAuthPrefill: { email: string; displayName: string } | null;
  /** Modale fermeture composer : enregistrer dans « Sauvés » ou fermer. */
  closeComposeModal: CloseComposeModal;
  /** Assistant compte : faux = champs IMAP/SMTP repliés sous « Afficher les serveurs ». */
  accountServersPanelOpen: boolean;
  /** Nouveau compte : formulaire IMAP mot de passe (sinon écran assistant OAuth). */
  accountPasswordSetupExpanded: boolean;
  /** Flux automatique post-OAuth (détection → enregistrement → sync). */
  accountOAuthWizardPhase: OAuthAccountWizardPhase;
  accountOAuthWizardMessage: string;
  accountOAuthWizardError: string | null;
  /** Dernier OAuth réussi en attente de retry wizard. */
  accountOAuthWizardRetry: { authKind: MailAuthKind; email: string; displayName: string } | null;
};

const tones: Tone[] = ["Professional", "Casual", "Assertive", "Empathetic"];

/** Libellés FR pour le style de réécriture (état `Tone` inchangé pour le backend). */
const toneLabelsFr: Record<Tone, string> = {
  Professional: "Professionnel",
  Casual: "Décontracté",
  Assertive: "Ferme",
  Empathetic: "Empathique",
};

/** Utilise le ton du compositeur comme style par défaut pour « Réécriture IA ». */
function composeRewriteStyleFromTone(): string {
  switch (state.tone) {
    case "Professional":
      return "Formal";
    case "Casual":
      return "Casual";
    case "Assertive":
      return "Assertive";
    case "Empathetic":
      return "Polite";
    default:
      return "Neutral";
  }
}

function captureAiFeatureTogglesFromDom(root: ParentNode = document): void {
  root.querySelectorAll<HTMLInputElement>("[data-ai-feature]").forEach((el) => {
    const key = el.dataset.aiFeature as AiFeatureKey | undefined;
    if (!key) return;
    state.appPrefs.ai[key] = el.checked;
  });
}

async function persistAiFeaturePrefs(): Promise<void> {
  if (!isTauriRuntime()) return;
  state.appPrefs.ai = normalizeAiPrefsMerged(state.appPrefs.ai);
  await withTimeout(invoke("set_app_prefs", { prefs: state.appPrefs }), MAIL_ACTION_TIMEOUT_MS);
}

function renderAiFeatureTogglesHtml(layout: "settings" | "compact" = "compact"): string {
  const ai = state.appPrefs.ai;
  if (layout === "settings") {
    return AI_FEATURE_TOGGLE_GROUPS.map(
      (group, idx) => `
      ${idx > 0 ? '<hr class="settings-section-divider settings-ai-features-divider" />' : ""}
      <fieldset class="settings-ai-features-group ai-feature-group">
        <legend class="ai-feature-group__title">${escapeHtml(group.title)}</legend>
        <div class="ai-feature-group__items">
          ${group.items
            .map(
              (item) => `
          <label class="settings-form-check ai-feature-toggle">
            <input type="checkbox" data-ai-feature="${escapeAttr(item.key)}" ${ai[item.key] ? "checked" : ""} />
            <span class="settings-form-check-text">
              <span class="settings-form-check-title">${escapeHtml(item.label)}</span>
              <span class="dim settings-ai-feature-desc">${escapeHtml(item.description)}</span>
            </span>
          </label>`
            )
            .join("")}
        </div>
      </fieldset>`
    ).join("");
  }
  return AI_FEATURE_TOGGLE_GROUPS.map(
    (group) => `
      <fieldset class="ai-feature-group">
        <legend class="ai-feature-group__title">${escapeHtml(group.title)}</legend>
        <div class="ai-feature-group__items">
          ${group.items
            .map(
              (item) => `
            <label class="settings-form-check ai-feature-toggle">
              <input type="checkbox" data-ai-feature="${escapeAttr(item.key)}" ${ai[item.key] ? "checked" : ""} />
              <span class="settings-form-check-text">
                <span class="settings-form-check-title">${escapeHtml(item.label)}</span>
                ${settingsExplainHtml(escapeHtml(item.description), "toggle")}
              </span>
            </label>`
            )
            .join("")}
        </div>
      </fieldset>`
  ).join("");
}

/** Réécrit uniquement le segment dicté (option préf.) ; en cas d’échec LLM renvoie le texte brut. */
async function rewriteDictatedSegmentWithTone(raw: string): Promise<string> {
  const t = raw.trim();
  if (!t || !isTauriRuntime() || state.view !== "compose") return raw;
  if (!state.appPrefs.ai.dictationRewriteWithStyle) return raw;
  if (!isAiFeatureEnabled(state.appPrefs.ai, "featureComposeRewriteEnabled")) return raw;
  try {
    const style = composeRewriteStyleFromTone();
    const res = await withTimeout(
      invoke<{ text: string }>("llm_rewrite_compose", { text: t, style }),
      LLM_INVOKE_TIMEOUT_MS
    );
    const out = (res.text ?? "").trim();
    return out.length ? out : raw;
  } catch {
    toast("Réécriture du texte dicté indisponible (porte LLM fermée ou erreur réseau) — transcription brute conservée.");
    return raw;
  }
}

const appRoot = document.querySelector<HTMLDivElement>("#app");
if (!appRoot) throw new Error("Missing #app container");
const root: HTMLDivElement = appRoot;

/** Annule les fins de recherche obsolètes quand plusieurs requêtes se chevauchent. */
let searchThreadsGeneration = 0;

let threadActivityOpen: {
  threadId: string;
  startedAt: number;
  sender?: string;
  mailbox?: string;
} | null = null;

function activityTrackingEnabled(): boolean {
  return state.appPrefs.general.activitySuggestionsEnabled !== false;
}

function syncActivityRecordingPrefs(): void {
  const acc = currentAccount()?.id?.trim() ?? null;
  setActivityAccountId(acc);
  setActivityRecordingEnabled(activityTrackingEnabled() && Boolean(acc));
}

function flushThreadActivityClosed(): void {
  if (!threadActivityOpen || !activityTrackingEnabled()) {
    threadActivityOpen = null;
    return;
  }
  const durationMs = Math.max(0, Date.now() - threadActivityOpen.startedAt);
  recordActivity({
    eventType: "thread_closed",
    threadId: threadActivityOpen.threadId,
    senderEmail: threadActivityOpen.sender ?? null,
    mailbox: threadActivityOpen.mailbox ?? null,
    durationMs,
  });
  threadActivityOpen = null;
}

function startThreadActivityOpen(threadId: string): void {
  if (!activityTrackingEnabled()) return;
  flushThreadActivityClosed();
  const row = state.threads.find((t) => String(t.id) === String(threadId));
  const sender = row?.participants[0]?.trim() || "";
  threadActivityOpen = {
    threadId: String(threadId),
    startedAt: Date.now(),
    sender: sender || undefined,
    mailbox: row?.mailbox,
  };
  recordActivity({
    eventType: "thread_opened",
    threadId: String(threadId),
    senderEmail: sender || null,
    mailbox: row?.mailbox ?? null,
  });
}

async function refreshSuggestedSavedViews(): Promise<void> {
  if (!isTauriRuntime() || !activityTrackingEnabled()) {
    state.suggestedSavedViews = [];
    clearSuggestionShownKeys();
    return;
  }
  const accountId = currentAccount()?.id?.trim();
  if (!accountId) {
    state.suggestedSavedViews = [];
    clearSuggestionShownKeys();
    return;
  }
  try {
    state.suggestedSavedViews = await listSuggestedSavedViewsCmd(accountId);
    for (const s of state.suggestedSavedViews) {
      markSuggestionShownOnce(`${accountId}:${s.senderEmail}`, () => {
        recordActivity({
          eventType: "suggestion_shown",
          senderEmail: s.senderEmail,
          metaJson: JSON.stringify({ cardKind: "saved_view" }),
        });
      });
    }
  } catch (e) {
    console.warn("list_suggested_saved_views", e);
    state.suggestedSavedViews = [];
  }
}

function recordSearchCommittedActivity(): void {
  if (!activityTrackingEnabled()) return;
  recordActivity({
    eventType: "search_committed",
    senderEmail: state.searchSenders[0] ?? null,
    metaJson: JSON.stringify({
      text: state.search.trim().slice(0, 120),
      senders: state.searchSenders,
    }),
  });
}

async function acceptSuggestedSavedView(senderEmail: string): Promise<void> {
  const accountId = currentAccount()?.id?.trim();
  if (!accountId) return;
  const item = state.suggestedSavedViews.find(
    (s) => s.senderEmail.toLowerCase() === senderEmail.trim().toLowerCase(),
  );
  if (!item) return;
  recordActivityImmediate({
    eventType: "suggestion_clicked",
    senderEmail: item.senderEmail,
    metaJson: JSON.stringify({ cardKind: "saved_view", action: "accept" }),
  });
  const query = buildSearchQueryPayload({
    search: `@${item.senderEmail}`,
    searchTags: [],
    searchSenders: [item.senderEmail],
    searchNlMode: null,
    searchLanguageFilter: null,
    accountId,
    mailbox: null,
    semanticSearchEnabled: Boolean(state.appPrefs.ai?.semanticSearchEnabled),
    semanticModelAvailable: Boolean(state.semanticModelAvailable),
  });
  const ui = buildSavedSearchUiState({
    listFilter: "all",
    searchScope: "account",
    searchNlMode: null,
    searchDraft: `@${item.senderEmail}`,
    searchNewsletterRule: null,
    searchModifiersTouched: true,
  });
  try {
    const saved = await upsertSavedSearchCmd(
      buildSavedSearchUpsert(accountId, item.suggestedName, query, ui),
    );
    await dismissViewSuggestionCmd(accountId, item.senderEmail, "accepted");
    state.activeSavedSearchId = saved.id;
    toast(`Vue « ${item.suggestedName} » enregistrée.`);
    await refreshSavedSearches(true);
    await refreshSuggestedSavedViews();
    render();
  } catch (e) {
    toast(tauriErrorMessage(e));
  }
}

async function dismissSuggestedSavedView(
  senderEmail: string,
  decision: "dismiss" | "snooze",
): Promise<void> {
  const accountId = currentAccount()?.id?.trim();
  if (!accountId) return;
  recordActivityImmediate({
    eventType: "suggestion_clicked",
    senderEmail,
    metaJson: JSON.stringify({ cardKind: "saved_view", action: decision }),
  });
  try {
    await dismissViewSuggestionCmd(accountId, senderEmail, decision);
    await refreshSuggestedSavedViews();
    render();
  } catch (e) {
    toast(tauriErrorMessage(e));
  }
}
let mailboxDigestRefreshTimer: ReturnType<typeof setTimeout> | null = null;
/** Idle (ou fallback timer) avant d’invoquer le LLM digest — évite de bloquer juste après sync / rendu. */
let mailboxDigestIdleHandle: number | null = null;
let mailboxDigestRequestGen = 0;

let idleAiCachePrefetchGen = 0;
let idleAiCachePrefetchDebounceTimer: ReturnType<typeof setTimeout> | null = null;
let idleAiCachePrefetchIdleHandle: number | null = null;
/** Annule les flux prefetch idle (`summarizeThreadCore` / `translateThreadCore` en mode cache). */
let idlePrefetchAbort: AbortController | null = null;

/** Fils retirés optimistiquement (trash/archive/move) — masqués un moment malgré un resync. */
const RECENTLY_REMOVED_THREAD_TTL_MS = 60_000;
const recentlyRemovedThreadIds = new Map<string, number>();

function markThreadsRecentlyRemoved(ids: Iterable<string>): void {
  const exp = Date.now() + RECENTLY_REMOVED_THREAD_TTL_MS;
  for (const raw of ids) {
    const id = String(raw ?? "").trim();
    if (id) recentlyRemovedThreadIds.set(id, exp);
  }
}

function clearThreadsRecentlyRemoved(ids: Iterable<string>): void {
  for (const raw of ids) {
    const id = String(raw ?? "").trim();
    if (id) recentlyRemovedThreadIds.delete(id);
  }
}

function pruneRecentlyRemovedThreads(): void {
  const now = Date.now();
  for (const [id, exp] of recentlyRemovedThreadIds) {
    if (exp <= now) recentlyRemovedThreadIds.delete(id);
  }
}

function filterRecentlyRemovedThreads(list: ThreadListItem[]): ThreadListItem[] {
  pruneRecentlyRemovedThreads();
  if (recentlyRemovedThreadIds.size === 0) return list;
  return list.filter((t) => {
    const exp = recentlyRemovedThreadIds.get(String(t.id));
    return exp === undefined || exp <= Date.now();
  });
}

/** Applique une page serveur en respectant le filet « recently removed ». */
function applyServerThreadPage(page: ThreadListItem[], append: boolean): void {
  const filtered = filterRecentlyRemovedThreads(page);
  if (append) {
    const seen = new Set(state.threads.map((t) => String(t.id)));
    state.threads = [
      ...state.threads.filter((t) => {
        const exp = recentlyRemovedThreadIds.get(String(t.id));
        return exp === undefined || exp <= Date.now();
      }),
      ...filtered.filter((t) => !seen.has(String(t.id))),
    ];
  } else {
    state.threads = filtered;
    state.threadOffset = 0;
  }
}

function cancelMailboxDigestIdleHandle(): void {
  if (mailboxDigestIdleHandle === null) return;
  if (typeof window.cancelIdleCallback === "function") {
    window.cancelIdleCallback(mailboxDigestIdleHandle);
  } else {
    window.clearTimeout(mailboxDigestIdleHandle);
  }
  mailboxDigestIdleHandle = null;
}

function cancelMailboxDigestLiveDebounce(): void {
  if (mailboxDigestRefreshTimer !== null) {
    window.clearTimeout(mailboxDigestRefreshTimer);
    mailboxDigestRefreshTimer = null;
  }
  cancelMailboxDigestIdleHandle();
}

/** `immediate` : file d’attente minimale (setTimeout 0) — ex. action utilisateur explicite. Sinon : période idle du navigateur. */
function enqueueMailboxDigestRefreshWhenIdle(immediate: boolean): void {
  if (!isMailboxDigestFeatureEnabled()) return;
  if (!state.mailboxDigestPanelOpen) return;
  cancelMailboxDigestIdleHandle();
  const run = () => {
    mailboxDigestIdleHandle = null;
    void fetchMailboxDigestRefresh();
  };
  if (immediate) {
    mailboxDigestIdleHandle = window.setTimeout(run, 0) as unknown as number;
    return;
  }
  if (typeof window.requestIdleCallback === "function") {
    mailboxDigestIdleHandle = window.requestIdleCallback(run, {
      timeout: MAILBOX_DIGEST_IDLE_CALLBACK_TIMEOUT_MS,
    });
  } else {
    mailboxDigestIdleHandle = window.setTimeout(run, 220) as unknown as number;
  }
}

function scheduleMailboxDigestRefresh(): void {
  if (!isTauriRuntime()) return;
  if (!isMailboxDigestFeatureEnabled()) return;
  if (!state.mailboxDigestPanelOpen) return;
  if (state.view !== "list") return;
  if (isSavedDraftsVirtualMailbox(state.selectedMailbox ?? "")) return;
  const accountId = currentAccount()?.id?.trim();
  const mailbox = state.selectedMailbox || "INBOX";
  if (!accountId) return;
  if (mailboxDigestRefreshTimer !== null) {
    window.clearTimeout(mailboxDigestRefreshTimer);
  }
  mailboxDigestRefreshTimer = window.setTimeout(() => {
    mailboxDigestRefreshTimer = null;
    enqueueMailboxDigestRefreshWhenIdle(false);
  }, MAILBOX_DIGEST_DEBOUNCE_MS);
}

function cancelIdleAiCachePrefetchTimersOnly(): void {
  if (idleAiCachePrefetchDebounceTimer !== null) {
    window.clearTimeout(idleAiCachePrefetchDebounceTimer);
    idleAiCachePrefetchDebounceTimer = null;
  }
  if (idleAiCachePrefetchIdleHandle !== null) {
    if (typeof window.cancelIdleCallback === "function") {
      window.cancelIdleCallback(idleAiCachePrefetchIdleHandle);
    } else {
      window.clearTimeout(idleAiCachePrefetchIdleHandle);
    }
    idleAiCachePrefetchIdleHandle = null;
  }
}

/** Invalide tout plan prefetch idle (changement de liste, de dossier, ou ouverture de fil). */
function invalidateIdleAiCachePrefetch(): void {
  idlePrefetchAbort?.abort();
  idlePrefetchAbort = null;
  idleAiCachePrefetchGen += 1;
  cancelIdleAiCachePrefetchTimersOnly();
}

function scheduleIdleAiCachePrefetch(): void {
  if (!isTauriRuntime()) return;
  if (!state.appPrefs.ai.aiBackgroundIdleLlmCachePrefetch) return;
  if (state.view !== "list") return;
  if (isSavedDraftsVirtualMailbox(state.selectedMailbox ?? "")) return;
  if (!currentAccount()?.id?.trim()) return;
  cancelIdleAiCachePrefetchTimersOnly();
  const gen = idleAiCachePrefetchGen;
  idleAiCachePrefetchDebounceTimer = window.setTimeout(() => {
    idleAiCachePrefetchDebounceTimer = null;
    if (gen !== idleAiCachePrefetchGen) return;
    const run = () => {
      idleAiCachePrefetchIdleHandle = null;
      if (gen !== idleAiCachePrefetchGen) return;
      void runIdleAiCachePrefetchPass(gen);
    };
    if (typeof window.requestIdleCallback === "function") {
      idleAiCachePrefetchIdleHandle = window.requestIdleCallback(run, {
        timeout: IDLE_AI_CACHE_IDLE_CALLBACK_TIMEOUT_MS,
      });
    } else {
      idleAiCachePrefetchIdleHandle = window.setTimeout(run, 400) as unknown as number;
    }
  }, IDLE_AI_CACHE_PREFETCH_DEBOUNCE_MS);
}

async function pickThreadIdsForIdleAiCachePrefetch(max: number): Promise<string[]> {
  const wantSum = isAiFeatureEnabled(state.appPrefs.ai, "featureThreadSummaryEnabled");
  const wantTr = isAiFeatureEnabled(state.appPrefs.ai, "featureThreadTranslateEnabled");
  if (!wantSum && !wantTr) return [];
  const seg = await aiCacheKeySegment();
  const lang = state.appPrefs.general.motherLanguage?.trim() || "fr";
  const sorted = [...state.threads].sort((a, b) => {
    const ua = a.unread ? 1 : 0;
    const ub = b.unread ? 1 : 0;
    if (ua !== ub) return ub - ua;
    return String(b.lastActivity ?? "").localeCompare(String(a.lastActivity ?? ""));
  });
  const out: string[] = [];
  for (const t of sorted) {
    if (out.length >= max) break;
    const tid = String(t.id ?? "").trim();
    if (!tid || tid.startsWith(SAVED_DRAFT_THREAD_PREFIX)) continue;
    if (threadIsAutoMail(t, tid)) continue;
    let needs = false;
    if (wantSum) {
      const ck = `summary:v2:${seg}:p${AI_CACHE_PROMPT_REVISION}:${tid}`;
      const c = await invokeAiCacheGet(ck, {
        timeoutMs: BOOT_INVOKE_TIMEOUT_MS,
        withTimeout,
      });
      if (!c?.trim()) needs = true;
    }
    if (!needs && wantTr) {
      const mother = normalizeIso639Primary(lang);
      const threadLang = langFromKindTags(t.tags ?? []);
      if (!(threadLang && threadLang === mother)) {
        const ck = `translate:v2:${seg}:p${AI_CACHE_PROMPT_REVISION}:thread:${tid}:${lang}`;
        const c = await invokeAiCacheGet(ck, {
          timeoutMs: BOOT_INVOKE_TIMEOUT_MS,
          withTimeout,
        });
        if (!c?.trim()) needs = true;
      }
    }
    if (needs) out.push(tid);
  }
  return out;
}

async function threadSummaryCacheMissingForPrefetch(threadId: string, seg: string): Promise<boolean> {
  if (!isAiFeatureEnabled(state.appPrefs.ai, "featureThreadSummaryEnabled")) return false;
  const ck = `summary:v2:${seg}:p${AI_CACHE_PROMPT_REVISION}:${threadId}`;
  const c = await invokeAiCacheGet(ck, {
    timeoutMs: BOOT_INVOKE_TIMEOUT_MS,
    withTimeout,
  });
  return !c?.trim();
}

async function threadTranslateCacheMissingForPrefetch(threadId: string, seg: string): Promise<boolean> {
  if (!isAiFeatureEnabled(state.appPrefs.ai, "featureThreadTranslateEnabled")) return false;
  const lang = state.appPrefs.general.motherLanguage?.trim() || "fr";
  const ck = `translate:v2:${seg}:p${AI_CACHE_PROMPT_REVISION}:thread:${threadId}:${lang}`;
  const c = await invokeAiCacheGet(ck, {
    timeoutMs: BOOT_INVOKE_TIMEOUT_MS,
    withTimeout,
  });
  return !c?.trim();
}

async function runIdleAiCachePrefetchPass(startGen: number): Promise<void> {
  if (startGen !== idleAiCachePrefetchGen) return;
  if (!state.appPrefs.ai.aiBackgroundIdleLlmCachePrefetch) return;
  if (!isTauriRuntime()) return;
  if (state.view !== "list") return;
  if (isSavedDraftsVirtualMailbox(state.selectedMailbox ?? "")) return;
  if (!currentAccount()?.id?.trim()) return;
  if (state.llmJobLabel) return;
  if (state.mailboxDigestRefreshing) return;
  if (state.syncInProgress) return;
  if (state.micState !== "idle") return;
  if (state.idleAiCachePrefetchBusy) return;
  await refreshLlmRuntimeStatus();
  if (startGen !== idleAiCachePrefetchGen) return;
  if (!state.llmRuntimeStatus?.llmGateOpen) return;
  const seg = await aiCacheKeySegment();
  if (startGen !== idleAiCachePrefetchGen) return;
  const candidates = await pickThreadIdsForIdleAiCachePrefetch(IDLE_AI_CACHE_PREFETCH_MAX_THREADS);
  if (!candidates.length) return;
  const ac = new AbortController();
  idlePrefetchAbort = ac;
  state.idleAiCachePrefetchBusy = true;
  render();
  try {
    for (const tid of candidates) {
      if (startGen !== idleAiCachePrefetchGen) {
        ac.abort();
        break;
      }
      if (state.llmJobLabel || state.view !== "list") break;
      if (state.mailboxDigestRefreshing || state.syncInProgress) break;
      if (await threadSummaryCacheMissingForPrefetch(tid, seg)) {
        const sum = await summarizeThreadCore(tid, ac.signal, {
          prefetchOnly: true,
          toastOnDone: false,
          toastOnCache: false,
        });
        if (sum.status === "cancelled" || startGen !== idleAiCachePrefetchGen) break;
      }
      if (startGen !== idleAiCachePrefetchGen) {
        ac.abort();
        break;
      }
      if (state.llmJobLabel || state.view !== "list") break;
      const listRow = state.threads.find((row) => String(row.id) === tid);
      const mother = normalizeIso639Primary(state.appPrefs.general.motherLanguage?.trim() || "fr");
      const threadLang = listRow ? langFromKindTags(listRow.tags ?? []) : null;
      const skipTranslatePrefetch = Boolean(threadLang && threadLang === mother);
      if (!skipTranslatePrefetch && (await threadTranslateCacheMissingForPrefetch(tid, seg))) {
        const tr = await translateThreadCore(tid, ac.signal, { prefetchOnly: true });
        if (tr.status === "cancelled" || startGen !== idleAiCachePrefetchGen) break;
      }
    }
  } catch (e) {
    console.warn("idle_ai_cache_prefetch", e);
  } finally {
    if (idlePrefetchAbort === ac) idlePrefetchAbort = null;
    state.idleAiCachePrefetchBusy = false;
    render();
  }
}

function isMailboxDigestFeatureEnabled(): boolean {
  return isAiFeatureEnabled(state.appPrefs.ai, "featureInboxDigestEnabled");
}

/** Ferme le panneau digest et annule les jobs si la préf « Brief d’action » est désactivée. */
function syncMailboxDigestPanelWithFeaturePref(): void {
  if (isMailboxDigestFeatureEnabled()) return;
  if (
    !state.mailboxDigestPanelOpen &&
    !state.mailboxDigestRefreshing &&
    !state.mailboxDigestLive &&
    !state.mailboxActionBrief &&
    !state.mailboxBriefBannerHtml.trim()
  ) {
    return;
  }
  cancelMailboxDigestLiveDebounce();
  mailboxDigestRequestGen++;
  state.mailboxDigestPanelOpen = false;
  state.mailboxDigestLive = false;
  state.mailboxDigestRefreshing = false;
  state.mailboxActionBrief = null;
  state.mailboxBriefBannerHtml = "";
}

function dismissMailboxDigestPanel(): void {
  cancelMailboxDigestLiveDebounce();
  mailboxDigestRequestGen++;
  state.mailboxDigestPanelOpen = false;
  state.mailboxDigestLive = false;
  state.mailboxDigestRefreshing = false;
  state.mailboxActionBrief = null;
  state.mailboxBriefBannerHtml = "";
  state.aiOpen = false;
  render();
}

function openMailboxDigestPanel(refresh = true): void {
  if (!isMailboxDigestFeatureEnabled()) return;
  if (!mailboxDigestPanelEligible()) return;
  state.mailboxDigestPanelOpen = true;
  render();
  if (!refresh) return;
  cancelMailboxDigestLiveDebounce();
  void enqueueMailboxDigestRefreshWhenIdle(true);
}

function buildMailboxBriefGateBannerHtml(): string {
  const hint = state.llmRuntimeStatus?.llmGateHint?.trim();
  const detail =
    hint ||
    "Activez OpenRouter (clé + modèle) ou llama-server (URL + modèle, ou lancement auto avec GGUF) dans Paramètres → IA & dictée.";
  const escaped = escapeHtml(detail);
  const inner = renderBriefMailItemCard(
    `<p class="thread-zen-par">Aucun moteur IA n’est prêt pour générer le brief.</p>
    <p class="thread-zen-par dim">${escaped}</p>
    <p class="thread-zen-par dim">Ouvrez <strong>Paramètres → IA & dictée</strong>, puis cliquez <strong>Rafraîchir</strong>.</p>`
  );
  return renderBriefMailViewShell(inner, { kicker: "Brief indisponible" });
}

function buildMailboxBriefErrorBannerHtml(detail: string): string {
  const raw = detail.replace(/\s+/g, " ").trim();
  const jsonLike =
    /json invalide|eof while parsing|expected value|trailing characters/i.test(raw);
  const text = jsonLike
    ? `La réponse du modèle était incomplète ou mal formée (souvent une limite de longueur). Essayez le mode Quick, puis Rafraîchir.`
    : raw.slice(0, 400);
  const inner = renderBriefMailItemCard(
    `<p class="thread-zen-par"><strong>Brief indisponible</strong></p>
    <p class="thread-zen-par dim">${escapeHtml(text)}</p>
    <p class="thread-zen-par dim">Cliquez <strong>Rafraîchir</strong> pour relancer.</p>`
  );
  return renderBriefMailViewShell(inner, { kicker: "Brief indisponible" });
}

async function fetchMailboxDigestRefresh(): Promise<void> {
  if (!isTauriRuntime()) return;
  if (!isAiFeatureEnabled(state.appPrefs.ai, "featureInboxDigestEnabled")) return;
  if (!state.mailboxDigestPanelOpen) return;
  if (state.view !== "list") return;
  if (isSavedDraftsVirtualMailbox(state.selectedMailbox ?? "")) return;
  const accountId = currentAccount()?.id?.trim();
  const mailbox = state.selectedMailbox || "INBOX";
  if (!accountId) return;
  const key = `${accountId}|${mailbox}`;
  const gen = ++mailboxDigestRequestGen;
  state.mailboxDigestRefreshing = true;
  state.mailboxDigestKey = key;
  state.mailboxDigestLive = true;
  render();
  if (!state.llmRuntimeStatus) {
    await refreshLlmRuntimeStatus();
  }
  if (!state.llmRuntimeStatus?.llmGateOpen) {
    if (gen !== mailboxDigestRequestGen) return;
    state.mailboxActionBrief = null;
    state.mailboxBriefBannerHtml = buildMailboxBriefGateBannerHtml();
    state.mailboxDigestKey = key;
    state.mailboxDigestRefreshing = false;
    render();
    return;
  }
  try {
    const brief = await withTimeout(
      invoke<ActionBriefResult>("llm_inbox_digest", {
        accountId,
        mailbox,
        mode: state.mailboxBriefMode,
      }),
      LLM_INVOKE_TIMEOUT_MS
    );
    if (gen !== mailboxDigestRequestGen) return;
    state.mailboxActionBrief = brief;
    state.mailboxBriefBannerHtml = "";
    state.mailboxDigestKey = key;
  } catch (error) {
    if (gen !== mailboxDigestRequestGen) return;
    const detail = tauriErrorMessage(error).replace(/\s+/g, " ").trim().slice(0, 400);
    const gateLike =
      /moteur ia/i.test(detail) ||
      /openrouter/i.test(detail) ||
      /llama-server/i.test(detail) ||
      /fonctionnalité ia est désactivée/i.test(detail);
    state.mailboxActionBrief = null;
    state.mailboxBriefBannerHtml = gateLike
      ? buildMailboxBriefGateBannerHtml()
      : buildMailboxBriefErrorBannerHtml(detail);
    state.mailboxDigestKey = key;
    console.warn("llm_inbox_digest", error);
  } finally {
    if (gen === mailboxDigestRequestGen) {
      state.mailboxDigestRefreshing = false;
      render();
    }
  }
}
/** Un second essai `prefetch_llm_model` après le boot (phase calme), si LLM local ou préf. arrière-plan. */
let llmIdlePrefetchAfterBootScheduled = false;
const SIDEBAR_COLLAPSED_STORAGE_KEY = "rustymail.sidebarCollapsed";
/** Un seul abonnement `llm_prefetch_progress` pour éviter les doublons après re-render. */
let subscribedLlmPrefetchProgress = false;
let subscribedModelBootstrapProgress = false;
/** Après clic sur une ligne « compte » : ne pas rejouer l’identité saisie sur le précédent compte avant re-render. */
let skipAccountIdentityCaptureOnce = false;
/** Détection / préréglage — appliqué au prochain render si `accountFieldTouched.serverFields` est faux. */
let discoveredServersFormSnap: { imap: Account["imap"]; smtp: Account["smtp"] } | null = null;
/** Pré-remplissage identité après capture DOM (formulaire Paramètres → Comptes). */
let accountsFormIdentityScratch: { displayName: string; email: string } | undefined;

function clearDiscoveredServerSnap() {
  discoveredServersFormSnap = null;
}

function clearAccountOAuthWizard() {
  state.accountOAuthWizardPhase = null;
  state.accountOAuthWizardMessage = "";
  state.accountOAuthWizardError = null;
  state.accountOAuthWizardRetry = null;
}

function resetNewAccountSetupState() {
  clearAccountOAuthWizard();
  state.accountPasswordSetupExpanded = false;
  state.accountFormAuthKind = "password";
  state.oauthLockedEmail = null;
  state.accountFormOAuthPrefill = null;
  state.accountServersPanelOpen = false;
}

function readSidebarCollapsedPreference(): boolean {
  try {
    return window.localStorage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

function writeSidebarCollapsedPreference(collapsed: boolean) {
  try {
    window.localStorage.setItem(SIDEBAR_COLLAPSED_STORAGE_KEY, collapsed ? "1" : "0");
  } catch {
    /* navigation privée, quota, etc. */
  }
}

const state: State = {
  view: "list",
  accounts: [],
  selectedAccountId: undefined,
  settingsSelectedAccountId: "new",
  settingsTab: "accounts",
  newsletterRules: [],
  appPrefs: defaultAppPrefs(),
  dictationApiKeySet: false,
  openrouterApiKeySet: false,
  llamaServerApiKeySet: false,
  oauthGoogleConfigured: false,
  oauthMicrosoftConfigured: false,
  accountMessage: "",
  accountsLoadError: "",
  mailListError: "",
  syncMessage: "",
  syncInProgress: false,
  syncProgressBatch: null,
  statusBarJobs: [],
  lastAppPaths: null,
  settingsPathsLoadError: "",
  composeMessage: "",
  selectedMailbox: "INBOX",
  mailboxes: [],
  mailboxUnread: {},
  inboxFilterCounts: null,
  mailboxTotal: {},
  threads: [],
  threadOffset: 0,
  threadPageSize: 50,
  hasMoreThreads: false,
  remoteImagesAllowedByMessage: {},
  addressBookSidebarCount: null,
  organization: defaultOrganizationState(),
  organizationV2: defaultOrganizationV2State(),
  folderManager: defaultFolderManagerState(),
  savedSearches: [],
  suggestedSavedViews: [],
  activeSavedSearchId: null,
  savedSearchMarkingSeenId: null,
  searchViewBatchJob: null,
  search: "",
  searchDraft: "",
  searchSenders: [],
  searchMailboxPath: null,
  searchAccountOverrideId: null,
  searchTags: [],
  searchTagCatalog: [],
  searchNewsletterRule: null,
  searchScope: "account",
  searchModifiersTouched: false,
  searchNlMode: null,
  searchLanguageFilter: null,
  searchModalOpen: false,
  settingsAiModal: null,
  aiEngineSettingsTab: "local",
  promptCatalog: null,
  promptCatalogLoadError: "",
  llmJobLabel: null,
  semanticModelAvailable: false,
  semanticEmbeddingCounts: null,
  llmRuntimeStatus: null,
  llmCachedGgufFilenames: [],
  llmPrefetchPercent: null,
  llmPrefetchInFlight: false,
  idleAiCachePrefetchBusy: false,
  aiOpen: false,
  aiQuickPanelOpen: false,
  aiOutput: "",
  previewOpen: true,
  composeLayout: "split",
  composeBody: "",
  composeCanonicalBody: "",
  draftSessionId: null,
  savedDraftRecordId: null,
  draftRevisionsLoading: false,
  draftRevisions: [],
  draftDiffRevisionId: null,
  draftDiffLoading: false,
  draftDiffLines: [],
  draftDiffView: "preview",
  draftDiffOtherBody: "",
  draftRevisionPreview: null,
  draftVersionsListExpanded: false,
  micState: "idle",
  micSeconds: 0,
  tone: "Professional",
  moveOpen: false,
  moveThreadId: undefined,
  moveTargetMailbox: "INBOX",
  mailboxManageOpen: false,
  /** `clean` = lisible quand le nettoyage apporte un contenu distinct, sinon brut par message ; `original` = tout en brut. */
  messageViewMode: "clean",
  personalFoldersOpen: false,
  composeAdvancedOpen: false,
  composeCcBccOpen: false,
  listFilter: "all",
  mailboxBriefBannerHtml: "",
  mailboxDigestKey: "",
  mailboxDigestLive: false,
  mailboxDigestPanelOpen: false,
  mailboxDigestRefreshing: false,
  mailboxActionBrief: null,
  mailboxBriefMode: "auto",
  aiThreadScope: null,
  messageTranslations: {},
  messageTranslationBusy: {},
  quickReplySuggestions: [],
  agentSession: null,
  threadQaDraft: "",
  threadQaAnswer: null,
  threadQaStreamText: "",
  composeGrammarSuggestions: null,
  quoteFoldModal: null,
  threadQuickReplyOpen: false,
  threadTagsModalOpen: false,
  imageModal: null,
  splitSendConfirm: null,
  sidebarCollapsed: readSidebarCollapsedPreference(),
  savedDraftsMailboxCount: 0,
  personalTreeOpen: {},
  closeComposeModal: null,
  accountServersPanelOpen: false,
  oauthLockedEmail: null,
  accountFormAuthKind: "password",
  accountFormOAuthPrefill: null,
  accountPasswordSetupExpanded: false,
  accountOAuthWizardPhase: null,
  accountOAuthWizardMessage: "",
  accountOAuthWizardError: null,
  accountOAuthWizardRetry: null,
};

type TextPromptModalSpec = {
  title: string;
  body?: string;
  label: string;
  defaultValue: string;
};

type ConfirmModalSpec = {
  title: string;
  body: string;
  confirmLabel?: string;
  danger?: boolean;
};

let textPromptModal: TextPromptModalSpec | null = null;
let textPromptResolver: ((value: string | null) => void) | null = null;

let confirmModal: ConfirmModalSpec | null = null;
let confirmResolver: ((ok: boolean) => void) | null = null;

function openTextPromptModal(spec: TextPromptModalSpec): Promise<string | null> {
  textPromptModal = spec;
  render();
  return new Promise((resolve) => {
    textPromptResolver = resolve;
  });
}

function finishTextPromptModal(value: string | null) {
  textPromptModal = null;
  const r = textPromptResolver;
  textPromptResolver = null;
  r?.(value);
  render();
}

function openConfirmModal(spec: ConfirmModalSpec): Promise<boolean> {
  confirmModal = spec;
  render();
  return new Promise((resolve) => {
    confirmResolver = resolve;
  });
}

function finishConfirmModal(ok: boolean) {
  confirmModal = null;
  const r = confirmResolver;
  confirmResolver = null;
  r?.(ok);
  render();
}

function renderTextPromptModal(): string {
  if (!textPromptModal) return "";
  const m = textPromptModal;
  return `
    <div class="modal-backdrop" data-action="text-prompt-cancel">
      <div class="modal surface-elevated modal-shell-stop-prop" role="dialog" aria-modal="true" aria-labelledby="text-prompt-title">
        <div class="modal-header">
          <strong id="text-prompt-title">${escapeHtml(m.title)}</strong>
          <button type="button" class="icon-pill" data-action="text-prompt-cancel" aria-label="Annuler">${iconSvg("close")}</button>
        </div>
        <div class="modal-body" style="display:grid;gap:12px">
          ${m.body ? `<p class="dim" style="margin:0;line-height:1.45">${escapeHtml(m.body)}</p>` : ""}
          <label class="settings-field" style="display:grid;gap:6px;margin:0">
            <span>${escapeHtml(m.label)}</span>
            <input id="text-prompt-input" type="text" class="field-input" value="${escapeAttr(m.defaultValue)}" autocomplete="off" />
          </label>
        </div>
        <div class="modal-footer">
          <button type="button" class="ghost-button" data-action="text-prompt-cancel">Annuler</button>
          <button type="button" class="primary-button" data-action="text-prompt-confirm">OK</button>
        </div>
      </div>
    </div>`;
}

function renderConfirmModal(): string {
  if (!confirmModal) return "";
  const m = confirmModal;
  const okLabel = m.confirmLabel?.trim() || "Confirmer";
  const okClass = m.danger ? "primary-button danger-ok" : "primary-button";
  return `
    <div class="modal-backdrop" data-action="confirm-modal-no">
      <div class="modal surface-elevated modal-shell-stop-prop" role="dialog" aria-modal="true" aria-labelledby="confirm-modal-title">
        <div class="modal-header">
          <strong id="confirm-modal-title">${escapeHtml(m.title)}</strong>
          <button type="button" class="icon-pill" data-action="confirm-modal-no" aria-label="Fermer">${iconSvg("close")}</button>
        </div>
        <div class="modal-body" style="display:grid;gap:10px">
          <p style="margin:0;line-height:1.5">${escapeHtml(m.body)}</p>
        </div>
        <div class="modal-footer">
          <button type="button" class="ghost-button" data-action="confirm-modal-no">Annuler</button>
          <button type="button" class="${okClass}" data-action="confirm-modal-yes">${escapeHtml(okLabel)}</button>
        </div>
      </div>
    </div>`;
}

async function refreshSettingsPathsFromBackend(): Promise<void> {
  if (!isTauriRuntime()) return;
  state.settingsPathsLoadError = "";
  try {
    state.lastAppPaths = await withTimeout(invoke<AppPathsView>("app_paths", {}), BOOT_INVOKE_TIMEOUT_MS);
  } catch (e) {
    state.lastAppPaths = null;
    state.settingsPathsLoadError = tauriErrorMessage(e);
  }
  render();
}

function threadMessageAnchorId(messageId: string, index: number): string {
  const raw = messageId.trim();
  const tail = raw ? encodeURIComponent(raw).replace(/%/g, "_") : "empty";
  const base = `msg-${index}-${tail}`;
  return base.length > 240 ? base.slice(0, 240) : base;
}

async function fetchOpenThreadOrNotify(
  threadId: string,
  opts?: { quiet?: boolean }
): Promise<DiscussionThreadView | null> {
  const tid = threadId.trim();
  if (!tid) return null;
  if (!isTauriRuntime()) {
    if (!opts?.quiet) toast("Ouvrir un fil : lancez l’app Tauri.");
    return null;
  }
  try {
    return await withTimeout(invoke<DiscussionThreadView>("open_thread", { threadId: tid }), BOOT_INVOKE_TIMEOUT_MS);
  } catch (error) {
    console.error("open_thread", error);
    if (!opts?.quiet) toast(`Impossible d’ouvrir le fil : ${tauriErrorMessage(error)}`);
    return null;
  }
}

function currentThreadIdForReply(): string | undefined {
  const a = state.selectedThreadId?.trim();
  if (a) return a;
  const b = state.threads[0]?.id;
  return b ? String(b) : undefined;
}

/** `previewOpen` : vrai si l’aperçu HTML est affiché ou mis à jour (Split / Preview), faux en Write. */
function syncPreviewOpenFromComposeLayout() {
  state.previewOpen = state.composeLayout !== "write";
}

function newDraftSessionId(): string {
  const anyCrypto = (globalThis as any).crypto as Crypto | undefined;
  const gen = anyCrypto?.randomUUID?.bind(anyCrypto);
  if (gen) return String(gen());
  return `ds-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function startNewDraftSession() {
  state.draftSessionId = newDraftSessionId();
  state.savedDraftRecordId = null;
  state.draftRevisionsLoading = false;
  state.draftRevisions = [];
  state.draftDiffRevisionId = null;
  state.draftDiffLoading = false;
  state.draftDiffLines = [];
  state.draftDiffView = "preview";
  state.draftDiffOtherBody = "";
  state.draftRevisionPreview = null;
  state.draftVersionsListExpanded = false;
}

function clearDraftSession() {
  state.draftSessionId = null;
  state.savedDraftRecordId = null;
  state.draftRevisionsLoading = false;
  state.draftRevisions = [];
  state.draftDiffRevisionId = null;
  state.draftDiffLoading = false;
  state.draftDiffLines = [];
  state.draftDiffView = "preview";
  state.draftDiffOtherBody = "";
  state.draftRevisionPreview = null;
  state.draftVersionsListExpanded = false;
  if (draftRevisionDebounceTimer !== null) {
    window.clearTimeout(draftRevisionDebounceTimer);
    draftRevisionDebounceTimer = null;
  }
}

function splitLines(input: string): string[] {
  return String(input ?? "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n");
}

function myersDiffLines(a: string[], b: string[]): DraftDiffLine[] {
  // Myers diff O((N+M)D), returns per-line ops.
  const n = a.length;
  const m = b.length;
  const max = n + m;
  const offset = max;
  let v = new Array<number>(2 * max + 1).fill(0);
  const trace: number[][] = [];

  for (let d = 0; d <= max; d++) {
    trace.push(v.slice());
    for (let k = -d; k <= d; k += 2) {
      const kIndex = k + offset;
      const down = k === -d || (k !== d && v[kIndex - 1] < v[kIndex + 1]);
      let x = down ? v[kIndex + 1] : v[kIndex - 1] + 1;
      let y = x - k;
      while (x < n && y < m && a[x] === b[y]) {
        x++;
        y++;
      }
      v[kIndex] = x;
      if (x >= n && y >= m) {
        // backtrack
        const out: DraftDiffLine[] = [];
        let curX = n;
        let curY = m;
        for (let curD = d; curD >= 0; curD--) {
          const prevV = trace[curD];
          const curK = curX - curY;
          const curKIndex = curK + offset;
          const prevDown =
            curK === -curD || (curK !== curD && prevV[curKIndex - 1] < prevV[curKIndex + 1]);
          const prevK = prevDown ? curK + 1 : curK - 1;
          const prevX = prevDown ? prevV[prevK + offset] : prevV[prevK + offset] + 1;
          const prevY = prevX - prevK;
          while (curX > prevX && curY > prevY) {
            out.push({ kind: "eq", text: a[curX - 1] });
            curX--;
            curY--;
          }
          if (curD === 0) break;
          if (prevDown) {
            // insertion in b
            out.push({ kind: "add", text: b[curY - 1] });
            curY--;
          } else {
            // deletion from a
            out.push({ kind: "del", text: a[curX - 1] });
            curX--;
          }
        }
        out.reverse();
        return out;
      }
    }
  }
  // Fallback: no diff found (shouldn't happen)
  return [
    ...a.map((t) => ({ kind: "del" as const, text: t })),
    ...b.map((t) => ({ kind: "add" as const, text: t })),
  ];
}

async function computeDraftDiffAgainstRevision(revisionId: string) {
  const rid = revisionId.trim();
  const accountId = currentAccount()?.id?.trim() ?? "";
  if (!isTauriRuntime() || !rid || !accountId) return;
  if (!state.draft) return;
  persistDraft();

  state.draftDiffRevisionId = rid;
  state.draftDiffLoading = true;
  state.draftDiffLines = [];
  state.draftDiffOtherBody = "";
  state.draftRevisionPreview = null;
  render();

  try {
    const other = await withTimeout(
      invoke<Draft | null>("draft_revision_restore", { accountId, revisionId: rid }),
      MAIL_ACTION_TIMEOUT_MS
    );
    if (!other) {
      toast("Cette version n’existe plus.");
      state.draftDiffLoading = false;
      render();
      return;
    }
    const curBody = state.draft.markdownBody ?? "";
    const otherBody = other.markdownBody ?? "";
    state.draftDiffOtherBody = otherBody;
    state.draftRevisionPreview = await safeInvoke<DraftPreview>(
      "preview_draft",
      { markdownBody: otherBody },
      {
        textPlain: otherBody,
        html: `<p>${escapeHtml(otherBody).replace(/\n/g, "<br />")}</p>`,
      }
    );
    const a = splitLines(curBody);
    const b = splitLines(otherBody);
    // Guardrail to avoid UI freeze on extreme cases.
    if (a.length + b.length > 8000) {
      toast("Diff trop volumineux : affichez une version plus courte (limite lignes).");
      state.draftDiffLines = [];
    } else {
      state.draftDiffLines = myersDiffLines(a, b);
    }
  } catch (error) {
    console.error("draft_revision_restore (diff)", error);
    toast(`Diff impossible: ${tauriErrorMessage(error)}`);
  } finally {
    state.draftDiffLoading = false;
    render();
  }
}

async function refreshDraftRevisions(limit = 50) {
  const accountId = currentAccount()?.id?.trim() ?? "";
  const sessionId = state.draftSessionId?.trim() ?? "";
  if (!isTauriRuntime() || !accountId || !sessionId) return;
  state.draftRevisionsLoading = true;
  render();
  try {
    state.draftRevisions = await withTimeout(
      invoke<DraftRevisionListItem[]>("draft_revision_list", { accountId, sessionId, limit }),
      MAIL_ACTION_TIMEOUT_MS
    );
  } catch (error) {
    console.error("draft_revision_list", error);
    toast(`Impossible de charger l’historique: ${tauriErrorMessage(error)}`);
  } finally {
    state.draftRevisionsLoading = false;
    render();
  }
}

async function saveDraftRevisionNow() {
  const accountId = currentAccount()?.id?.trim() ?? "";
  const sessionId = state.draftSessionId?.trim() ?? "";
  if (!isTauriRuntime() || !accountId || !sessionId) return;
  if (!state.draft) return;
  persistDraft();
  try {
    await withTimeout(
      invoke("draft_revision_save", {
        accountId,
        sessionId,
        draft: draftPayloadForRust(state.draft),
      }),
      MAIL_ACTION_TIMEOUT_MS
    );
    if (state.composeLayout === "historique") {
      void refreshDraftRevisions(60);
    }
  } catch (error) {
    console.error("draft_revision_save", error);
  }
}

function scheduleDraftRevisionSave(delayMs = DRAFT_REVISION_DEBOUNCE_MS) {
  if (!isTauriRuntime()) return;
  if (!state.draft || !state.draftSessionId) return;
  if (draftRevisionDebounceTimer !== null) {
    window.clearTimeout(draftRevisionDebounceTimer);
  }
  draftRevisionDebounceTimer = window.setTimeout(() => {
    draftRevisionDebounceTimer = null;
    void saveDraftRevisionNow();
  }, Math.max(150, delayMs));
}

function composeDraftHasMeaningfulContent(): boolean {
  if (!state.draft) return false;
  const d = state.draft;
  if (d.subject.trim()) return true;
  if (d.markdownBody.trim()) return true;
  if (d.to.length > 0 || d.cc.length > 0 || d.bcc.length > 0) return true;
  if ((d.attachmentPaths?.length ?? 0) > 0) return true;
  return false;
}

function pickImapMailboxFallback(): string {
  if (state.mailboxes.includes("INBOX")) return "INBOX";
  const sys = pickSystemMailboxes(state.mailboxes);
  if (sys[0]?.name) return sys[0].name;
  return state.mailboxes[0] ?? "INBOX";
}

/** Met à jour `saved_drafts` pour la session courante (Tauri uniquement). */
async function saveDraftToSavedListNow(opts?: { silentToast?: boolean }): Promise<boolean> {
  if (!isTauriRuntime()) return false;
  const accountId = currentAccount()?.id?.trim();
  if (!accountId || !state.draftSessionId?.trim() || !state.draft) {
    toast("Impossible d’enregistrer : session ou compte indisponible.");
    return false;
  }
  persistDraft();
  await saveDraftRevisionNow();
  const titleRaw = state.draft.subject?.trim() ?? "";
  const title = titleRaw.length ? titleRaw : "Sans objet";
  try {
    const newId = await withTimeout(
      invoke<string>("saved_draft_upsert", {
        accountId,
        sessionId: state.draftSessionId.trim(),
        title,
      }),
      MAIL_ACTION_TIMEOUT_MS
    );
    const tid = newId.trim();
    if (tid.length) state.savedDraftRecordId = tid;
    if (!opts?.silentToast) {
      toast("Enregistré dans « Sauvés ».");
    }
    await refreshSavedDraftsMailboxCount();
    if (isSavedDraftsVirtualMailbox(state.selectedMailbox)) {
      await loadMailView(false);
    }
    render();
    return true;
  } catch (e) {
    toast(tauriErrorMessage(e));
    return false;
  }
}

async function finalizeCloseComposeFromUser() {
  persistDraft();
  await saveDraftRevisionNow();
  if (
    isTauriRuntime() &&
    currentAccount()?.id?.trim() &&
    state.draftSessionId &&
    state.draft &&
    composeDraftHasMeaningfulContent() &&
    !state.savedDraftRecordId
  ) {
    state.closeComposeModal = {
      subject: state.draft.subject ?? "",
      hasSavedRecord: false,
    };
    render();
    return;
  }
  state.closeComposeModal = null;
  clearDraftSession();
  if (navCanGoBack()) {
    await goBack();
    return;
  }
  state.view = state.selectedThread ? "thread" : "list";
  if (state.view === "thread" && state.selectedThread && threadReadingIsSimpleLayout()) {
    state.aiOpen = true;
  }
  render();
}

/** Aperçu calculé / rafraîchi pendant la frappe (pas en mode Write seul). */
function composePreviewPaneActive(): boolean {
  return state.view === "compose" && state.composeLayout !== "write" && state.composeLayout !== "historique";
}

let micTimer: number | undefined;
let micMediaRecorder: MediaRecorder | null = null;
let micChunks: Blob[] = [];
let micStream: MediaStream | null = null;

/** Cible d’insertion après transcription (compositeur ou Q&A fil). */
type MicDictationTarget = "compose" | "thread-qa";
let micDictationTarget: MicDictationTarget = "compose";

/** Push-to-talk : maintenir la touche paramétrée (`whisperPttKeyCode`), relâcher = arrêt comme le bouton micro. */
let micPttKeyHeld = false;

let draftRevisionDebounceTimer: ReturnType<typeof setTimeout> | null = null;
/** Délai après la dernière frappe / changement avant envoi d’une version locale (snapshots SQLite). */
const DRAFT_REVISION_DEBOUNCE_MS = 1800;

function composePushToTalkTargetCode(): string {
  return (state.appPrefs.ai.whisperPttKeyCode ?? "").trim();
}

/** Libellé lisible pour une valeur `whisperPttKeyCode` (`KeyboardEvent.code`). */
function formatWhisperPttKeyLabel(code: string): string {
  const c = code.trim();
  if (!c) return "";
  const labels: Record<string, string> = {
    F8: "F8",
    F9: "F9",
    F10: "F10",
    F11: "F11",
    F12: "F12",
    Pause: "Pause",
    ScrollLock: "Arrêt défil.",
    Insert: "Insertion",
    Backquote: "² / sous Échap (selon clavier)",
  };
  return labels[c] ?? c;
}

function composePushToTalkShortcutLabel(): string {
  return formatWhisperPttKeyLabel(composePushToTalkTargetCode());
}

function pushToTalkKeyMatches(event: KeyboardEvent): boolean {
  const code = composePushToTalkTargetCode();
  if (!code) return false;
  const pttViewOk =
    state.view === "compose" ||
    (state.view === "thread" && isAiFeatureEnabled(state.appPrefs.ai, "featureThreadQaEnabled"));
  if (!pttViewOk) return false;
  if (event.ctrlKey || event.altKey || event.metaKey || event.shiftKey) return false;
  return event.code === code;
}

function micTargetFromView(explicit?: MicDictationTarget): MicDictationTarget {
  if (explicit) return explicit;
  return state.view === "thread" ? "thread-qa" : "compose";
}

function dictationBaseTextForTarget(target: MicDictationTarget): string {
  if (target === "thread-qa") {
    const ta = document.querySelector<HTMLTextAreaElement>("#thread-qa-input");
    return ta?.value ?? state.threadQaDraft ?? "";
  }
  return state.composeCanonicalBody || state.draft?.markdownBody || state.composeBody || "";
}

function applyDictationToTarget(text: string, target: MicDictationTarget): void {
  const trimmed = text.trim();
  if (!trimmed) return;
  if (target === "thread-qa") {
    const ta = document.querySelector<HTMLTextAreaElement>("#thread-qa-input");
    const base = (ta?.value ?? state.threadQaDraft).trimEnd();
    const joiner = base.length && !/\s$/.test(base) ? " " : "";
    const next = `${base}${joiner}${trimmed}`;
    state.threadQaDraft = next;
    if (ta) {
      ta.value = next;
      ta.focus();
      const end = next.length;
      ta.setSelectionRange(end, end);
    }
    return;
  }
  const base = dictationBaseTextForTarget("compose").trimEnd();
  const joiner = base.length ? "\n\n" : "";
  loadComposeMarkdownIntoEditor(`${base}${joiner}${trimmed}`);
  if (composePreviewPaneActive()) schedulePreviewUpdate(0);
}

function bindMicPushToTalk() {
  document.addEventListener(
    "keydown",
    (event: KeyboardEvent) => {
      if (!state.appPrefs.ai.dictationEnabled || !isTauriRuntime() || event.repeat) return;
      if (!pushToTalkKeyMatches(event)) return;
      if (state.micState !== "idle") return;
      event.preventDefault();
      micPttKeyHeld = true;
      void micAction({ fromPushToTalk: true, target: micTargetFromView() });
    },
    true
  );
  document.addEventListener(
    "keyup",
    (event: KeyboardEvent) => {
      if (!micPttKeyHeld) return;
      const target = composePushToTalkTargetCode();
      if (!target || event.code !== target) return;
      micPttKeyHeld = false;
      if (state.micState === "recording") {
        event.preventDefault();
        void micAction();
      }
    },
    true
  );
}

/** Décode un blob audio (webm, etc.), mixe en mono, rééchantillonne à 16 kHz, encode WAV PCM s16le. */
async function mediaBlobToWav16kMonoPcm16(blob: Blob): Promise<Uint8Array> {
  const arrayBuf = await blob.arrayBuffer();
  const ctx = new AudioContext();
  let audioBuf: AudioBuffer;
  try {
    audioBuf = await ctx.decodeAudioData(arrayBuf.slice(0));
  } finally {
    await ctx.close().catch(() => undefined);
  }
  const inRate = audioBuf.sampleRate;
  const inCh = audioBuf.numberOfChannels;
  const inLen = audioBuf.length;
  const mono = new Float32Array(inLen);
  for (let i = 0; i < inLen; i++) {
    let s = 0;
    for (let c = 0; c < inCh; c++) s += audioBuf.getChannelData(c)[i];
    mono[i] = s / inCh;
  }
  const outRate = 16_000;
  const outLen = Math.max(1, Math.floor((inLen * outRate) / inRate));
  const resampled = new Float32Array(outLen);
  for (let i = 0; i < outLen; i++) {
    const pos = (i * inRate) / outRate;
    const i0 = Math.floor(pos);
    const i1 = Math.min(i0 + 1, inLen - 1);
    const f = pos - i0;
    resampled[i] = mono[i0] * (1 - f) + mono[i1] * f;
  }
  const pcm = new Int16Array(outLen);
  for (let i = 0; i < outLen; i++) {
    const x = Math.max(-1, Math.min(1, resampled[i]));
    pcm[i] = x < 0 ? Math.round(x * 0x8000) : Math.round(x * 0x7fff);
  }
  const dataSize = pcm.length * 2;
  const buf = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buf);
  const writeStr = (off: number, s: string) => {
    for (let j = 0; j < s.length; j++) view.setUint8(off + j, s.charCodeAt(j));
  };
  writeStr(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, outRate, true);
  view.setUint32(28, outRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeStr(36, "data");
  view.setUint32(40, dataSize, true);
  new Uint8Array(buf, 44).set(new Uint8Array(pcm.buffer));
  return new Uint8Array(buf);
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, Math.min(i + chunk, bytes.length)));
  }
  return btoa(binary);
}
let previewTimer: number | undefined;
let composerDropAbort: AbortController | undefined;
/** Annule entrées paste/input du compositeur à chaque `render()` pour éviter double collage / doubles handlers. */
let composeInteractionsAbort: AbortController | undefined;
/** Compteur anti-faux dragleave lorsque l’on traverse des enfants. */
let composeDragDepth = 0;
/** Historique limité aux actions toolbar Markdown (boutons Défaire / Refaire). */
const markdownUndoStack: string[] = [];
const markdownRedoStack: string[] = [];

const INLINE_DATA_IMAGE_THRESHOLD = 4096;

function clampPreviewLabelFromAlt(altRaw: string): string {
  const t = altRaw.replace(/\s+/g, " ").trim();
  if (!t) return "capture";
  return t.length > 80 ? `${t.slice(0, 77)}…` : t;
}

function encodeMarkdownImageAltForDataUrl(altRaw: string): string {
  try {
    const enc = btoa(unescape(encodeURIComponent(altRaw)));
    return enc.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/u, "");
  } catch {
    return btoa(altRaw)
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/u, "");
  }
}

function decodeMarkdownImageAltFromStored(stored: string): string {
  const pad = stored.length % 4 === 0 ? "" : "=".repeat(4 - (stored.length % 4));
  const b64 = stored.replace(/-/g, "+").replace(/_/g, "/") + pad;
  try {
    return decodeURIComponent(
      Array.prototype.map
        .call(atob(b64), (c: string) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2))
        .join("")
    );
  } catch {
    try {
      return atob(b64);
    } catch {
      return "";
    }
  }
}

function iterMarkdownImages(markdown: string, visit: (full: string, alt: string, url: string) => void) {
  let i = 0;
  const s = markdown;
  while (i < s.length) {
    const bang = s.indexOf("![", i);
    if (bang === -1) break;
    let depth = 1;
    let j = bang + 2;
    let closeBracket = -1;
    while (j < s.length && depth > 0) {
      if (s[j] === "[" && j > 0 && s[j - 1] !== "\\") depth += 1;
      else if (s[j] === "]" && (j === 0 || s[j - 1] !== "\\")) {
        depth -= 1;
        if (depth === 0) {
          closeBracket = j;
          break;
        }
      }
      j += 1;
    }
    if (closeBracket === -1 || s[closeBracket + 1] !== "(") {
      i = bang + 1;
      continue;
    }
    const alt = s.slice(bang + 2, closeBracket);
    const urlStart = closeBracket + 2;
    let depthP = 1;
    let k = urlStart;
    let closeParen = -1;
    while (k < s.length && depthP > 0) {
      if (s[k] === "(") depthP += 1;
      else if (s[k] === ")") {
        depthP -= 1;
        if (depthP === 0) {
          closeParen = k;
          break;
        }
      }
      k += 1;
    }
    if (closeParen === -1) {
      i = bang + 2;
      continue;
    }
    const url = s.slice(urlStart, closeParen).trim();
    const full = s.slice(bang, closeParen + 1);
    visit(full, alt, url);
    i = closeParen + 1;
  }
}

function collapseLargeDataImageMarkdown(markdown: string): string {
  const parts: string[] = [];
  let last = 0;
  iterMarkdownImages(markdown, (full: string, alt: string, url: string) => {
    const start = markdown.indexOf(full, last);
    if (start === -1) return;
    parts.push(markdown.slice(last, start));
    last = start + full.length;
    if (url.length <= INLINE_DATA_IMAGE_THRESHOLD) {
      parts.push(full);
      return;
    }
    let stored = alt;
    if (alt.includes("]") || alt.includes("![")) {
      stored = `b64:${encodeMarkdownImageAltForDataUrl(alt)}`;
    }
    const labelSource = stored.startsWith("b64:")
      ? decodeMarkdownImageAltFromStored(stored.slice(4))
      : alt;
    const label = clampPreviewLabelFromAlt(labelSource);
    parts.push(`![📷 ${label}](rustymail-inline://${stored})`);
  });
  parts.push(markdown.slice(last));
  return parts.join("");
}

/** Index des grosses images inline du canonical pour réinjecter les data URLs depuis le textarea avec placeholders. */
function buildLargeDataImageMap(canonical: string): Map<string, string> {
  const map = new Map<string, string>();
  iterMarkdownImages(canonical, (full: string, alt: string, url: string) => {
    if (url.length <= INLINE_DATA_IMAGE_THRESHOLD) return;
    let keyAlt = alt;
    if (alt.includes("]") || alt.includes("![")) {
      keyAlt = `b64:${encodeMarkdownImageAltForDataUrl(alt)}`;
    }
    map.set(keyAlt, full);
  });
  return map;
}

function expandInlineImagePlaceholders(displayMarkdown: string, canonical: string): string {
  const imgs = buildLargeDataImageMap(canonical);
  const out: string[] = [];
  let i = 0;
  const s = displayMarkdown;
  while (i < s.length) {
    const bang = s.indexOf("![", i);
    if (bang === -1) {
      out.push(s.slice(i));
      break;
    }
    out.push(s.slice(i, bang));
    let depth = 1;
    let j = bang + 2;
    let closeBracket = -1;
    while (j < s.length && depth > 0) {
      if (s[j] === "[" && j > 0 && s[j - 1] !== "\\") depth += 1;
      else if (s[j] === "]" && (j === 0 || s[j - 1] !== "\\")) {
        depth -= 1;
        if (depth === 0) {
          closeBracket = j;
          break;
        }
      }
      j += 1;
    }
    if (closeBracket === -1) {
      out.push(s.slice(bang));
      break;
    }
    if (s[closeBracket + 1] !== "(") {
      out.push(s[bang]);
      i = bang + 1;
      continue;
    }
    const urlStart = closeBracket + 2;
    let depthP = 1;
    let k = urlStart;
    let closeParen = -1;
    while (k < s.length && depthP > 0) {
      if (s[k] === "(") depthP += 1;
      else if (s[k] === ")") {
        depthP -= 1;
        if (depthP === 0) {
          closeParen = k;
          break;
        }
      }
      k += 1;
    }
    if (closeParen === -1) {
      out.push(s.slice(bang));
      break;
    }
    const url = s.slice(urlStart, closeParen).trim();
    const prefix = "rustymail-inline://";
    if (url.startsWith(prefix)) {
      const key = url.slice(prefix.length);
      const full = imgs.get(key);
      out.push(full ?? s.slice(bang, closeParen + 1));
    } else {
      out.push(s.slice(bang, closeParen + 1));
    }
    i = closeParen + 1;
  }
  return out.join("");
}

/** Reconstruit le Markdown « réel » à partir du textarea + canonical (pour résoudre les placeholders). */
function composeDisplayToCanonical(display: string): string {
  return expandInlineImagePlaceholders(display, state.composeCanonicalBody || state.draft?.markdownBody || display);
}

/** Met à jour textarea + canonical + brouillon après édition utilisateur. */
function setComposeFromTextareaValue(textareaValue: string) {
  state.composeBody = textareaValue;
  const canonical = composeDisplayToCanonical(textareaValue);
  state.composeCanonicalBody = canonical;
  if (state.draft) state.draft.markdownBody = canonical;
}

function loadComposeMarkdownIntoEditor(markdown: string) {
  state.composeCanonicalBody = markdown;
  state.composeBody = collapseLargeDataImageMarkdown(markdown);
  if (state.draft) state.draft.markdownBody = markdown;
}

function resetMarkdownEditorHistory() {
  markdownUndoStack.length = 0;
  markdownRedoStack.length = 0;
}

function markdownPushToolbarUndoSnapshot(value: string) {
  markdownUndoStack.push(value);
  if (markdownUndoStack.length > 42) markdownUndoStack.shift();
  markdownRedoStack.length = 0;
}

function markdownPopPendingToolbarSnapshot() {
  markdownUndoStack.pop();
}

function applyMarkdownUndoRedo(which: "undo" | "redo") {
  const textarea = document.querySelector<HTMLTextAreaElement>("#compose-body");
  if (!textarea) return;
  if (which === "undo") {
    if (!markdownUndoStack.length) return;
    markdownRedoStack.push(textarea.value);
    const prev = markdownUndoStack.pop()!;
    textarea.value = prev;
  } else if (!markdownRedoStack.length) {
    return;
  } else {
    markdownUndoStack.push(textarea.value);
    const next = markdownRedoStack.pop()!;
    textarea.value = next;
  }
  setComposeFromTextareaValue(textarea.value);
  schedulePreviewUpdate();
  textarea.focus();
}

function finalizeMarkdownToolbarEdit(textarea: HTMLTextAreaElement) {
  setComposeFromTextareaValue(textarea.value);
  schedulePreviewUpdate();
}

function markdownExpandSelectedLines(textarea: HTMLTextAreaElement) {
  const value = textarea.value;
  const selA = textarea.selectionStart ?? 0;
  const selB = textarea.selectionEnd ?? 0;
  const lo = Math.min(selA, selB);
  const hi = Math.max(selA, selB);
  const ls = value.lastIndexOf("\n", lo - 1) + 1;
  let le = value.indexOf("\n", hi);
  if (le === -1) le = value.length;
  return { value, ls, le };
}

function markdownToggleBulletLines(textarea: HTMLTextAreaElement, prefix = "- ") {
  const { value, ls, le } = markdownExpandSelectedLines(textarea);
  const block = value.slice(ls, le);
  const lines = block.split("\n");
  const allPrefixed =
    lines.length > 0 && lines.every((line) => line.trim() === "" || line.startsWith(prefix));
  const nextLines = lines.map((line) => {
    if (line.trim() === "") return line;
    if (allPrefixed && line.startsWith(prefix)) return line.slice(prefix.length);
    return `${prefix}${line}`;
  });
  const replacement = nextLines.join("\n");
  textarea.setRangeText(replacement, ls, le, "end");
}

function markdownToggleNumberedLines(textarea: HTMLTextAreaElement) {
  const { value, ls, le } = markdownExpandSelectedLines(textarea);
  const block = value.slice(ls, le);
  const lines = block.split("\n");
  const allPrefixed =
    lines.length > 0 && lines.every((line) => line.trim() === "" || /^\s*\d+\.\s/.test(line));
  const nextLines =
    lines.length && allPrefixed
      ? lines.map((line) => (line.trim() === "" ? line : line.replace(/^\s*\d+\.\s*/, "").trimStart()))
      : lines.map((line, idx) =>
          line.trim() === ""
            ? line
            : `${idx + 1}. ${line.replace(/^\s*\d+\.\s*/, "").trimStart()}`
        );
  textarea.setRangeText(nextLines.join("\n"), ls, le, "end");
}

function markdownToggleBlockquoteLines(textarea: HTMLTextAreaElement) {
  markdownToggleBulletLines(textarea, "> ");
}

function markdownToggleHeadingLines(textarea: HTMLTextAreaElement, level: 1 | 2 | 3 = 2) {
  const { value, ls, le } = markdownExpandSelectedLines(textarea);
  const block = value.slice(ls, le);
  const lines = block.split("\n");
  const prefix = `${"#".repeat(level)} `;
  const stripRe = /^(#{1,6})\s+/;
  const allAreSameHeading = lines.length > 0 && lines.every((line) => line.trim() === "" || line.startsWith(prefix));
  const nextLines = lines.map((line) => {
    if (line.trim() === "") return line;
    const noHeading = line.replace(stripRe, "");
    return allAreSameHeading ? noHeading : `${prefix}${noHeading}`;
  });
  textarea.setRangeText(nextLines.join("\n"), ls, le, "end");
}

function markdownInsertCodeOrFence(textarea: HTMLTextAreaElement, start: number, end: number, selected: string) {
  if (selected && selected.includes("\n")) {
    const replacement = `\`\`\`\n${selected}\n\`\`\``;
    textarea.setRangeText(replacement, start, end, "end");
  } else {
    wrapSelection(textarea, start, end, "`", "`", selected || "code", { selectInnerWhenEmpty: true });
  }
}

const DEFAULT_INVOKE_TIMEOUT_MS = 2500;
/** Premier chargement (SQLite, keyring) : éviter de retomber sur le fallback par timeout. */
const BOOT_INVOKE_TIMEOUT_MS = 15_000;
/** Base SQLite volumineuse : `list_accounts` + migration au 1er accès peuvent dépasser 15 s. */
const ACCOUNTS_BOOT_TIMEOUT_MS = 45_000;
const ACCOUNT_INVOKE_TIMEOUT_MS = 30_000;
/** Flux OAuth bureau (navigateur + saisie utilisateur) — délai large. */
const OAUTH_DESKTOP_LOGIN_TIMEOUT_MS = 900_000;
/** Port loopback Microsoft Entra — aligné sur `OAUTH_LOOPBACK_DEFAULT_PORT` (Rust). */
const OAUTH_LOOPBACK_DEFAULT_PORT = 52_789;

type OAuthDesktopLoginOutcome = {
  email: string;
  displayName?: string | null;
  redirectUri?: string;
  ephemeralRedirect?: boolean;
};

function warnOAuthEphemeralRedirect(outcome: OAuthDesktopLoginOutcome): void {
  if (!outcome.ephemeralRedirect) return;
  const uri = (outcome.redirectUri ?? "").trim();
  toast(
    `OAuth : le port ${OAUTH_LOOPBACK_DEFAULT_PORT} est occupé — redirect éphémère ${uri || "(inconnu)"}. ` +
      `N’utilisez pas ce flux sans ajouter cette URI dans Entra, ou fermez l’autre RustyMail / libérez le port ` +
      `(netstat -ano | findstr :${OAUTH_LOOPBACK_DEFAULT_PORT}).`,
    18_000,
  );
}
const SYNC_INVOKE_TIMEOUT_MS = 120_000;
const MAIL_ACTION_TIMEOUT_MS = 90_000;
/** Invocations LLM (génération longue + requêtes HTTP ~195s côté client). */
const LLM_INVOKE_TIMEOUT_MS = 200_000;
/** Révision prompts / JSON — alignée sur `llm_commands::AI_CACHE_PROMPT_REVISION`. */
const AI_CACHE_PROMPT_REVISION = 6;
/** Pause avant de planifier un brief après changement de liste (limite les appels LLM si l’utilisateur change souvent de dossier). */
const MAILBOX_DIGEST_DEBOUNCE_MS = 2400;
/** Si le thread UI reste occupé, on lance quand même le digest après ce délai (requestIdleCallback). */
const MAILBOX_DIGEST_IDLE_CALLBACK_TIMEOUT_MS = 4500;
/** Après chargement de la liste : délai avant préremplissage cache synthèses / traductions (idle navigateur). */
const IDLE_AI_CACHE_PREFETCH_DEBOUNCE_MS = 9000;
/** Fils max traités par passage idle (évite saturation LLM). */
const IDLE_AI_CACHE_PREFETCH_MAX_THREADS = 3;
/** Timeout `requestIdleCallback` pour lancer le passage prefetch. */
const IDLE_AI_CACHE_IDLE_CALLBACK_TIMEOUT_MS = 12_000;

/** Boîte virtuelle : liste SQLite `saved_drafts`, pas un dossier IMAP. */
const LOCAL_SAVED_DRAFTS_MAILBOX = "__LOCAL_SAVED_DRAFTS__";
const SAVED_DRAFT_THREAD_PREFIX = "saved-draft:";

type MailboxKind = "inbox" | "drafts" | "sent" | "archive" | "spam" | "trash";

/** Aligné sur `is_inbox_like_mailbox` (Rust) — INBOX, `[Gmail]/Inbox`, etc. */
function isInboxLikeMailbox(name: string): boolean {
  const n = String(name ?? "").trim().toLowerCase();
  return n === "inbox" || /^inbox\b/.test(n) || n.endsWith("/inbox");
}

function preferredInboxMailboxName(mailboxes: string[]): string | undefined {
  const fromSystem = pickSystemMailboxes(mailboxes).find((x) => x.kind === "inbox");
  if (fromSystem) return fromSystem.name;
  return mailboxes.find((mb) => isInboxLikeMailbox(mb));
}

function mailboxKind(name: string): MailboxKind | null {
  const raw = String(name ?? "").trim();
  if (!raw) return null;
  const n = raw.toLowerCase();
  if (isInboxLikeMailbox(raw)) return "inbox";
  if (/(draft)/.test(n)) return "drafts";
  if (/(sent|sent items|outbox)/.test(n)) return "sent";
  if (/(archive|all mail|tous les messages)/.test(n)) return "archive";
  if (/(junk|spam|indésirable|indesirable)/.test(n)) return "spam";
  if (/(trash|deleted items|deleted|bin|corbeille|poubelle)/.test(n)) return "trash";
  return null;
}

function mailboxKindIcon(kind: MailboxKind): string {
  switch (kind) {
    case "inbox":
      return "IN";
    case "drafts":
      return "DR";
    case "sent":
      return "SE";
    case "archive":
      return "AR";
    case "spam":
      return "SP";
    case "trash":
      return "TR";
  }
}

function mailboxKindLabelFr(kind: MailboxKind): string {
  switch (kind) {
    case "inbox":
      return "Boîte de réception";
    case "drafts":
      return "Brouillons";
    case "sent":
      return "Envoyés";
    case "archive":
      return "Archive";
    case "spam":
      return "Indésirables";
    case "trash":
      return "Corbeille";
  }
}

/** Libellé court pour colonne « dossier » dans la liste (FR). */
function threadMailboxListLabel(raw: string | undefined): { label: string; full: string } {
  const full = (raw ?? "").trim() || "INBOX";
  if (full === LOCAL_SAVED_DRAFTS_MAILBOX) {
    return { label: "Sauvés", full: LOCAL_SAVED_DRAFTS_MAILBOX };
  }
  const k = mailboxKind(full);
  if (k === "inbox") return { label: "Réception", full };
  if (k === "drafts") return { label: "Brouillon", full };
  if (k === "sent") return { label: "Envoyés", full };
  if (k === "archive") return { label: "Archive", full };
  if (k === "spam") return { label: "Indésir.", full };
  if (k === "trash") return { label: "Corbeille", full };
  return { label: full, full };
}

function threadMailboxColumnTitle(mbRaw: string): string {
  const { label, full } = threadMailboxListLabel(mbRaw);
  return label === full ? `Dossier : ${full}` : `Dossier : ${label} — ${full}`;
}

function navMailboxSegment(mailbox?: string): string {
  const { label } = threadMailboxListLabel(mailbox ?? state.selectedMailbox);
  return label;
}

function navCurrentBreadcrumbSegment(): string | null {
  switch (state.view) {
    case "list":
      return navMailboxSegment();
    case "thread": {
      const subj = state.selectedThread?.subject?.trim();
      return subj ? (subj.length > 36 ? `${subj.slice(0, 33)}…` : subj) : "Fil";
    }
    case "compose":
      return "Composer";
    case "settings":
      return "Paramètres";
    case "contacts":
      return "Carnet";
    case "contact": {
      const em = state.selectedContactEmail ?? getContactDetail()?.email;
      const name = getContactDetail()?.displayName?.trim();
      return name || em || "Contact";
    }
    case "organization":
      return "Organiser";
    case "organizationV2":
      return "Organiser V2";
    case "folderManager":
      return "Dossiers";
    default:
      return null;
  }
}

function renderViewNavTrail(actionsHtml?: string): string {
  const seg = navCurrentBreadcrumbSegment();
  if (!seg) return "";
  return navRenderTrailHtml(seg, escapeHtml, escapeAttr, actionsHtml ? { actionsHtml } : {});
}

async function navigateToBreadcrumbIndex(stackIndex: number): Promise<void> {
  if (stackIndex < 0) {
    navigateToInbox();
    return;
  }
  const target = navJumpToStackIndex(stackIndex, captureCurrentNav());
  if (!target) return;
  await applyNavSnapshot(target);
}

function captureCurrentNav(): NavSnapshot {
  const view = state.view;
  let backLabel = "Boîte de réception";
  let breadcrumb: string[] = ["Boîte"];
  switch (view) {
    case "list":
      backLabel = navMailboxSegment();
      breadcrumb = [navMailboxSegment()];
      break;
    case "thread":
      backLabel = navMailboxSegment();
      breadcrumb = [navMailboxSegment()];
      break;
    case "contacts":
      backLabel = "Carnet";
      breadcrumb = ["Carnet"];
      break;
    case "contact": {
      const name = getContactDetail()?.displayName?.trim() || state.selectedContactEmail || "Contact";
      backLabel = "Contact";
      breadcrumb = ["Carnet", name];
      break;
    }
    case "settings":
      backLabel = "Paramètres";
      breadcrumb = ["Paramètres"];
      break;
    case "organization":
      backLabel = "Organiser";
      breadcrumb = ["Organiser"];
      break;
    case "organizationV2":
      backLabel = "Organiser V2";
      breadcrumb = ["Organiser V2"];
      break;
    case "folderManager": {
      const mb = state.folderManager.selectedMailbox?.trim();
      if (mb) {
        const label = threadMailboxListLabel(mb).label;
        backLabel = label;
        breadcrumb = ["Dossiers", label];
      } else {
        backLabel = "Dossiers";
        breadcrumb = ["Dossiers"];
      }
      break;
    }
    case "compose":
      backLabel = state.selectedThread ? "Fil" : navMailboxSegment();
      breadcrumb =
        state.selectedThread ? ["Fil", "Composer"] : [navMailboxSegment(), "Composer"];
      break;
  }
  return {
    view,
    backLabel,
    breadcrumb,
    selectedThreadId: state.selectedThreadId,
    selectedContactEmail: state.selectedContactEmail,
    settingsTab: state.settingsTab,
    selectedMailbox: state.selectedMailbox,
    search: state.search,
    searchDraft: state.searchDraft,
    searchSenders: [...state.searchSenders],
    listFilter: state.listFilter,
    searchScope: state.searchScope,
    searchNlMode: state.searchNlMode,
    contactsListQuery: getContactsListQuery(),
    contactsKeywordDraft: getContactsKeywordDraft(),
    listScrollY: view === "list" ? readListScrollY() : undefined,
    contactsScrollY: view === "contacts" ? readContactsScrollY() : undefined,
    aiOpen: state.aiOpen,
    folderManagerSelectedMailbox:
      view === "folderManager" ? (state.folderManager.selectedMailbox ?? null) : undefined,
  };
}

function shouldPushNavHistory(from: View, to: View): boolean {
  if (from === to) return false;
  const drill =
    (from === "list" && (to === "thread" || to === "compose" || to === "settings")) ||
    (from === "contacts" && (to === "contact" || to === "thread" || to === "compose")) ||
    (from === "contact" && (to === "thread" || to === "compose")) ||
    (from === "thread" && to === "compose") ||
    (from === "organization" && to === "thread") ||
    (from === "list" && to === "contacts") ||
    (from === "list" && to === "organization") ||
    (from === "list" && to === "folderManager") ||
    (from === "list" && to === "settings");
  return drill;
}

type NavigateOpts = {
  resetStack?: boolean;
  skipHistory?: boolean;
  replaceHistory?: boolean;
};

function beginNavigation(to: View, opts?: NavigateOpts): void {
  if (state.view === "thread" && to !== "thread") {
    flushThreadActivityClosed();
  }
  if (opts?.resetStack) navReset();
  else if (!opts?.skipHistory) {
    const from = state.view;
    if (shouldPushNavHistory(from, to)) {
      const snap = captureCurrentNav();
      if (opts?.replaceHistory && navCanGoBack()) {
        navPop();
      }
      navPush(snap);
    }
  }
}

async function applyNavSnapshot(snap: NavSnapshot): Promise<void> {
  navQueueScrollRestore(snap);
  state.selectedMailbox = snap.selectedMailbox ?? state.selectedMailbox;
  if (snap.search !== undefined) state.search = snap.search;
  if (snap.searchDraft !== undefined) state.searchDraft = snap.searchDraft;
  if (snap.searchSenders) state.searchSenders = [...snap.searchSenders];
  if (snap.listFilter) state.listFilter = snap.listFilter;
  if (snap.searchScope) state.searchScope = snap.searchScope;
  if (snap.searchNlMode !== undefined) state.searchNlMode = snap.searchNlMode;
  if (snap.contactsListQuery !== undefined) setContactsListQuery(snap.contactsListQuery);
  if (snap.contactsKeywordDraft !== undefined) setContactsKeywordDraft(snap.contactsKeywordDraft);
  state.aiOpen = Boolean(snap.aiOpen);
  state.selectedContactEmail = snap.selectedContactEmail;
  if (snap.settingsTab) state.settingsTab = snap.settingsTab;

  switch (snap.view) {
    case "list":
      state.view = "list";
      state.selectedThread = undefined;
      state.selectedThreadId = undefined;
      clearThreadAiSummaryState();
      render();
      if (
        (snap.search?.trim() ?? "") ||
        (snap.searchSenders?.length ?? 0) > 0 ||
        snap.listFilter !== defaultListFilterFromPrefs()
      ) {
        void searchThreads();
      }
      break;
    case "thread": {
      const tid = snap.selectedThreadId?.trim();
      if (!tid) {
        state.view = "list";
        render();
        break;
      }
      await openThread(tid, { skipHistory: true, preserveAi: snap.aiOpen });
      break;
    }
    case "contacts": {
      state.view = "contacts";
      state.selectedContactEmail = undefined;
      clearContactProfile();
      clearThreadAiSummaryState();
      render();
      const acc = currentAccount();
      if (acc?.id) {
        try {
          await loadContactsList(acc.id, { reset: true, query: snap.contactsListQuery });
        } catch (e) {
          toast(tauriErrorMessage(e));
        }
      }
      render();
      break;
    }
    case "contact": {
      const em = snap.selectedContactEmail?.trim();
      if (!em) {
        state.view = "contacts";
        render();
        break;
      }
      await openContactDetailView(em, { skipHistory: true });
      break;
    }
    case "settings":
      state.view = "settings";
      state.settingsTab = snap.settingsTab ?? state.settingsTab;
      clearThreadAiSummaryState();
      render();
      break;
    case "organization":
      state.view = "organization";
      state.mailboxDigestPanelOpen = false;
      clearThreadAiSummaryState();
      render();
      break;
    case "organizationV2":
      state.view = "organizationV2";
      state.mailboxDigestPanelOpen = false;
      clearThreadAiSummaryState();
      render();
      break;
    case "folderManager": {
      state.view = "folderManager";
      state.mailboxDigestPanelOpen = false;
      clearThreadAiSummaryState();
      const mb = snap.folderManagerSelectedMailbox ?? null;
      state.folderManager.selectedMailbox = mb;
      if (!mb) state.threads = [];
      render();
      if (mb) await fmSelectMailbox(mb, { skipHistory: true });
      else await refreshFolderManagerTree();
      break;
    }
    case "compose":
      state.view = "compose";
      render();
      break;
    default:
      state.view = "list";
      render();
  }
  window.requestAnimationFrame(() => {
    navApplyPendingScrollRestore();
  });
}

async function goBack(): Promise<void> {
  const snap = navPop();
  if (!snap) {
    if (state.view === "folderManager" && state.folderManager.selectedMailbox) {
      state.folderManager.selectedMailbox = null;
      state.threads = [];
      render();
      return;
    }
    if (state.view !== "list") {
      state.view = "list";
      state.selectedThread = undefined;
      state.selectedThreadId = undefined;
      state.selectedContactEmail = undefined;
      state.aiOpen = false;
      clearThreadAiSummaryState();
      render();
    }
    return;
  }
  navPushForward(captureCurrentNav());
  await applyNavSnapshot(snap);
}

async function goForward(): Promise<void> {
  const snap = navPopForward();
  if (!snap) return;
  navPushBackEntry(captureCurrentNav());
  await applyNavSnapshot(snap);
}

function navigateToInbox(opts?: NavigateOpts): void {
  beginNavigation("list", { resetStack: true, ...opts });
  state.view = "list";
  state.selectedContactEmail = undefined;
  state.selectedThread = undefined;
  state.selectedThreadId = undefined;
  state.aiOpen = false;
  clearThreadAiSummaryState();
  render();
}

function enterComposeView(opts?: { skipHistory?: boolean }): void {
  if (!opts?.skipHistory && state.view !== "compose") beginNavigation("compose");
  state.view = "compose";
  state.aiOpen = false;
}

/** Nettoie l’aperçu de liste (évite CSS/HTML brut). */
function cleanThreadListPreview(raw: string): string {
  let s = String(raw ?? "");
  // Retire balises HTML
  s = s.replace(/<[^>]*>/g, " ");
  // Retire blocs CSS courants : `selector{ ... }`
  for (let i = 0; i < 4; i++) {
    const next = s.replace(/[^{]{0,120}\{[^}]{0,600}\}/g, " ");
    if (next === s) break;
    s = next;
  }
  // Normalise espaces
  s = s.replace(/\s+/g, " ").trim();
  // Coupe un peu (la CSS brute explose vite)
  if (s.length > 220) s = `${s.slice(0, 220).trim()}…`;
  return s;
}

/** Dossiers proposés en cible de déplacement : on retire corbeille / envoyés (verrou côté backend aussi). */
function mailboxesAllowedForMove(names: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of names ?? []) {
    const name = (raw ?? "").trim();
    if (!name || name === LOCAL_SAVED_DRAFTS_MAILBOX) continue;
    const k = mailboxKind(name);
    if (k === "trash" || k === "sent") continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(name);
  }
  out.sort((a, b) => {
    const ak = mailboxKind(a);
    const bk = mailboxKind(b);
    if (ak === "inbox" && bk !== "inbox") return -1;
    if (bk === "inbox" && ak !== "inbox") return 1;
    return a.localeCompare(b, "fr", { sensitivity: "base" });
  });
  return out;
}

/** Parse `received_at` SQLite / ISO ; retourne null si la valeur est déjà un libellé court non ISO. */
function parseThreadListActivityDate(raw: string): Date | null {
  const t = raw.trim();
  if (!t) return null;
  let ms = Date.parse(t);
  if (!Number.isFinite(ms) && /^\d{4}-\d{2}-\d{2}$/.test(t)) {
    ms = Date.parse(`${t}T12:00:00Z`);
  }
  return Number.isFinite(ms) ? new Date(ms) : null;
}

/** Infobulle : date complète lisible (fuseau local navigateur). */
function threadListActivityTooltip(raw: string): string {
  const trimmed = raw.trim();
  const d = parseThreadListActivityDate(trimmed);
  if (!d) return trimmed;
  try {
    return new Intl.DateTimeFormat("fr-FR", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      timeZoneName: "short",
    }).format(d);
  } catch {
    return trimmed;
  }
}

/** Colonne étroite : dernière modif + date de création (liste Sauvés). */
function savedDraftDatesColumnSnippet(createdIso: string | undefined, updatedIso: string | undefined): {
  line1: string;
  line2: string;
  tip: string;
} {
  const upd = parseThreadListActivityDate(updatedIso ?? "");
  const cre = parseThreadListActivityDate(createdIso ?? "");
  const line1 = upd ?
      new Intl.DateTimeFormat("fr-FR", {
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }).format(upd)
    : "";
  let line2 = "";
  if (cre) {
    const creOpts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short" };
    if (cre.getFullYear() !== new Date().getFullYear()) creOpts.year = "2-digit";
    line2 = `créé ${new Intl.DateTimeFormat("fr-FR", creOpts).format(cre)}`;
  }
  const tips: string[] = [];
  if (createdIso?.trim()) tips.push(`Création : ${threadListActivityTooltip(createdIso.trim())}`);
  if (updatedIso?.trim()) tips.push(`Dernière modif : ${threadListActivityTooltip(updatedIso.trim())}`);
  return { line1, line2, tip: tips.length ? tips.join(" · ") : line1 || line2 };
}

/** Affichage liste : relatif / court plutôt que ISO brut. */
function formatFriendlyThreadListDate(raw: string, nowArg?: Date): string {
  const trimmed = raw.trim();
  const d = parseThreadListActivityDate(trimmed);
  if (!d) return trimmed;

  const now = nowArg ?? new Date();
  const startOfLocalDay = (date: Date) =>
    new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();

  const dDay = startOfLocalDay(d);
  const nDay = startOfLocalDay(now);
  const diffDays = Math.round((nDay - dDay) / 86400000);

  const timeFmt = new Intl.DateTimeFormat("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  try {
    if (diffDays === 0) return timeFmt.format(d);

    if (diffDays === 1) return `Hier, ${timeFmt.format(d)}`;

    if (diffDays >= 2 && diffDays <= 6) {
      return new Intl.DateTimeFormat("fr-FR", {
        weekday: "short",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }).format(d);
    }

    if (diffDays < 0) {
      return new Intl.DateTimeFormat("fr-FR", {
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }).format(d);
    }

    if (d.getFullYear() === now.getFullYear()) {
      return new Intl.DateTimeFormat("fr-FR", {
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }).format(d);
    }

    return new Intl.DateTimeFormat("fr-FR", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(d);
  } catch {
    return trimmed;
  }
}

function pickSystemMailboxes(all: string[]): Array<{ kind: MailboxKind; name: string }> {
  const seen = new Set<string>();
  const order: MailboxKind[] = ["inbox", "drafts", "sent", "archive", "spam", "trash"];
  const picked: Array<{ kind: MailboxKind; name: string }> = [];
  for (const kind of order) {
    const match = all.find((mb) => mailboxKind(mb) === kind);
    if (match && !seen.has(match)) {
      seen.add(match);
      picked.push({ kind, name: match });
    }
  }
  return picked;
}

function isTauriRuntime(): boolean {
  // Tauri v2 typically exposes `__TAURI__` (not always `__TAURI_INTERNALS__`).
  return "__TAURI__" in window || "__TAURI_INTERNALS__" in window;
}

async function aiCacheKeySegment(): Promise<string> {
  if (!isTauriRuntime()) return "none";
  try {
    const s = await withTimeout(invoke<string>("ai_cache_llm_segment", {}), BOOT_INVOKE_TIMEOUT_MS);
    return (s ?? "none").trim() || "none";
  } catch {
    return "none";
  }
}

function isSavedDraftsVirtualMailbox(mb: string | undefined): boolean {
  return String(mb ?? "").trim() === LOCAL_SAVED_DRAFTS_MAILBOX;
}

function savedDraftIdFromThreadId(threadId: string): string | null {
  const tid = String(threadId ?? "");
  if (!tid.startsWith(SAVED_DRAFT_THREAD_PREFIX)) return null;
  const id = tid.slice(SAVED_DRAFT_THREAD_PREFIX.length).trim();
  return id.length ? id : null;
}

/**
 * Retrouve la boîte dans la liste renvoyée par le serveur (évite un faux « absent » si
 * la sélection diffère seulement par NFC ou par espaces significatifs vs affichage).
 */
function resolveMailboxInList(mailboxes: string[], selected: string | undefined): string | undefined {
  const sel = String(selected ?? "");
  if (!mailboxes.length) return undefined;
  if (mailboxes.includes(sel)) return sel;
  const nk = sel.normalize("NFC");
  for (const m of mailboxes) {
    if (m.normalize("NFC") === nk) return m;
  }
  const trimmed = sel.trim();
  if (!trimmed) return undefined;
  const trimMatches = mailboxes.filter((m) => m.trim() === trimmed);
  if (trimMatches.length === 1) return trimMatches[0];
  return undefined;
}

/** Aligne `#local:archive` sur le chemin IMAP réel (liste dossiers + clé logique). */
function resolveSearchMailboxPath(requested: string): string | null {
  const q = requested.trim();
  if (!q || isSavedDraftsVirtualMailbox(q)) return null;
  const mbs = state.mailboxes;
  const exact = resolveMailboxInList(mbs, q);
  if (exact) return exact;

  const wantKey = mailboxLogicalPathKey(q);
  const keyMatches = mbs.filter((m) => mailboxLogicalPathKey(m) === wantKey);
  if (keyMatches.length === 1) return keyMatches[0];
  if (keyMatches.length > 1) {
    return [...keyMatches].sort((a, b) => b.length - a.length)[0] ?? null;
  }

  const qlc = q.toLowerCase();
  const leafExact = mbs.filter((m) => (m.split("/").pop() ?? m).toLowerCase() === qlc);
  if (leafExact.length === 1) return leafExact[0];

  const partial = mbs.filter((m) => {
    const ml = m.toLowerCase();
    const leaf = (m.split("/").pop() ?? m).toLowerCase();
    return ml === qlc || leaf === qlc || ml.includes(qlc) || leaf.includes(qlc);
  });
  if (partial.length === 1) return partial[0];

  return q;
}

/** Aligné sur `mailbox_logical_path_key` (Rust) : `/` vs `.`, préfixe INBOX, trim par segment. */
function mailboxLogicalPathKeySegments(name: string): string[] {
  const normalized = String(name ?? "").normalize("NFC");
  const segs: string[] = [];
  for (const part of normalized.split(/[/.]/g)) {
    const t = part.trim();
    if (t) segs.push(t.toLowerCase());
  }
  if (segs[0] === "inbox") segs.shift();
  return segs;
}

function mailboxLogicalPathKey(name: string): string {
  return mailboxLogicalPathKeySegments(name).join("\0");
}

function mergeMailboxFolderStatsForUi(
  sidebarMailboxes: string[],
  rows: MailboxFolderStatsRow[]
): { unread: Record<string, number>; total: Record<string, number> } {
  const unread: Record<string, number> = {};
  const total: Record<string, number> = {};
  for (const mb of sidebarMailboxes) {
    const nk = mb.normalize("NFC");
    const exact = rows.find((r) => r.mailbox.normalize("NFC") === nk);
    if (exact) {
      unread[mb] = Math.max(0, Math.floor(Number(exact.unreadCount)) || 0);
      total[mb] = Math.max(0, Math.floor(Number(exact.totalThreads)) || 0);
      continue;
    }
    const k = mailboxLogicalPathKey(mb);
    const logicalMatches = rows.filter((r) => mailboxLogicalPathKey(r.mailbox) === k);
    if (logicalMatches.length === 1) {
      unread[mb] = Math.max(0, Math.floor(Number(logicalMatches[0].unreadCount)) || 0);
      total[mb] = Math.max(0, Math.floor(Number(logicalMatches[0].totalThreads)) || 0);
    }
  }
  return { unread, total };
}

/** Dossiers affichés dans la barre latérale (système IMAP + dossier courant si hors liste). */
function sidebarFolderNamesForCounts(): string[] {
  const folders = state.mailboxes.length ? state.mailboxes : ["INBOX"];
  const system = pickSystemMailboxes(folders);
  const names = system.map((x) => x.name);
  const sel = state.selectedMailbox?.trim();
  if (sel && !isSavedDraftsVirtualMailbox(sel) && !names.includes(sel)) {
    names.push(sel);
  }
  return names;
}

const LIST_FILTER_VALUES: State["listFilter"][] = ["all", "unread", "starred", "focused", "auto"];

function defaultListFilterFromPrefs(): State["listFilter"] {
  const raw = state.appPrefs.general.defaultListFilter;
  return LIST_FILTER_VALUES.includes(raw as State["listFilter"]) ? (raw as State["listFilter"]) : "all";
}

function renderInboxChipBadge(count: number): string {
  const n = Math.max(0, Math.floor(Number(count)) || 0);
  if (n <= 0) return "";
  return ` <span class="inbox-chip-badge">${n}</span>`;
}

/** Bloc explicatif Paramètres — visuellement distinct des lignes de réglage. */
function settingsExplainHtml(inner: string, kind: "lead" | "field" | "toggle" = "lead"): string {
  if (kind === "toggle") {
    return `<span class="settings-explain settings-explain--toggle"><span class="settings-explain__content">${inner}</span></span>`;
  }
  const tag = kind === "field" ? "p" : "aside";
  const role = kind === "lead" ? ' role="note"' : "";
  const kicker = kind === "lead" ? '<span class="settings-explain__kicker">À savoir</span>' : "";
  return `<${tag} class="settings-explain settings-explain--${kind}"${role}><span class="settings-explain__mark" aria-hidden="true">${
    kind === "field" ? "·" : "i"
  }</span><span class="settings-explain__content">${kicker}${inner}</span></${tag}>`;
}

/** Grille commune Paramètres : 1 ou 2 colonnes de cartes lisibles (pas de auto-fill étroit). */
function wrapSettingsPage(content: string, columns: 1 | 2 = 1): string {
  const cols = columns === 2 ? " settings-grid--2" : "";
  return `<div class="settings-page"><div class="settings-grid${cols}">${content}</div></div>`;
}

async function loadInboxFilterCounts(): Promise<void> {
  const account = currentAccount();
  const mb = state.view === "folderManager" ? folderManagerPanelMailbox() : state.selectedMailbox;
  if (!account?.id || !mb || isSavedDraftsVirtualMailbox(mb) || !isTauriRuntime()) {
    state.inboxFilterCounts = null;
    return;
  }
  try {
    const fc = await withTimeout(
      invoke<InboxFilterCounts>("mailbox_inbox_filter_counts", {
        accountId: account.id,
        mailbox: mb,
      }),
      BOOT_INVOKE_TIMEOUT_MS
    );
    state.inboxFilterCounts = {
      all: Math.max(0, Math.floor(Number(fc.all)) || 0),
      unread: Math.max(0, Math.floor(Number(fc.unread)) || 0),
      starred: Math.max(0, Math.floor(Number(fc.starred)) || 0),
      focused: Math.max(0, Math.floor(Number(fc.focused)) || 0),
      auto: Math.max(0, Math.floor(Number(fc.auto)) || 0),
    };
  } catch (e) {
    console.warn("mailbox_inbox_filter_counts", e);
    state.inboxFilterCounts = null;
  }
}

function renderFolderSidebarCountPill(mb: string): string {
  const u = state.mailboxUnread[mb] ?? 0;
  const t = state.mailboxTotal[mb] ?? 0;
  if (t <= 0 && u <= 0) return "";
  const title =
    u > 0
      ? `${t} conversation${t === 1 ? "" : "s"} · ${u} non lu${u === 1 ? "" : "s"}`
      : `${t} conversation${t === 1 ? "" : "s"} en cache`;
  return `<span class="folder-count folder-count-wrap" title="${escapeAttr(title)}"><span class="folder-count-num">${t}</span>${
    u > 0 ? `<span class="folder-count-unread" aria-label="${u} non lu${u === 1 ? "" : "s"}">${u}</span>` : ""
  }</span>`;
}

const DEFAULT_ACCOUNT_PROMPT_DISMISS_KEY = "rustymail.dismissDefaultAccountPrompt";

function defaultAccountIdFromPrefs(): string | undefined {
  const id = (state.appPrefs.general.defaultAccountId ?? "").trim();
  if (!id) return undefined;
  return state.accounts.some((a) => a.id === id) ? id : undefined;
}

/** Compte actif au démarrage (préférence), sinon premier compte disponible. */
function applyDefaultAccountFromPrefs(): void {
  const pref = defaultAccountIdFromPrefs();
  if (pref) {
    state.selectedAccountId = pref;
    return;
  }
  if (!state.selectedAccountId || !state.accounts.some((a) => a.id === state.selectedAccountId)) {
    state.selectedAccountId = state.accounts[0]?.id;
  }
}

/** Garde une boîte IMAP valide ; la boîte virtuelle brouillons reste si l’app est Tauri. */
function ensureValidSelectedMailbox(): void {
  if (isSavedDraftsVirtualMailbox(state.selectedMailbox) && isTauriRuntime()) return;
  if (!state.mailboxes.length) return;
  const resolved = resolveMailboxInList(state.mailboxes, state.selectedMailbox);
  if (resolved !== undefined) {
    if (resolved !== state.selectedMailbox) state.selectedMailbox = resolved;
    return;
  }
  state.selectedMailbox =
    preferredInboxMailboxName(state.mailboxes) ?? state.mailboxes[0] ?? "INBOX";
}

function shouldShowDefaultAccountPrompt(): boolean {
  if (!isTauriRuntime() || state.view !== "list") return false;
  if (state.accounts.length < 2) return false;
  if (defaultAccountIdFromPrefs()) return false;
  try {
    if (window.localStorage.getItem(DEFAULT_ACCOUNT_PROMPT_DISMISS_KEY) === "1") return false;
  } catch {
    /* ignore */
  }
  return true;
}

function renderDefaultAccountPromptBanner(): string {
  if (!shouldShowDefaultAccountPrompt()) return "";
  const prefId = defaultAccountIdFromPrefs();
  const opts = state.accounts
    .map((a) => {
      const label = (a.displayName || a.email || a.id).trim();
      const selected = prefId === a.id || (!prefId && a.id === state.selectedAccountId);
      return `<option value="${escapeAttr(a.id)}" ${selected ? "selected" : ""}>${escapeHtml(label)}</option>`;
    })
    .join("");
  return `
    <div class="inbox-brief-banner inbox-brief-banner--hint default-account-prompt" role="region" aria-label="Compte par défaut au démarrage">
      <div class="inbox-brief-banner__title">Compte à l’ouverture</div>
      <div class="inbox-brief-banner__text">
        <p>Vous avez <strong>${state.accounts.length} comptes</strong>. Choisissez celui ouvert par défaut au démarrage de RustyMail.</p>
        <div class="default-account-prompt__row">
          <select class="settings-ctl settings-ctl-select default-account-prompt__select" id="default-account-prompt-select" aria-label="Compte par défaut">
            ${opts}
          </select>
          <button type="button" class="primary-button" data-action="save-default-account-prompt">Enregistrer</button>
          <button type="button" class="ghost-button" data-action="dismiss-default-account-prompt">Plus tard</button>
          <button type="button" class="ghost-button" data-action="open-settings-default-account">Paramètres</button>
        </div>
      </div>
    </div>`;
}

async function persistDefaultAccountId(accountId: string): Promise<void> {
  const id = accountId.trim();
  if (!id || !state.accounts.some((a) => a.id === id)) {
    toast("Compte introuvable.");
    return;
  }
  if (!isTauriRuntime()) return;
  state.appPrefs.general.defaultAccountId = id;
  await withTimeout(invoke("set_app_prefs", { prefs: state.appPrefs }), MAIL_ACTION_TIMEOUT_MS);
}

async function switchActiveAccount(accountId: string): Promise<void> {
  const id = accountId.trim();
  if (!id || !state.accounts.some((a) => a.id === id)) return;
  state.selectedAccountId = id;
  state.mailboxes = await safeInvoke<string[]>("list_imap_mailboxes", { accountId: id }, [], BOOT_INVOKE_TIMEOUT_MS);
  ensureValidSelectedMailbox();
  state.search = "";
  state.searchDraft = "";
  state.searchNewsletterRule = null;
  state.searchModifiersTouched = false;
  state.activeSavedSearchId = null;
  state.activeSavedSearchId = null;
  mailboxDigestRequestGen++;
  state.mailboxBriefBannerHtml = "";
  state.mailboxActionBrief = null;
  state.mailboxDigestKey = "";
  state.mailboxDigestLive = false;
  state.mailboxDigestRefreshing = false;
  cancelMailboxDigestLiveDebounce();
  state.listFilter = defaultListFilterFromPrefs();
  await loadMailView(false);
  cancelMailboxDigestLiveDebounce();
  if (mailboxDigestSlotInList()) {
    void enqueueMailboxDigestRefreshWhenIdle(false);
  }
  await loadMailboxUnread();
  await refreshSavedDraftsMailboxCount();
  await loadAddressBookSidebarCount();
  await refreshSavedSearches(true);
  syncActivityRecordingPrefs();
  await refreshSuggestedSavedViews();
  state.selectedThreadId = state.threads[0]?.id;
  state.selectedThread = undefined;
}

/** Extrait l’addr-spec d’un From (« Nom » &lt;x@y&gt;, mailto:, ou x@y seul). */
function extractAddrSpec(raw: string): string {
  const t = raw.trim();
  if (!t) return "";
  const lo = t.lastIndexOf("<");
  const gc = t.lastIndexOf(">");
  if (lo !== -1 && gc > lo) {
    let inner = t.slice(lo + 1, gc).trim().replace(/^mailto:/i, "");
    if (inner.includes("@")) return inner;
  }
  const loose = t.match(/[^\s<>,;]+@[^\s<>,;]+/);
  return loose?.[0]?.replace(/[>,;]+$/, "") ?? "";
}

/** Lit data-rule même si dataset JS est vide (rebond sur getAttribute). */
function readNlButtonRule(host: HTMLElement | undefined): string {
  if (!host) return "";
  const fromDs = typeof host.dataset?.rule === "string" ? host.dataset.rule.trim() : "";
  if (fromDs) return fromDs;
  const attr = host.getAttribute("data-rule");
  return typeof attr === "string" ? attr.trim() : "";
}

/** Valeur envoyée au backend pour add/remove une règle depuis l’UI. */
function normalizeNlRuleInvokeInput(raw: string): string {
  const t = raw.trim();
  if (!t) return "";
  if (!t.includes("@")) return t.toLowerCase();
  const bare = extractAddrSpec(t) || t;
  return bare.trim().toLowerCase();
}

function hostSuffixMatch(host: string, domain: string): boolean {
  const h = host.trim().toLowerCase();
  const d = domain.trim().toLowerCase();
  if (!d) return false;
  return h === d || h.endsWith(`.${d}`);
}

function newsletterEmailListed(email: string): boolean {
  return firstMatchingNewsletterRule(email) !== null;
}

/** Email normalisé pour comparaison aux règles (après extraction addr-spec). */
function canonicalEmailForNlMatch(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const bare = extractAddrSpec(trimmed) || trimmed;
  if (!bare.includes("@")) return null;
  return normalizeNlRuleInvokeInput(bare);
}

function firstMatchingNewsletterRule(email: string): NewsletterRuleRow | null {
  const e = canonicalEmailForNlMatch(email);
  if (!e) return null;
  const at = e.lastIndexOf("@");
  if (at <= 0 || at === e.length - 1) return null;
  const local = e.slice(0, at);
  const host = e.slice(at + 1);
  for (const r of state.newsletterRules) {
    const d = r.domain.toLowerCase();
    const lp = (r.localPart ?? "*").toLowerCase();
    if (!hostSuffixMatch(host, d)) continue;
    if (lp === "*" || lp === local) return r;
  }
  return null;
}

function formatNewsletterRuleInput(r: NewsletterRuleRow): string {
  if ((r.localPart ?? "*").toLowerCase() === "*") return `*.${r.domain}`;
  return `${r.localPart}@${r.domain}`;
}

async function loadNewsletterRules(): Promise<void> {
  if (!isTauriRuntime()) {
    state.newsletterRules = [];
    return;
  }
  try {
    state.newsletterRules = await withTimeout(invoke<NewsletterRuleRow[]>("list_newsletter_rules"), MAIL_ACTION_TIMEOUT_MS);
  } catch (error) {
    console.error("list_newsletter_rules", error);
    state.newsletterRules = [];
  }
}

let tauriNativeDragDropUnlisten: (() => void) | undefined;
/** Évite double enregistrement ; si le 1er essai est trop tôt, `load` peut réessayer. */
let tauriNativeFileDropReady = false;

function tauriCurrentWebviewLabel(): string | undefined {
  try {
    const w = window as unknown as {
      __TAURI_INTERNALS__?: { metadata?: { currentWebview?: { label?: string } } };
    };
    const label = w.__TAURI_INTERNALS__?.metadata?.currentWebview?.label;
    return typeof label === "string" && label.trim() ? label.trim() : undefined;
  } catch {
    return undefined;
  }
}

function pathsFromTauriDragPayload(payload: unknown): string[] {
  if (payload === null || typeof payload !== "object") return [];
  const rec = payload as Record<string, unknown>;
  if (!Array.isArray(rec.paths)) return [];
  return rec.paths.map((x) => String(x).trim()).filter(Boolean);
}

function setComposerNativeDragHighlight(on: boolean): void {
  const shell = document.querySelector<HTMLElement>(".composer-mail-shell");
  const composeBody = document.querySelector<HTMLElement>(".composer-body");
  shell?.classList.toggle("composer-mail-shell--drag-over", on);
  composeBody?.classList.toggle("drag-over", on);
}

/** Fusionne les chemins absolus (Explorer) dans le brouillon ouvert. */
function applyNativeDroppedFilePaths(dropped: string[]): void {
  if (!dropped.length) return;
  if (state.view !== "compose" || !state.draft) {
    toast(`${dropped.length} fichier(s) détecté(s) — ouvrez le composeur pour les ajouter.`);
    return;
  }
  const merged = Array.from(new Set([...(state.draft.attachmentPaths ?? []), ...dropped]));
  state.draft.attachmentPaths = merged;
  const attachmentsField = document.querySelector<HTMLInputElement>("#compose-attachments");
  if (attachmentsField) attachmentsField.value = attachmentPathsJoinedForHiddenField(merged);
  toast(`${dropped.length} pièce(s) jointe(s) ajoutée(s).`);
  render();
}

/**
 * Explorateur Windows → chemins disque : événements `tauri://drag-*` (pas le drop HTML5).
 * Doit s’enregistrer après le 1er `invoke` (plugin event prêt) ; repli `listen` si `getCurrentWebview` échoue.
 */
async function bindTauriNativeFileDropAsync(): Promise<void> {
  if (!isTauriRuntime() || tauriNativeFileDropReady) return;

  for (let i = 0; i < 60 && !tauriCurrentWebviewLabel(); i++) {
    await new Promise((r) => window.setTimeout(r, 16));
  }

  tauriNativeDragDropUnlisten?.();
  tauriNativeDragDropUnlisten = undefined;

  const runDrop = (pathsRaw: string[]): void => {
    setComposerNativeDragHighlight(false);
    applyNativeDroppedFilePaths(pathsRaw);
  };

  try {
    const wv = getCurrentWebview();
    tauriNativeDragDropUnlisten = await wv.onDragDropEvent((event) => {
      const p = event.payload;
      if (p.type === "enter") {
        if (state.view === "compose") setComposerNativeDragHighlight(true);
        return;
      }
      if (p.type === "leave") {
        setComposerNativeDragHighlight(false);
        return;
      }
      if (p.type === "over") return;
      if (p.type === "drop") {
        const dropped = p.paths.map((x) => String(x).trim()).filter(Boolean);
        runDrop(dropped);
      }
    });
    tauriNativeFileDropReady = true;
    return;
  } catch (primary) {
    console.warn("[RustyMail] onDragDropEvent indisponible, repli listen()", primary);
  }

  try {
    const unsubs: Array<() => void> = [];
    unsubs.push(
      await listen(TauriEvent.DRAG_ENTER, () => {
        if (state.view === "compose") setComposerNativeDragHighlight(true);
      })
    );
    unsubs.push(
      await listen(TauriEvent.DRAG_LEAVE, () => {
        setComposerNativeDragHighlight(false);
      })
    );
    unsubs.push(
      await listen(TauriEvent.DRAG_DROP, (e) => {
        runDrop(pathsFromTauriDragPayload(e.payload));
      })
    );
    tauriNativeDragDropUnlisten = () => {
      for (const u of unsubs) u();
    };
    tauriNativeFileDropReady = true;
  } catch (fallback) {
    console.error("[RustyMail] drag-drop natif impossible", fallback);
  }
}

type ImapSyncResult = {
  mailbox: string;
  messageCount: number;
  threadCount: number;
  fetchedUids: number;
  /** Serveur a changé UIDVALIDITY : cache IMAP du dossier purgé et resync depuis le début. */
  uidValidityReset?: boolean;
  /** Messages locaux dont le flag \\Seen a été recalé sur la fenêtre récente. */
  flagsReconciled?: number;
};

type SyncMailboxAlias = {
  requested: string;
  syncedAs: string;
};

type MailboxSyncError = {
  mailbox: string;
  error: string;
};

type SyncMailboxesOutcome = {
  results: ImapSyncResult[];
  skippedNotOnServer?: string[];
  syncedMailboxAliases?: SyncMailboxAlias[];
  syncErrors?: MailboxSyncError[];
};

/** Aligné sur `ipc_guard::MAX_SYNC_MAILBOXES` (Tauri). */
const SYNC_MAILBOXES_BATCH_SIZE = 64;

function chunkStringList(items: string[], batchSize: number): string[][] {
  const out: string[][] = [];
  for (let i = 0; i < items.length; i += batchSize) {
    out.push(items.slice(i, i + batchSize));
  }
  return out;
}

function mergeSyncMailboxesOutcomes(a: SyncMailboxesOutcome, b: SyncMailboxesOutcome): SyncMailboxesOutcome {
  return {
    results: [...(a.results ?? []), ...(b.results ?? [])],
    skippedNotOnServer: Array.from(new Set([...(a.skippedNotOnServer ?? []), ...(b.skippedNotOnServer ?? [])])),
    syncedMailboxAliases: [...(a.syncedMailboxAliases ?? []), ...(b.syncedMailboxAliases ?? [])],
    syncErrors: [...(a.syncErrors ?? []), ...(b.syncErrors ?? [])],
  };
}

function syncInvokeTimeoutMs(mailboxCount: number): number {
  return Math.min(600_000, Math.max(SYNC_INVOKE_TIMEOUT_MS, 45_000 + mailboxCount * 2_500));
}

function accountForImapSync(): Account | undefined {
  if (state.view === "settings" && state.settingsTab === "accounts" && state.settingsSelectedAccountId !== "new") {
    return state.accounts.find((a) => a.id === state.settingsSelectedAccountId);
  }
  return currentAccount();
}

function syncAllAccountMailboxesRequested(options?: { allMailboxes?: boolean }): boolean {
  return (
    options?.allMailboxes === true ||
    (options?.allMailboxes !== false && state.view === "settings" && state.settingsTab === "accounts")
  );
}

async function safeInvoke<T>(command: string, args: Record<string, unknown> | undefined, fallback: T, timeoutMs: number = DEFAULT_INVOKE_TIMEOUT_MS): Promise<T> {
  try {
    return await withTimeout(invoke<T>(command, args), timeoutMs);
  } catch (error) {
    console.error(`Tauri command failed: ${command}`, error);
    return fallback;
  }
}

async function loadAccountsFromBackend(options?: { silent?: boolean; timeoutMs?: number }): Promise<boolean> {
  state.accountsLoadError = "";
  if (!isTauriRuntime()) {
    state.accounts = [];
    state.accountsLoadError =
      "Mode navigateur : pas de comptes ni de mails persistants. Lancez l’app bureau avec npm run tauri:dev.";
    if (!options?.silent) toast(state.accountsLoadError);
    return false;
  }
  try {
    const raw = await withTimeout(
      invoke<unknown[]>("list_accounts", {}),
      options?.timeoutMs ?? ACCOUNTS_BOOT_TIMEOUT_MS
    );
    state.accounts = (Array.isArray(raw) ? raw : [])
      .map((row) => normalizeAccountRow(row))
      .filter((a): a is Account => a !== null);
    if (!state.selectedAccountId || !state.accounts.some((a) => a.id === state.selectedAccountId)) {
      state.selectedAccountId = state.accounts[0]?.id;
    }
    return state.accounts.length > 0;
  } catch (error) {
    console.error("list_accounts", error);
    state.accounts = [];
    state.accountsLoadError = tauriErrorMessage(error);
    if (!options?.silent) {
      toast(`Impossible de charger les comptes : ${state.accountsLoadError}`);
    }
    return false;
  }
}

function renderAccountsRecoveryBanner(): string {
  if (state.accounts.length > 0) return "";
  const dbPath = state.lastAppPaths?.dbPath?.trim();
  const detail =
    state.accountsLoadError ||
    (isTauriRuntime() ?
      "Aucun compte dans la base locale — vos mails en cache peuvent être sur un autre fichier SQLite (voir Paramètres → Stockage)."
    : "Ouvrez RustyMail en mode Tauri (npm run tauri:dev), pas seulement le serveur Vite dans le navigateur.");
  return `
    <div class="accounts-recovery-banner surface-sm" role="alert">
      <strong>Compte introuvable</strong>
      <p class="dim" style="margin:8px 0 0;line-height:1.5;font-size:13px">${escapeHtml(detail)}</p>
      ${
        dbPath
          ? `<p class="dim" style="margin:8px 0 0;font-size:12px;word-break:break-all">Base : ${escapeHtml(dbPath)}</p>`
          : ""
      }
      <div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:12px">
        <button type="button" class="primary-button" data-action="settings">Paramètres → Comptes</button>
        <button type="button" class="ghost-button" data-action="reload-accounts">Réessayer le chargement</button>
        ${
          isTauriRuntime()
            ? `<button type="button" class="ghost-button" data-action="settings-tab" data-settings-tab="storage">Chemins disque</button>`
            : ""
        }
      </div>
    </div>`;
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => reject(new Error("Tauri command timeout")), timeoutMs);
    promise.then(
      (value) => {
        window.clearTimeout(timeout);
        resolve(value);
      },
      (error) => {
        window.clearTimeout(timeout);
        reject(error);
      }
    );
  });
}

/** Boîte affichée dans le panneau droit de la vue Dossiers (sans toucher la sidebar IMAP). */
function folderManagerPanelMailbox(): string | null {
  if (state.view !== "folderManager") return null;
  const mb = state.folderManager.selectedMailbox?.trim();
  return mb || null;
}

/** Navigation dossier dans le panneau FM, hors mode recherche explicite. */
function folderManagerBrowsingPanel(): boolean {
  return Boolean(folderManagerPanelMailbox()) && !isSearchActive();
}

/** Boîte effective pour la liste (panneau FM ou sidebar inbox). */
function listMailboxForPanel(): string {
  return folderManagerPanelMailbox() ?? state.selectedMailbox?.trim() ?? "INBOX";
}

function resetFolderManagerPanelSearchState(): void {
  state.listFilter = defaultListFilterFromPrefs();
}

/** Charge les fils pour le 1er compte + boîte sélectionnée; sans compte, tout le store local (démo). */
function listThreadsPayload(): { accountId: string; mailbox: string } | undefined {
  const account = currentAccount();
  if (!account) return undefined;
  if (state.view === "folderManager") {
    const mb = state.folderManager.selectedMailbox?.trim();
    if (!mb) return undefined;
    return { accountId: account.id, mailbox: mb };
  }
  return { accountId: account.id, mailbox: state.selectedMailbox || "INBOX" };
}

function currentAccount(): Account | undefined {
  return state.accounts.find((a) => a.id === state.selectedAccountId) ?? state.accounts[0];
}

/** Préfixe IMAP suggéré quand on crée un sous-dossier (dossier courant + « / »). */
function mailboxPathPrefixForCreate(): string {
  const m = (state.selectedMailbox ?? "").trim();
  if (!m || isSavedDraftsVirtualMailbox(m)) return "";
  return m.endsWith("/") ? m : `${m}/`;
}

/** Dossier `#local:…` dans la barre (brouillon) ou critère validé. */
function effectiveSearchMailboxPath(): string | null {
  const parsed = parseSearchBarDraft(state.searchDraft, state.newsletterRules);
  const fromDraft = parsed.mailboxPath?.trim();
  if (fromDraft && !isSavedDraftsVirtualMailbox(fromDraft)) {
    return resolveSearchMailboxPath(fromDraft);
  }
  const committed = state.searchMailboxPath?.trim();
  if (committed && !isSavedDraftsVirtualMailbox(committed)) return committed;
  return null;
}

function searchQueryUsesThreadsApi(): boolean {
  return Boolean(
    state.search.trim() ||
      state.searchSenders.length > 0 ||
      state.searchTags.length > 0 ||
      state.searchLanguageFilter?.trim()
  );
}

function searchQueryMailboxForList(): string {
  const explicit = searchMailboxForQuery();
  if (explicit) return explicit;
  const panelMb = folderManagerPanelMailbox();
  if (panelMb) return panelMb;
  return state.selectedMailbox?.trim() || "INBOX";
}

function searchMailboxForQuery(): string | null {
  const explicit = effectiveSearchMailboxPath();
  if (explicit) return explicit;
  if (state.searchScope === "mailbox") {
    const m = (folderManagerPanelMailbox() ?? state.selectedMailbox)?.trim();
    return m && !isSavedDraftsVirtualMailbox(m) ? m : "INBOX";
  }
  return null;
}

function searchAccountIdForQuery(): string {
  return (
    state.searchAccountOverrideId?.trim() ||
    state.selectedAccountId?.trim() ||
    currentAccount()?.id?.trim() ||
    ""
  );
}

function tagFamilyForInvoke(family: string): Tag["family"] {
  const f = family.trim().toLowerCase();
  if (f === "source") return "Source";
  if (f === "kind") return "Kind";
  if (f === "state") return "State";
  return "Entity";
}

function mergeSearchBarTag(raw: { family: string; value: string }): void {
  const value = raw.value.trim();
  if (!value) return;
  const family = tagFamilyForInvoke(raw.family);
  const key = `${family}:${value}`.toLowerCase();
  if (state.searchTags.some((t) => `${t.family}:${t.value}`.toLowerCase() === key)) return;
  state.searchTags.push({ family, value });
}

function addSearchSender(email: string): void {
  const c = canonicalEmailForNlMatch(email) ?? email.trim().toLowerCase();
  if (!c) return;
  if (!state.searchSenders.some((s) => s.toLowerCase() === c)) state.searchSenders.push(c);
}

function resolveAccountIdFromRef(ref: string): string | null {
  const q = ref.trim().toLowerCase();
  if (!q) return null;
  const hit = state.accounts.find(
    (a) =>
      a.id.toLowerCase() === q ||
      a.email.toLowerCase() === q ||
      a.email.toLowerCase().includes(q) ||
      (a.displayName ?? "").toLowerCase().includes(q)
  );
  return hit?.id ?? null;
}

async function refreshSearchTagCatalog(): Promise<void> {
  const accountId = currentAccount()?.id?.trim();
  if (!accountId || !isTauriRuntime()) {
    state.searchTagCatalog = [];
    return;
  }
  try {
    const rows = await withTimeout(
      invoke<Array<{ family: string; value: string }>>("list_search_tags", { accountId }),
      BOOT_INVOKE_TIMEOUT_MS
    );
    state.searchTagCatalog = (rows ?? []).map((t) => ({
      family: tagFamilyForInvoke(String(t.family ?? "entity")),
      value: String(t.value ?? "").trim(),
    })).filter((t) => t.value.length > 0);
  } catch (error) {
    console.error("list_search_tags", error);
    state.searchTagCatalog = [];
  }
}

function searchScopeLabel(): string {
  if (state.searchScope === "mailbox") {
    const mb = state.selectedMailbox || "INBOX";
    const { full } = threadMailboxListLabel(mb);
    return `Dossier affiché (barre latérale) : ${full}`;
  }
  return "Tout le compte";
}

function truncateSearchBadgeLabel(text: string, max = 26): string {
  const t = text.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

function searchScopeBadgeShort(): string {
  if (state.searchScope === "account") return "Compte";
  const mb = state.selectedMailbox || "INBOX";
  const { label } = threadMailboxListLabel(mb);
  return truncateSearchBadgeLabel(label, 20);
}

const SEARCH_LIST_FILTER_LABELS: Record<Exclude<State["listFilter"], "all">, string> = {
  unread: "Non lus",
  starred: "Suivis",
  focused: "Priorité",
  auto: "Auto",
};

function renderSearchBadgeChip(opts: {
  kind: string;
  label: string;
  title: string;
  action: string;
  dismissible?: boolean;
  dataEmail?: string;
  dataTag?: string;
}): string {
  const dismissible = opts.dismissible !== false;
  const suffix = dismissible
    ? `<span class="search-badge__x" aria-hidden="true">×</span>`
    : `<span class="search-badge__hint" aria-hidden="true">↕</span>`;
  const extra = [
    opts.dataEmail ? `data-email="${escapeAttr(opts.dataEmail)}"` : "",
    opts.dataTag ? `data-tag="${escapeAttr(opts.dataTag)}"` : "",
  ]
    .filter(Boolean)
    .join(" ");
  return `<button type="button" class="search-badge search-badge--${opts.kind}" role="listitem" data-action="${escapeAttr(opts.action)}" ${extra} title="${escapeAttr(opts.title)}"><span class="search-badge__label">${escapeHtml(opts.label)}</span>${suffix}</button>`;
}

function renderSearchBadgesHtml(): string {
  const parts: string[] = [];

  const q = state.search.trim();
  if (q) {
    const short = truncateSearchBadgeLabel(q, 24);
    parts.push(
      renderSearchBadgeChip({
        kind: "text",
        label: `« ${short} »`,
        title: `Texte : ${q}`,
        action: "clear-search-text",
      })
    );
  }

  for (const sender of state.searchSenders) {
    const at = sender.indexOf("@");
    const local = at >= 0 ? sender.slice(0, at) : sender;
    const isDomainOnly = at < 0 && sender.includes(".");
    parts.push(
      renderSearchBadgeChip({
        kind: "sender",
        label: isDomainOnly
          ? truncateSearchBadgeLabel(sender, 20)
          : `@${truncateSearchBadgeLabel(local, 18)}`,
        title: isDomainOnly ? `Domaine expéditeur : ${sender}` : `Contact : ${sender}`,
        action: "clear-search-sender-one",
        dataEmail: sender,
      })
    );
  }

  const explicitMb = effectiveSearchMailboxPath();
  if (explicitMb) {
    const { label, full } = threadMailboxListLabel(explicitMb);
    parts.push(
      renderSearchBadgeChip({
        kind: "scope-mailbox",
        label: truncateSearchBadgeLabel(label, 18),
        title: label === full ? `Dossier : ${full}` : `Dossier : ${label} — ${full}`,
        action: "clear-search-mailbox",
      })
    );
  }

  if (state.searchAccountOverrideId?.trim()) {
    const acc = state.accounts.find((a) => a.id === state.searchAccountOverrideId);
    const label = acc?.email ?? state.searchAccountOverrideId;
    parts.push(
      renderSearchBadgeChip({
        kind: "scope-account",
        label: truncateSearchBadgeLabel(label, 20),
        title: `Compte : ${label}`,
        action: "clear-search-account",
      })
    );
  }

  for (const tag of state.searchTags) {
    const fam = String(tag.family).toLowerCase();
    parts.push(
      renderSearchBadgeChip({
        kind: "tags",
        label: truncateSearchBadgeLabel(`#${fam}:${tag.value}`, 24),
        title: `Tag ${fam}:${tag.value} — domaine expéditeur (source) ou dossier/type (kind)`,
        action: "clear-search-tag-one",
        dataTag: `${fam}:${tag.value}`,
      })
    );
  }

  if (state.searchNewsletterRule) {
    const rule = formatNewsletterRuleInput(state.searchNewsletterRule);
    parts.push(
      renderSearchBadgeChip({
        kind: "auto-rule",
        label: truncateSearchBadgeLabel(rule, 22),
        title: `Règle auto : ${rule}`,
        action: "clear-search-newsletter-rule",
      })
    );
  }

  const lf = state.listFilter;
  if (state.searchModifiersTouched && lf !== "all") {
    parts.push(
      renderSearchBadgeChip({
        kind: `filter-${lf}`,
        label: SEARCH_LIST_FILTER_LABELS[lf],
        title: "Retirer ce filtre de la recherche",
        action: "clear-search-list-filter",
      })
    );
  }

  if (state.searchNlMode || state.searchLanguageFilter) {
    const bits: string[] = [];
    if (state.searchNlMode) bits.push(`mode ${state.searchNlMode}`);
    if (state.searchLanguageFilter) bits.push(`langue ${state.searchLanguageFilter.toUpperCase()}`);
    parts.push(
      renderSearchBadgeChip({
        kind: "nl",
        label: truncateSearchBadgeLabel(`IA : ${bits.join(" · ") || "interprétation"}`, 28),
        title: "Recherche interprétée en langage naturel. Cliquez pour retirer les modificateurs IA.",
        action: "clear-search-nl-filters",
      })
    );
  }

  const lang = state.searchLanguageFilter?.trim();
  if (lang) {
    parts.push(
      renderSearchBadgeChip({
        kind: "language",
        label: lang.toUpperCase(),
        title: `Langue : ${lang}`,
        action: "clear-search-nl-filters",
      })
    );
  }

  /** Portée : Compte ↔ dossier de la barre latérale (pas le #local:… explicite). */
  if (!explicitMb && state.view !== "folderManager" && inboxSearchContextActive()) {
    parts.push(
      renderSearchBadgeChip({
        kind: state.searchScope === "account" ? "scope-account" : "scope-mailbox",
        label: searchScopeBadgeShort(),
        title: `${searchScopeLabel()} — cliquer pour basculer avec « tout le compte »`,
        action: "toggle-search-scope",
        dismissible: false,
      })
    );
  }

  if (
    state.searchSenders.length > 0 &&
    isTauriRuntime() &&
    isAiFeatureEnabled(state.appPrefs.ai, "featureThreadSummaryEnabled")
  ) {
    parts.push(
      `<button type="button" class="search-badge search-badge--summarize" role="listitem" data-action="summarize-sender-threads" title="Résumer le fil ouvert ou le contexte filtré"><span class="search-badge__label">Résumer</span></button>`
    );
  }

  if (parts.length === 0) return "";

  return `<div class="inbox-search-badges" role="list" aria-label="Critères de recherche actifs">${parts.join("")}</div>`;
}

function committedSearchCriteriaSnapshot(): SearchCriteriaSnapshot {
  return snapshotFromStructuralState(state);
}

function draftSearchCriteriaSnapshot(draft = state.searchDraft): SearchCriteriaSnapshot {
  const scratch: SearchStructuralState & { searchTags: Tag[] } = {
    search: "",
    searchSenders: [],
    searchTags: [],
    searchMailboxPath: null,
    searchAccountOverrideId: null,
    searchNewsletterRule: null,
    searchScope: "account",
    listFilter: "all",
    searchNlMode: null,
    searchLanguageFilter: null,
  };
  resetSearchStructuralState(scratch);
  const parsed = parseSearchBarDraft(draft.trim(), state.newsletterRules);
  applyParsedSearchBarToStructural(scratch, parsed);
  return snapshotFromStructuralState(scratch);
}

function canSaveSearchView(): boolean {
  if (!isTauriRuntime() || !searchAccountIdForQuery()) return false;
  if (state.activeSavedSearchId) return true;
  return hasCommittedSearchCriteria(committedSearchCriteriaSnapshot());
}

function canSaveSearchViewInModal(): boolean {
  if (!isTauriRuntime() || !searchAccountIdForQuery()) return false;
  if (canSaveSearchView()) return true;
  return hasCommittedSearchCriteria(draftSearchCriteriaSnapshot());
}

function renderSaveSearchViewButtonHtml(): string {
  if (!canSaveSearchView()) return "";
  return `<button type="button" class="search-save-view-btn" data-action="save-saved-search" title="Enregistrer ces critères comme vue dans la sidebar">Enregistrer la vue</button>`;
}

function renderSearchBarMetaRow(
  badgesHtml: string,
  trailingActionsHtml = "",
  opts?: { includeSaveButton?: boolean },
): string {
  const saveBtn = opts?.includeSaveButton !== false ? renderSaveSearchViewButtonHtml() : "";
  const actions = [saveBtn, trailingActionsHtml].filter(Boolean).join("");
  if (!badgesHtml && !actions) return "";
  return `<div class="search-bar-meta">
    ${badgesHtml ? `<div class="search-bar-meta__badges search-context-filters" aria-label="Critères actifs">${badgesHtml}</div>` : ""}
    ${actions ? `<div class="search-bar-meta__actions search-ctx-actions" role="toolbar">${actions}</div>` : ""}
  </div>`;
}

/** Met à jour badges / ↵ sans `render()` — préserve le curseur dans les champs de recherche. */
function syncSearchBarChrome(): void {
  const html = renderSearchBadgesHtml();
  const showPending = searchDraftDiffersFromCommitted();
  const pendingHtml = `<span class="inbox-search-pending dim" title="Entrée pour lancer la recherche">↵</span>`;

  document.querySelectorAll<HTMLElement>(".search-bar-stack, .search-ctx-stack").forEach((stack) => {
    const host =
      stack.querySelector(".search-context-filters") ??
      stack.querySelector(".search-bar-meta__badges") ??
      stack.querySelector(".search-ctx-badges") ??
      stack;
    const existing = host.querySelector(".inbox-search-badges");
    if (html) {
      if (existing) existing.outerHTML = html;
      else host.insertAdjacentHTML("beforeend", html);
    } else {
      existing?.remove();
    }

    const label = stack.querySelector("label.inbox-search");
    const input =
      label?.querySelector<HTMLInputElement>("input[type='search']") ??
      stack.querySelector<HTMLInputElement>("input[type='search']");
    if (!input) return;

    const pending = input.parentElement?.querySelector(".inbox-search-pending");
    if (showPending && !pending) {
      input.insertAdjacentHTML("afterend", pendingHtml);
    } else if (!showPending && pending) {
      pending.remove();
    }
  });
}

function renderSearchBarFieldHtml(inputId: string, opts?: { showSlashHint?: boolean }): string {
  const showSlash = opts?.showSlashHint !== false;
  const showNl =
    isTauriRuntime() && isAiFeatureEnabled(state.appPrefs.ai, "featureSearchNlEnabled");
  return `
    <label class="inbox-search surface-sm">
      ${inboxSearchIconSvg()}
      <input id="${escapeAttr(inputId)}" type="search" value="${escapeAttr(state.searchDraft)}" placeholder="Rechercher… Entrée · @contact · #local:dossier (Tab) · #compte" aria-label="Rechercher : Entrée pour valider · #local:nom ou #local:&quot;Perso/Archives&quot;" autocomplete="off" />
      ${searchDraftDiffersFromCommitted() ? `<span class="inbox-search-pending dim" title="Entrée pour lancer la recherche">↵</span>` : ""}
      ${
        showNl
          ? `<button type="button" class="inbox-search-nl ghost-button" data-action="search-nl-assist" title="Assistant : décrire la recherche en langage naturel (LLM)">NL</button>`
          : ""
      }
      ${showSlash ? `<span class="kbd">/</span>` : ""}
    </label>`;
}

function renderSearchBarStackHtml(
  inputId: string,
  opts?: { showSlashHint?: boolean; includeSaveButton?: boolean },
): string {
  const badges = renderSearchBadgesHtml();
  const meta = renderSearchBarMetaRow(badges, "", { includeSaveButton: opts?.includeSaveButton });
  return `<div class="inbox-search-stack search-bar-stack">${renderSearchBarFieldHtml(inputId, opts)}${meta}</div>`;
}

function inboxSearchContextActive(): boolean {
  if (isSavedDraftsVirtualMailbox(state.selectedMailbox)) return false;
  if (state.view === "folderManager" && folderManagerBrowsingPanel()) return false;
  if (state.activeSavedSearchId) return true;
  return hasCommittedSearchCriteria(committedSearchCriteriaSnapshot());
}

function activeSavedSearchItem(): SavedSearchListItem | undefined {
  const id = state.activeSavedSearchId;
  if (!id) return undefined;
  return state.savedSearches.find((s) => s.id === id);
}

function searchViewTargetsInbox(): boolean {
  const mb = (searchMailboxForQuery() ?? state.selectedMailbox ?? "INBOX").trim();
  const u = mb.toUpperCase();
  return u === "INBOX" || u.endsWith(".INBOX");
}

function searchViewCanOpenOrganizer(): boolean {
  return (
    inboxSearchContextActive() &&
    searchViewTargetsInbox() &&
    threadsVisibleInList().length >= 15
  );
}

function searchViewCanAffinerFlux(): boolean {
  return (
    isTauriRuntime() &&
    inboxSearchContextActive() &&
    isAiFeatureEnabled(state.appPrefs.ai, "featureOrgProposalsEnabled") &&
    threadsVisibleInList().length >= 5
  );
}

function patchSavedSearchNewCount(id: string, count: number, lastSeenAt?: string): void {
  const seen = lastSeenAt ?? new Date().toISOString();
  state.savedSearches = state.savedSearches.map((s) =>
    s.id === id ? { ...s, newCount: count, lastSeenAt: seen } : s,
  );
}

function renderSearchViewActionsHtml(visibleCount: number): string {
  if (!isTauriRuntime() || !inboxSearchContextActive()) return "";
  const n = Math.min(visibleCount, SAVED_VIEW_BATCH_MAX);
  const saved = activeSavedSearchItem();
  const btns: string[] = [];
  if (n > 0) {
    btns.push(
      `<button type="button" class="ghost-button search-ctx-btn" data-action="search-view-mark-read" title="Marquer comme lus (jusqu’à ${SAVED_VIEW_BATCH_MAX})">Lus</button>`,
    );
    btns.push(
      `<button type="button" class="ghost-button search-ctx-btn" data-action="search-view-archive" title="Archiver (jusqu’à ${SAVED_VIEW_BATCH_MAX})">Archiver</button>`,
    );
  }
  if (searchViewCanOpenOrganizer()) {
    btns.push(
      `<button type="button" class="ghost-button search-ctx-btn" data-action="search-view-open-organizer" title="Ouvrir Organiser V2 (structure boîte, sans rescan global)">Organiser</button>`,
    );
  }
  if (searchViewCanAffinerFlux()) {
    btns.push(
      `<button type="button" class="ghost-button search-ctx-btn search-ctx-btn--affiner" data-action="search-view-affiner" title="LLM : proposer un dossier IMAP pour ce flux (Propositions Organiser activées)">Affiner</button>`,
    );
  }
  if (state.activeSavedSearchId && saved && (saved.newCount ?? 0) > 0) {
    const marking = state.savedSearchMarkingSeenId === state.activeSavedSearchId;
    btns.push(
      marking
        ? `<button type="button" class="ghost-button search-ctx-btn search-ctx-btn--watch" disabled aria-busy="true">Marquage…</button>`
        : `<button type="button" class="ghost-button search-ctx-btn search-ctx-btn--watch" data-action="saved-search-mark-seen" title="Marquer la vue comme à jour (badge nouveaux)">+${saved.newCount} · vu</button>`,
    );
  }
  return btns.join("");
}

function renderInboxSearchContextBlock(visibleCount: number): string {
  const badges = renderSearchBadgesHtml();
  const actionBtns = renderSearchViewActionsHtml(visibleCount);
  const meta = renderSearchBarMetaRow(badges, actionBtns);
  return `<div class="search-ctx-stack search-bar-stack search-bar-stack--context" data-search-bar-root>
    ${renderSearchBarFieldHtml("search-input", { showSlashHint: true })}
    ${meta}
  </div>`;
}

function renderSearchModal(): string {
  if (!state.searchModalOpen) return "";
  return `
    <div class="modal-backdrop search-modal-backdrop" data-action="close-search-modal">
      <div class="modal surface-elevated search-modal modal-shell-stop-prop" role="dialog" aria-modal="true" aria-labelledby="search-modal-title">
        <div class="modal-header">
          <strong id="search-modal-title">Recherche</strong>
          <button type="button" class="icon-pill" data-action="close-search-modal" aria-label="Fermer">${iconSvg("close")}</button>
        </div>
        <div class="modal-body search-modal-body">
          <p class="dim search-modal-hint">Vous pouvez taper librement (« mails de Jean avec factures en 2024 »), ou utiliser la syntaxe avancée : <code>@contact</code>, <code>#local:dossier</code>, <code>#compte</code>, tags. <kbd class="kbd">Entrée</kbd> pour lancer.</p>
          ${renderSearchBarStackHtml("search-modal-input", { showSlashHint: false, includeSaveButton: false })}
        </div>
        <div class="modal-footer">
          ${canSaveSearchViewInModal() ? `<button type="button" class="search-save-view-btn" data-action="save-saved-search" title="Enregistrer la recherche comme vue">Enregistrer la vue</button>` : ""}
          <button type="button" class="ghost-button" data-action="close-search-modal">Fermer</button>
          <button type="button" class="primary-button" data-action="search-modal-commit" style="padding:9px 14px">Rechercher</button>
        </div>
      </div>
    </div>
  `;
}

function openSearchModal(): void {
  state.searchModalOpen = true;
  void refreshSearchTagCatalog();
  render();
}

function closeSearchModal(): void {
  if (!state.searchModalOpen) return;
  state.searchModalOpen = false;
  render();
}

function activeSearchInputElement(): HTMLInputElement | null {
  if (state.searchModalOpen) {
    return document.querySelector<HTMLInputElement>("#search-modal-input");
  }
  return document.querySelector<HTMLInputElement>("#search-input");
}

/** Charge la liste pour filtres `#` / contexte recherche (respecte `searchScope`). */
async function loadThreadsForSearchContext(append = false): Promise<void> {
  if (isSavedDraftsVirtualMailbox(listMailboxForPanel())) {
    await loadMailView(append);
    return;
  }
  const accountId = searchAccountIdForQuery();
  if (!accountId || !isTauriRuntime()) {
    state.threads = [];
    state.threadOffset = 0;
    state.hasMoreThreads = false;
    return;
  }
  const payload: Record<string, unknown> = {
    accountId,
    pageSize: state.threadPageSize,
    pageOffset: append ? state.threadOffset : 0,
    followedOnly: state.listFilter === "starred",
  };
  const explicitMb = effectiveSearchMailboxPath() ?? state.searchMailboxPath?.trim();
  if (state.searchScope === "account" && !explicitMb) {
    payload.accountWide = true;
  } else {
    payload.mailbox = searchQueryMailboxForList();
  }
  let page: ThreadListItem[];
  try {
    page = await withTimeout(invoke<ThreadListItem[]>("list_threads", payload), BOOT_INVOKE_TIMEOUT_MS);
    state.mailListError = "";
  } catch (error) {
    const detail = tauriErrorMessage(error);
    console.error("list_threads (search context)", error);
    state.mailListError = `Impossible de charger les conversations : ${detail}`;
    if (!append) {
      state.threads = [];
      state.threadOffset = 0;
      state.hasMoreThreads = false;
    }
    return;
  }
  if (append) {
    applyServerThreadPage(page, true);
  } else {
    applyServerThreadPage(page, false);
  }
  state.threadOffset = state.threads.length;
  state.hasMoreThreads = page.length >= state.threadPageSize;
  if (state.selectedThreadId && !state.threads.some((t) => t.id === state.selectedThreadId)) {
    state.selectedThreadId = state.threads[0]?.id;
    state.selectedThread = undefined;
  }
  scheduleMailboxDigestRefresh();
  scheduleIdleAiCachePrefetch();
}

/** Recharge la liste en conservant recherche texte / @ / # / portée compte si actifs. */
async function reloadCurrentThreadList(append = false): Promise<void> {
  if (isSavedDraftsVirtualMailbox(listMailboxForPanel())) {
    await loadMailView(append);
    return;
  }
  if (searchQueryUsesThreadsApi()) {
    await searchThreads();
    return;
  }
  if (usesSearchContextLoader() || isSearchActive()) {
    await loadThreadsForSearchContext(append);
    return;
  }
  await loadMailView(append);
}

async function applyListFilter(next: typeof state.listFilter): Promise<void> {
  state.listFilter = next;
  state.searchNewsletterRule = null;
  if (state.view !== "folderManager") {
    state.searchScope = "mailbox";
  }
  const mb = listMailboxForPanel();
  if (state.view === "folderManager" && !folderManagerPanelMailbox()) {
    render();
    return;
  }
  if (!isSavedDraftsVirtualMailbox(mb) && isTauriRuntime()) {
    if (isSearchActive()) {
      await searchThreads();
    } else {
      await loadMailView(false);
    }
    void loadInboxFilterCounts();
  }
  render();
}

async function loadMailView(append: boolean = false) {
  if (!append) invalidateIdleAiCachePrefetch();
  if (isSavedDraftsVirtualMailbox(state.selectedMailbox)) {
    if (append) return;
    const account = currentAccount();
    if (!account || !isTauriRuntime()) {
      state.threads = [];
      state.threadOffset = 0;
      state.hasMoreThreads = false;
      state.selectedThreadId = undefined;
      state.selectedThread = undefined;
      return;
    }
    try {
      const rows = await withTimeout(
        invoke<SavedDraftListItem[]>("saved_draft_list", { accountId: account.id, limit: 200 }),
        BOOT_INVOKE_TIMEOUT_MS
      );
      const mapped: ThreadListItem[] = rows.map((r) => ({
        id: `${SAVED_DRAFT_THREAD_PREFIX}${r.id}`,
        subject: r.title || "Sans objet",
        preview: "",
        participants: ["Brouillon"],
        lastActivity: r.updatedAt,
        messageCount: 0,
        unread: false,
        followed: false,
        pinned: false,
        tags: [],
        mailbox: LOCAL_SAVED_DRAFTS_MAILBOX,
        savedRevisionCount: Math.max(0, Number(r.revisionCount) || 0),
        savedCreatedAt: r.createdAt,
      }));
      state.threads = mapped;
      state.threadOffset = mapped.length;
      state.hasMoreThreads = false;
      if (state.selectedThreadId && !state.threads.some((t) => t.id === state.selectedThreadId)) {
        state.selectedThreadId = state.threads[0]?.id;
        state.selectedThread = undefined;
      }
    } catch (error) {
      console.error("saved_draft_list", error);
      toast(`Liste des brouillons : ${tauriErrorMessage(error)}`);
      state.threads = [];
      state.threadOffset = 0;
      state.hasMoreThreads = false;
    }
    return;
  }

  const base = listThreadsPayload();
  if (!base) {
    if (!append) {
      state.threads = [];
      state.threadOffset = 0;
      state.hasMoreThreads = false;
    }
    return;
  }
  const payload = {
    ...base,
    pageSize: state.threadPageSize,
    pageOffset: append ? state.threadOffset : 0,
    /** Fils suivis : requête SQLite dédiée (tous dossiers), pas seulement la page du dossier courant. */
    followedOnly: state.listFilter === "starred"
  };
  let page: ThreadListItem[];
  if (!isTauriRuntime()) {
    state.mailListError =
      state.mailListError ||
      "Mode navigateur : les boîtes mail se chargent dans l’application Tauri (`npm run tauri:dev`).";
    page = [];
  } else {
    try {
      page = await withTimeout(invoke<ThreadListItem[]>("list_threads", payload), BOOT_INVOKE_TIMEOUT_MS);
      state.mailListError = "";
    } catch (error) {
      const detail = tauriErrorMessage(error);
      console.error("list_threads", error);
      state.mailListError = `Impossible de charger les conversations : ${detail}`;
      toast(state.mailListError);
      if (append) return;
      state.threads = [];
      state.threadOffset = 0;
      state.hasMoreThreads = false;
      if (state.selectedThreadId && !state.threads.some((t) => t.id === state.selectedThreadId)) {
        state.selectedThreadId = state.threads[0]?.id;
        state.selectedThread = undefined;
      }
      return;
    }
  }
  if (append) {
    applyServerThreadPage(page, true);
  } else {
    applyServerThreadPage(page, false);
  }
  state.threadOffset = state.threads.length;
  state.hasMoreThreads = page.length >= state.threadPageSize;
  if (state.selectedThreadId && !state.threads.some((t) => t.id === state.selectedThreadId)) {
    state.selectedThreadId = state.threads[0]?.id;
    state.selectedThread = undefined;
  }
  scheduleMailboxDigestRefresh();
  scheduleIdleAiCachePrefetch();
  void loadInboxFilterCounts().then(() => render());
}

async function loadMailboxUnread() {
  const account = currentAccount();
  if (!account) {
    state.mailboxUnread = {};
    state.mailboxTotal = {};
    return;
  }
  const folderList = sidebarFolderNamesForCounts();
  let rows: MailboxFolderStatsRow[] = [];
  try {
    rows = await withTimeout(
      invoke<MailboxFolderStatsRow[]>("mailbox_unread_counts", {
        accountId: account.id,
        mailboxes: folderList,
      }),
      BOOT_INVOKE_TIMEOUT_MS
    );
  } catch (error) {
    console.warn("mailbox_unread_counts (sidebar)", error);
    rows = await safeInvoke<MailboxFolderStatsRow[]>(
      "mailbox_unread_counts",
      { accountId: account.id },
      [],
      BOOT_INVOKE_TIMEOUT_MS
    );
  }
  const { unread, total } = mergeMailboxFolderStatsForUi(folderList, rows);
  state.mailboxUnread = unread;
  state.mailboxTotal = total;
  void loadInboxFilterCounts();
}

async function refreshLlmRuntimeStatus(forceHardwareRescan?: boolean): Promise<void> {
  if (!isTauriRuntime()) {
    state.llmRuntimeStatus = null;
    state.llmCachedGgufFilenames = [];
    return;
  }
  try {
    state.llmRuntimeStatus = await withTimeout(
      invoke<LlmRuntimeStatus>(forceHardwareRescan ? "llm_status_refresh_hardware" : "llm_status", {}),
      MAIL_ACTION_TIMEOUT_MS,
    );
  } catch {
    state.llmRuntimeStatus = null;
  }
  try {
    state.llmCachedGgufFilenames = await withTimeout(invoke<string[]>("list_cached_gguf_models", {}), 10_000);
  } catch {
    state.llmCachedGgufFilenames = [];
  }
}

function syncAiEngineSettingsTabFromPrefs(): void {
  state.aiEngineSettingsTab = engineConnectionMode(state.appPrefs.ai);
}

async function autoDetectLlamaServerBinary(opts?: { silent?: boolean; persist?: boolean }): Promise<boolean> {
  if (!isTauriRuntime()) return false;
  const prev = state.appPrefs.ai.llamaServerBinaryPath.trim();
  try {
    const det = await invoke<{
      onPath: boolean;
      wingetInstalled: boolean;
      resolvedPath?: string | null;
    }>("llama_server_detect", {
      binaryHint: prev || "llama-server",
    });
    let next = prev;
    if (det.resolvedPath?.trim()) {
      next = det.resolvedPath.trim();
    } else if ((det.onPath || det.wingetInstalled) && !prev) {
      next = "llama-server";
    }
    if (next && next !== prev) {
      state.appPrefs.ai.llamaServerBinaryPath = next;
      if (opts?.persist !== false) {
        await withTimeout(invoke("set_app_prefs", { prefs: state.appPrefs }), MAIL_ACTION_TIMEOUT_MS);
      }
      if (!opts?.silent) toast(`llama-server : ${next}`);
      return true;
    }
    if (!opts?.silent && (det.onPath || det.wingetInstalled)) {
      toast(`llama-server détecté${det.resolvedPath ? ` (${det.resolvedPath})` : ""}.`);
    } else if (!opts?.silent && !det.onPath && !det.wingetInstalled) {
      toast("llama-server introuvable (PATH et winget).");
    }
  } catch (e) {
    if (!opts?.silent) toast(tauriErrorMessage(e));
  }
  return false;
}

async function openEnginesAiSettingsModal(): Promise<void> {
  state.settingsAiModal = "engines";
  syncAiEngineSettingsTabFromPrefs();
  await autoDetectLlamaServerBinary({ silent: true });
  await refreshLlmRuntimeStatus(false);
  render();
}

function applyContextSliderIndex(idx: number): void {
  const clamped = Math.max(0, Math.min(LLM_CONTEXT_PRESETS.length - 1, Math.trunc(idx)));
  const n = LLM_CONTEXT_PRESETS[clamped] ?? 4096;
  state.appPrefs.ai.localLlmContextSize = n;
  const hidden = document.querySelector<HTMLInputElement>("#prefs-local-llm-ctx");
  const display = document.querySelector<HTMLElement>("#prefs-local-llm-ctx-display");
  const range = document.querySelector<HTMLInputElement>("#prefs-local-llm-ctx-range");
  if (hidden) hidden.value = String(n);
  if (display) display.textContent = String(n);
  if (range) range.value = String(clamped);
  document.querySelectorAll<HTMLElement>(".settings-ctx-slider__tick").forEach((el, i) => {
    el.classList.toggle("settings-ctx-slider__tick--active", i === clamped);
  });
}

async function persistEngineCheckboxToggle(message: string): Promise<void> {
  if (!isTauriRuntime()) return;
  try {
    await withTimeout(invoke("set_app_prefs", { prefs: state.appPrefs }), MAIL_ACTION_TIMEOUT_MS);
    toast(message);
    await refreshLlmRuntimeStatus(false);
    if (state.settingsAiModal === "engines") render();
  } catch (e) {
    toast(tauriErrorMessage(e));
  }
}

async function refreshSavedDraftsMailboxCount(): Promise<void> {
  const accountId = currentAccount()?.id?.trim();
  if (!accountId || !isTauriRuntime()) {
    state.savedDraftsMailboxCount = 0;
    return;
  }
  try {
    const n = await withTimeout(invoke<number>("saved_drafts_count", { accountId }), BOOT_INVOKE_TIMEOUT_MS);
    state.savedDraftsMailboxCount =
      typeof n === "number" && Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0;
  } catch {
    state.savedDraftsMailboxCount = 0;
  }
}

/** Compteurs `message_embeddings` pour l’affiche Réglages → IA & dictée (même périmètre que la recherche hybrid). */
async function refreshSemanticEmbeddingCounts(): Promise<void> {
  if (!isTauriRuntime()) {
    state.semanticEmbeddingCounts = null;
    return;
  }
  const account = currentAccount();
  const aid = account?.id?.trim();
  const mailbox = state.selectedMailbox || "INBOX";
  if (!aid || !mailbox) {
    state.semanticEmbeddingCounts = null;
    return;
  }
  try {
    state.semanticEmbeddingCounts = await withTimeout(
      invoke<SemanticEmbeddingCountsSnapshot>("semantic_embedding_counts", { accountId: aid, mailbox }),
      MAIL_ACTION_TIMEOUT_MS
    );
  } catch {
    state.semanticEmbeddingCounts = null;
  }
  if (state.view === "settings" && state.settingsTab === "ai") {
    render();
  }
}

async function switchMailbox(nextMailbox: string) {
  if (state.view === "folderManager") return;
  // Sidebar navigation while reading a thread should return to list view.
  // Otherwise we can stay on `view=thread` with no loaded thread and show "Fil indisponible…".
  if (
    state.view === "thread" ||
    state.view === "contacts" ||
    state.view === "contact" ||
    state.view === "settings" ||
    state.view === "organization" ||
    state.view === "organizationV2" ||
    state.view === "compose"
  ) {
    navReset();
    state.view = "list";
    state.selectedThread = undefined;
    state.selectedThreadId = undefined;
    state.selectedContactEmail = undefined;
    state.aiOpen = false;
    clearThreadAiSummaryState();
  }
  state.selectedMailbox = nextMailbox || "INBOX";
  exitSearchModeForMailboxBrowse();
  state.searchScope = "mailbox";
  state.listFilter = defaultListFilterFromPrefs();
  mailboxDigestRequestGen++;
  state.mailboxBriefBannerHtml = "";
  state.mailboxActionBrief = null;
  state.mailboxDigestKey = "";
  state.mailboxDigestLive = false;
  state.mailboxDigestRefreshing = false;
  cancelMailboxDigestLiveDebounce();
  invalidateIdleAiCachePrefetch();
  await loadMailView(false);
  cancelMailboxDigestLiveDebounce();
  if (mailboxDigestSlotInList()) {
    void enqueueMailboxDigestRefreshWhenIdle(false);
  }
  await refreshSavedDraftsMailboxCount();
  if (!state.threads.some((t) => t.id === state.selectedThreadId)) {
    state.selectedThreadId = state.threads[0]?.id;
    state.selectedThread = undefined;
  }
  render();
}

/** Corbeille / archivage IMAP + mise à jour SQLite (UID MOVE). */
async function onThreadMove(
  kind: "trash" | "archive",
  threadId: string,
  mailboxOverride?: string,
) {
  if (!threadId.trim()) return;
  if (savedDraftIdFromThreadId(threadId)) {
    toast("Archive / corbeille : actions IMAP uniquement.");
    return;
  }
  if (!isTauriRuntime()) {
    toast("Déplacer un fil : IMAP requiert l’app Tauri.");
    return;
  }
  const account = currentAccount();
  if (!account) {
    toast("Configurez d’abord un compte IMAP.");
    return;
  }
  const mailbox = mailboxOverride?.trim() || sourceMailboxForThread(threadId);
  const cmd = kind === "trash" ? "move_thread_trash" : "move_thread_archive";
  const prevThreads = state.threads;
  const prevSelectedId = state.selectedThreadId;
  const prevView = state.view;
  const prevOrgReport = state.organization.report;
  markThreadsRecentlyRemoved([threadId]);
  state.threads = state.threads.filter((t) => t.id !== threadId);
  if (state.view === "thread" && state.selectedThreadId === threadId) {
    state.view = "list";
    state.selectedThread = undefined;
    state.selectedThreadId = undefined;
  }
  if (state.view === "organization" && state.organization.report) {
    state.organization.report = optimisticOrgRemoveThreads(state.organization.report, [threadId]);
  }
  render();
  try {
    const msg = await withTimeout(
      invoke<string>(cmd, { accountId: account.id, mailbox, threadId }),
      MAIL_ACTION_TIMEOUT_MS
    );
    toast(msg);
    void loadMailboxUnread();
    if (!state.selectedThreadId) state.selectedThreadId = state.threads[0]?.id;
    render();
    if (state.view === "organization") void refreshOrganizationReport();
  } catch (err) {
    console.error(cmd, err);
    clearThreadsRecentlyRemoved([threadId]);
    state.threads = prevThreads;
    state.selectedThreadId = prevSelectedId;
    state.view = prevView;
    state.organization.report = prevOrgReport;
    toast(tauriErrorMessage(err));
    render();
  }
}

async function bulkTrashVisibleThreads(): Promise<void> {
  if (!isTauriRuntime()) {
    toast("Corbeille : IMAP requiert l’app Tauri.");
    return;
  }
  const account = currentAccount();
  if (!account) {
    toast("Configurez d’abord un compte IMAP.");
    return;
  }
  if (isSavedDraftsVirtualMailbox(state.selectedMailbox)) {
    toast("Corbeille : actions IMAP uniquement.");
    return;
  }
  if (mailboxKind(state.selectedMailbox || "") === "trash") {
    toast("Utilisez « Vider la corbeille » dans ce dossier.");
    return;
  }
  if (isSearchActive()) {
    toast("Tout supprimer : désactivé pendant une recherche. Retirez les filtres de recherche d’abord.");
    return;
  }
  const visible = threadsVisibleInList();
  if (!visible.length) {
    toast("Aucune conversation à supprimer dans cette vue.");
    return;
  }
  const lf = state.listFilter;
  const filterLabel =
    lf === "unread"
      ? "Non lus"
      : lf === "focused"
        ? "Priorité"
        : lf === "auto"
          ? "Auto"
          : lf === "starred"
            ? "Suivis"
            : "Tout";
  const ok = await openConfirmModal({
    title: "Tout mettre à la corbeille ?",
    body: `Déplacer vers la corbeille toutes les conversations actuellement affichées dans « ${filterLabel} » (${visible.length}).`,
    danger: true,
    confirmLabel: "Tout supprimer",
  });
  if (!ok) return;

  const prevThreads = state.threads;
  const prevSelectedId = state.selectedThreadId;
  const prevView = state.view;
  const prevOrgReport = state.organization.report;

  const ids = visible.map((t) => String(t.id));
  markThreadsRecentlyRemoved(ids);
  state.threads = state.threads.filter((t) => !ids.includes(String(t.id)));
  if (state.view === "thread" && state.selectedThreadId && ids.includes(String(state.selectedThreadId))) {
    state.view = "list";
    state.selectedThread = undefined;
    state.selectedThreadId = undefined;
  }
  if (state.view === "organization" && state.organization.report) {
    state.organization.report = optimisticOrgRemoveThreads(state.organization.report, ids);
  }
  render();

  let moved = 0;
  const errors: string[] = [];
  const total = ids.length;
  upsertStatusBarJob({ id: "bulk-trash", label: "Corbeille (lot)", done: 0, total }, true);
  try {
    for (let i = 0; i < ids.length; i++) {
      const tid = ids[i]!;
      try {
        const mailbox = sourceMailboxForThread(tid);
        await withTimeout(
          invoke<string>("move_thread_trash", { accountId: account.id, mailbox, threadId: tid }),
          MAIL_ACTION_TIMEOUT_MS
        );
        moved++;
      } catch (err) {
        errors.push(`${tid}: ${tauriErrorMessage(err)}`);
      }
      upsertStatusBarJob({ id: "bulk-trash", label: "Corbeille (lot)", done: i + 1, total });
    }
  } finally {
    clearStatusBarJob("bulk-trash");
  }

  if (errors.length) {
    // On restaure l’état pour éviter une vue incohérente.
    clearThreadsRecentlyRemoved(ids);
    state.threads = prevThreads;
    state.selectedThreadId = prevSelectedId;
    state.view = prevView;
    state.organization.report = prevOrgReport;
    toast(`Échec corbeille (lot) : ${errors[0]}${errors.length > 1 ? "…" : ""}`);
    render();
    return;
  }

  toast(`${moved} conversation${moved === 1 ? "" : "s"} déplacée${moved === 1 ? "" : "s"} dans la corbeille.`);
  void loadMailboxUnread();
  // Recharge pour recalculer compteurs + cohérence.
  await loadMailView(false);
  render();
}

/** Vide la corbeille (IMAP \\Deleted + EXPUNGE, puis nettoyage SQLite). */
async function onEmptyTrashMailbox() {
  if (!isTauriRuntime()) {
    toast("Vider la corbeille : disponible dans l’app Tauri.");
    return;
  }
  const account = currentAccount();
  if (!account) {
    toast("Configurez d’abord un compte IMAP.");
    return;
  }
  const mailbox = state.selectedMailbox || "";
  if (mailboxKind(mailbox) !== "trash") {
    toast("Ouvrez d’abord le dossier corbeille.");
    return;
  }
  if (state.threads.length === 0) {
    toast("La corbeille est déjà vide.");
    return;
  }
  const ok = await openConfirmModal({
    title: "Vider la corbeille ?",
    body: "Supprimer définitivement tous les messages de ce dossier corbeille ? Cette action est irréversible côté serveur.",
    danger: true,
    confirmLabel: "Tout supprimer",
  });
  if (!ok) return;
  try {
    const msg = await withTimeout(
      invoke<string>("empty_trash_mailbox_cmd", { accountId: account.id, mailbox, destructiveAck: "empty-trash" }),
      MAIL_ACTION_TIMEOUT_MS
    );
    toast(msg);
    if (state.view === "thread") {
      state.view = "list";
      state.selectedThread = undefined;
      state.selectedThreadId = undefined;
    }
    await loadMailView();
    await loadMailboxUnread();
    state.selectedThreadId = state.threads[0]?.id;
    render();
  } catch (err) {
    console.error("empty_trash_mailbox_cmd", err);
    toast(tauriErrorMessage(err));
    render();
  }
}

function openMoveDialog(threadId: string) {
  state.moveThreadId = threadId;
  const source = sourceMailboxForThread(threadId).toLowerCase();
  const allowed = mailboxesAllowedForMove(state.mailboxes).filter((m) => m.toLowerCase() !== source);
  state.moveTargetMailbox = allowed.includes("INBOX") ? "INBOX" : (allowed[0] ?? "INBOX");
  state.moveOpen = true;
  render();
}

/** Source IMAP réelle du fil ouvert : utile en recherche multi-dossiers où `selectedMailbox` ne suffit pas. */
function sourceMailboxForThread(threadId: string): string {
  const row = state.threads.find((t) => String(t.id) === String(threadId));
  const raw = row?.mailbox ?? state.selectedMailbox ?? "INBOX";
  const trimmed = String(raw ?? "").trim();
  return trimmed && trimmed !== LOCAL_SAVED_DRAFTS_MAILBOX ? trimmed : (state.selectedMailbox || "INBOX");
}

/** Déplace un fil vers `destMailbox`. Source : dossier réel du fil (pas de la sélection courante). */
async function onThreadMoveTo(threadId: string, destMailbox: string) {
  const tid = String(threadId ?? "").trim();
  const dest = String(destMailbox ?? "").trim();
  if (!tid || !dest) return;
  if (savedDraftIdFromThreadId(tid)) {
    toast("Déplacer : disponible pour les mails IMAP, pas pour les brouillons sauvegardés.");
    return;
  }
  if (!isTauriRuntime()) {
    toast("Déplacer un fil : IMAP requiert l’app Tauri.");
    return;
  }
  const account = currentAccount();
  if (!account) {
    toast("Configurez d’abord un compte IMAP.");
    return;
  }
  const source = sourceMailboxForThread(tid);
  if (dest.toLowerCase() === source.toLowerCase()) return;
  const prevThreads = state.threads;
  const prevSelectedId = state.selectedThreadId;
  const prevView = state.view;
  const prevOrgReport = state.organization.report;
  markThreadsRecentlyRemoved([tid]);
  state.threads = state.threads.filter((t) => t.id !== tid);
  if (state.view === "thread" && state.selectedThreadId === tid) {
    state.view = "list";
    state.selectedThread = undefined;
    state.selectedThreadId = undefined;
  }
  if (state.view === "organization" && state.organization.report) {
    state.organization.report = optimisticOrgRemoveThreads(state.organization.report, [tid]);
  }
  render();
  try {
    const msg = await withTimeout(
      invoke<string>("move_thread_mailbox", {
        accountId: account.id,
        mailbox: source,
        threadId: tid,
        destMailbox: dest,
      }),
      MAIL_ACTION_TIMEOUT_MS
    );
    toast(msg);
    state.moveOpen = false;
    state.moveThreadId = undefined;
    void loadMailboxUnread();
    if (!state.selectedThreadId) state.selectedThreadId = state.threads[0]?.id;
    render();
    if (state.view === "organization") void refreshOrganizationReport();
  } catch (err) {
    console.error("move_thread_mailbox", err);
    clearThreadsRecentlyRemoved([tid]);
    state.threads = prevThreads;
    state.selectedThreadId = prevSelectedId;
    state.view = prevView;
    state.organization.report = prevOrgReport;
    toast(tauriErrorMessage(err));
    render();
  }
}

async function confirmMoveDialog() {
  const threadId = state.moveThreadId;
  if (!threadId) return;
  await onThreadMoveTo(threadId, state.moveTargetMailbox);
}

async function mailboxManageAction(kind: "create" | "rename" | "delete" | "subscribe") {
  if (!isTauriRuntime()) {
    toast("Mailbox : disponible seulement dans l’app Tauri.");
    return;
  }
  const account = currentAccount();
  if (!account) {
    toast("Configurez d’abord un compte IMAP.");
    return;
  }
  if (kind !== "create" && isSavedDraftsVirtualMailbox(state.selectedMailbox)) {
    toast("Les dossiers IMAP ne s’appliquent pas aux brouillons locaux.");
    return;
  }
  try {
    let msg = "";
    if (kind === "create") {
      const prefix = mailboxPathPrefixForCreate();
      const def = prefix || "";
      const bodyHint = [
        prefix ? `Préfixe depuis le dossier sélectionné : ${prefix}` : "",
        `Ex. sous « ${state.selectedMailbox || "INBOX"} » : nom du sous-dossier ou chemin complet (séparateur /).`,
      ]
        .filter(Boolean)
        .join("\n");
      const name =
        (await openTextPromptModal({
          title: "Créer un dossier IMAP",
          body: bodyHint,
          label: "Chemin du dossier",
          defaultValue: def,
        }))?.trim() ?? "";
      if (!name) return;
      msg = await withTimeout(invoke<string>("create_imap_mailbox", { accountId: account.id, mailbox: name }), MAIL_ACTION_TIMEOUT_MS);
    } else if (kind === "rename") {
      const from = state.selectedMailbox || "INBOX";
      const to =
        (await openTextPromptModal({
          title: "Renommer le dossier",
          body: `Dossier actuel : ${from}`,
          label: "Nouveau chemin IMAP",
          defaultValue: "",
        }))?.trim() ?? "";
      if (!to) return;
      msg = await withTimeout(invoke<string>("rename_imap_mailbox", { accountId: account.id, fromMailbox: from, toMailbox: to }), MAIL_ACTION_TIMEOUT_MS);
    } else if (kind === "delete") {
      const m = state.selectedMailbox || "INBOX";
      const ok = await openConfirmModal({
        title: "Supprimer ce dossier IMAP ?",
        body: `La mailbox « ${m} » sera supprimée côté serveur. Opération irréversible.`,
        danger: true,
        confirmLabel: "Supprimer",
      });
      if (!ok) return;
      msg = await withTimeout(
        invoke<string>("delete_imap_mailbox", {
          accountId: account.id,
          mailbox: m,
          destructiveAck: "delete-mailbox",
        }),
        MAIL_ACTION_TIMEOUT_MS
      );
    } else if (kind === "subscribe") {
      const m = state.selectedMailbox || "INBOX";
      msg = await withTimeout(invoke<string>("subscribe_imap_mailbox", { accountId: account.id, mailbox: m }), MAIL_ACTION_TIMEOUT_MS);
    }
    toast(msg);
    state.mailboxes = await safeInvoke<string[]>("list_imap_mailboxes", { accountId: account.id }, [], BOOT_INVOKE_TIMEOUT_MS);
    ensureValidSelectedMailbox();
    state.mailboxManageOpen = false;
    await loadMailboxUnread();
    await loadMailView(false);
    render();
  } catch (err) {
    console.error("mailboxManageAction", err);
    toast(tauriErrorMessage(err));
    render();
  }
}

async function onThreadSeen(kind: "read" | "unread", threadId: string) {
  if (!threadId.trim()) return;
  if (savedDraftIdFromThreadId(threadId)) {
    toast("Marquer lu / non lu : disponible pour les mails IMAP, pas pour les brouillons sauvegardés.");
    return;
  }
  if (!isTauriRuntime()) {
    toast("Marquer lu/non-lu : IMAP requiert l’app Tauri.");
    return;
  }
  const account = currentAccount();
  if (!account) {
    toast("Configurez d’abord un compte IMAP.");
    return;
  }
  const mailbox = sourceMailboxForThread(threadId);
  const cmd = kind === "read" ? "thread_mark_read" : "thread_mark_unread";
  try {
    const msg = await withTimeout(
      invoke<string>(cmd, { accountId: account.id, mailbox, threadId }),
      MAIL_ACTION_TIMEOUT_MS
    );
    toast(msg);
    await reloadCurrentThreadList(false);
    await loadMailboxUnread();
    if (state.view === "thread" && state.selectedThreadId === threadId) {
      const refreshed = await fetchOpenThreadOrNotify(threadId);
      if (refreshed) state.selectedThread = refreshed;
    }
    render();
  } catch (err) {
    console.error(cmd, err);
    toast(tauriErrorMessage(err));
    render();
  }
}

/** Bascule le drapeau « suivi » local du fil et rafraîchit la liste. */
async function onThreadToggleFollow(threadId: string) {
  const tid = String(threadId ?? "").trim();
  if (!tid) return;
  if (savedDraftIdFromThreadId(tid)) {
    toast("Suivre : disponible pour les mails IMAP, pas pour les brouillons sauvegardés.");
    return;
  }
  if (!isTauriRuntime()) {
    toast("Suivre un fil : requiert l’app Tauri.");
    return;
  }
  const account = currentAccount();
  if (!account) {
    toast("Configurez d’abord un compte IMAP.");
    return;
  }
  try {
    const next = await withTimeout(
      invoke<boolean>("thread_toggle_follow", { accountId: account.id, threadId: tid }),
      MAIL_ACTION_TIMEOUT_MS
    );
    for (const row of state.threads) {
      if (String(row.id) === tid) {
        row.followed = next;
        break;
      }
    }
    toast(next ? "Fil ajouté au suivi." : "Fil retiré du suivi.");
    render();
    await reloadCurrentThreadList(false);
    render();
  } catch (err) {
    console.error("thread_toggle_follow", err);
    toast(tauriErrorMessage(err));
    render();
  }
}

function tauriErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  if (error && typeof error === "object" && "message" in error && typeof (error as { message: unknown }).message === "string") {
    return (error as { message: string }).message;
  }
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

function micPermissionErrorMessage(error: unknown): string {
  const raw = tauriErrorMessage(error);
  const low = raw.toLowerCase();
  if (
    low.includes("permission denied") ||
    low.includes("notallowed") ||
    low.includes("permission") && low.includes("denied")
  ) {
    return (
      "Micro refusé par Windows ou la WebView. Ouvrez Paramètres Windows → Confidentialité → Microphone, " +
      "autorisez RustyMail, puis relancez l’app. Si le problème persiste, utilisez le bouton micro (clic) une fois."
    );
  }
  return `Micro inaccessible : ${raw}`;
}

async function requestMicStream(): Promise<MediaStream> {
  try {
    return await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch (e) {
    const low = tauriErrorMessage(e).toLowerCase();
    if (
      isTauriRuntime() &&
      (low.includes("permission") || low.includes("notallowed"))
    ) {
      try {
        await invoke("reset_webview_microphone_permission");
        return await navigator.mediaDevices.getUserMedia({ audio: true });
      } catch (retryErr) {
        throw retryErr;
      }
    }
    throw e;
  }
}

async function loadBootDeferredPrefs(): Promise<void> {
  if (!isTauriRuntime()) return;
  try {
    state.appPrefs = await withTimeout(invoke<AppPrefs>("get_app_prefs", {}), BOOT_INVOKE_TIMEOUT_MS);
    state.appPrefs.general = {
      ...defaultAppPrefs().general,
      ...state.appPrefs.general,
    };
    const prefAcc = (state.appPrefs.general.defaultAccountId ?? "").trim();
    if (prefAcc && !state.accounts.some((a) => a.id === prefAcc)) {
      delete state.appPrefs.general.defaultAccountId;
    }
    state.appPrefs.ai = normalizeAiPrefsMerged({
      ...defaultAppPrefs().ai,
      ...state.appPrefs.ai,
    });
    syncMailboxDigestPanelWithFeaturePref();
    setLocale(state.appPrefs.general.motherLanguage ?? "fr");
    state.dictationApiKeySet = await withTimeout(invoke<boolean>("dictation_api_key_status", {}), BOOT_INVOKE_TIMEOUT_MS);
    try {
      state.openrouterApiKeySet = await withTimeout(
        invoke<boolean>("openrouter_api_key_status", {}),
        BOOT_INVOKE_TIMEOUT_MS,
      );
    } catch {
      state.openrouterApiKeySet = false;
    }
    try {
      state.llamaServerApiKeySet = await withTimeout(
        invoke<boolean>("llama_server_api_key_status", {}),
        BOOT_INVOKE_TIMEOUT_MS,
      );
    } catch {
      state.llamaServerApiKeySet = false;
    }
    try {
      state.oauthGoogleConfigured = await withTimeout(
        invoke<boolean>("oauth_google_configured", {}),
        BOOT_INVOKE_TIMEOUT_MS,
      );
    } catch {
      state.oauthGoogleConfigured = false;
    }
    try {
      state.oauthMicrosoftConfigured = await withTimeout(
        invoke<boolean>("oauth_microsoft_configured", {}),
        BOOT_INVOKE_TIMEOUT_MS,
      );
    } catch {
      state.oauthMicrosoftConfigured = false;
    }
    try {
      state.semanticModelAvailable = await withTimeout(
        invoke<boolean>("semantic_model_available", {}),
        BOOT_INVOKE_TIMEOUT_MS
      );
    } catch {
      state.semanticModelAvailable = false;
    }

    if (!subscribedModelBootstrapProgress) {
      subscribedModelBootstrapProgress = true;
      void listen<{ phase?: string; percent?: number }>("model_bootstrap_progress", (e) => {
        const ph = e.payload?.phase ?? "";
        if (ph === "done" || ph === "minilm_done" || ph === "whisper_error") {
          void invoke<boolean>("semantic_model_available", {})
            .then((ok) => {
              state.semanticModelAvailable = ok;
              render();
            })
            .catch(() => {});
        }
        if (ph && ph !== "done") {
          toast(`Téléchargement modèles : ${ph}`);
        }
      });
      void listen<{ minilmOk?: boolean; whisperOk?: boolean; error?: string | null }>(
        "model_bootstrap_done",
        (e) => {
          if (e.payload?.minilmOk) state.semanticModelAvailable = true;
          state.appPrefs.general.bootstrapModelsCompleted = Boolean(
            e.payload?.minilmOk && e.payload?.whisperOk,
          );
          if (e.payload?.error) toast(e.payload.error);
          else if (e.payload?.minilmOk && e.payload?.whisperOk) {
            toast("Modèles légers (MiniLM + dictée) prêts.");
          }
          render();
        },
      );
    }
    if (!subscribedLlmPrefetchProgress) {
      subscribedLlmPrefetchProgress = true;
      void listen<{ percent?: number; phase?: string }>("llm_prefetch_progress", (e) => {
        const raw = typeof e.payload?.percent === "number" ? e.payload.percent : NaN;
        state.llmPrefetchPercent = Number.isFinite(raw)
          ? Math.min(100, Math.max(0, Math.round(raw)))
          : null;
        const ph = e.payload?.phase ?? "";
        if (ph === "done" || ph === "cancelled") {
          state.llmPrefetchPercent = null;
          state.llmPrefetchInFlight = false;
          paintLlmPrefetchProgressDom();
          paintStatusBarProgressDom();
          if (ph === "done") {
            void refreshLlmRuntimeStatus().then(() => {
              if (state.settingsAiModal === "engines") render();
            });
          } else if (state.settingsAiModal === "engines") {
            render();
          }
          return;
        }
        paintLlmPrefetchProgressDom();
        paintStatusBarProgressDom();
      });
    }
    void refreshLlmRuntimeStatus().then(() => {
      if (
        isMailboxDigestFeatureEnabled() &&
        state.mailboxDigestPanelOpen &&
        mailboxDigestPanelEligible()
      ) {
        const accountId = currentAccount()?.id?.trim();
        const mailbox = state.selectedMailbox || "INBOX";
        if (accountId) {
          state.mailboxActionBrief = null;
          state.mailboxBriefBannerHtml = buildMailboxBriefGateBannerHtml();
          state.mailboxDigestKey = `${accountId}|${mailbox}`;
          state.mailboxDigestRefreshing = false;
        }
      }
      render();
    });
    if (state.appPrefs.ai.localLlmEnabled && (state.appPrefs.ai.aiBackgroundLlmPrefetch || state.appPrefs.ai.llamaServerEnabled)) {
      void invoke("prefetch_llm_model", {}).catch(() => {});
    }
    maybeShowFirstRunWizard({
      prefs: state.appPrefs,
      toast,
      onDismiss: (p) => {
        state.appPrefs = p;
        void (async () => {
          try {
            await invoke("set_app_prefs", { prefs: state.appPrefs });
          } catch (e) {
            console.warn("first-run prefs", e);
          }
          render();
        })();
      },
    });
    applyDefaultAccountFromPrefs();
    const prefFilter = defaultListFilterFromPrefs();
    if (
      prefFilter !== state.listFilter &&
      state.view === "list" &&
      !isSearchActive() &&
      !isSavedDraftsVirtualMailbox(state.selectedMailbox ?? "")
    ) {
      await applyListFilter(prefFilter);
    }
  } catch (e) {
    console.error("app prefs", e);
    state.appPrefs = defaultAppPrefs();
    state.dictationApiKeySet = false;
    state.openrouterApiKeySet = false;
    state.llamaServerApiKeySet = false;
  }
}

async function boot() {
  try {
    setLocale(state.appPrefs.general.motherLanguage ?? "fr");
    render();
    bindKeyboard();
    bindMouseNavigation();
    bindMicPushToTalk();

    state.status = await safeInvoke<AppStatus>("app_status", undefined, fallbackStatus(), BOOT_INVOKE_TIMEOUT_MS);
    await bindTauriNativeFileDropAsync();
    try {
      const capsRaw = await withTimeout(invoke<unknown>("capabilities", {}), BOOT_INVOKE_TIMEOUT_MS);
      state.capabilities = normalizeCapabilities(capsRaw);
    } catch (error) {
      console.error("capabilities", error);
      state.capabilities = fallbackCapabilities();
    }

    try {
      const paths = await withTimeout(invoke<AppPathsView>("app_paths", {}), BOOT_INVOKE_TIMEOUT_MS);
      state.lastAppPaths = paths;
      state.settingsPathsLoadError = "";
    } catch (error) {
      state.lastAppPaths = null;
      state.settingsPathsLoadError = tauriErrorMessage(error);
    }

    await loadAccountsFromBackend({ silent: false });
    if (isTauriRuntime()) {
      await listen<{ accountId: string; mailbox: string; reason: string }>("imap-push", (ev) => {
        const accId = ev.payload.accountId?.trim();
        if (!accId || state.syncInProgress) return;
        const current = currentAccount()?.id?.trim();
        if (current && current !== accId) return;
        // Le backend (IDLE/polling) a déjà fait sync_inbox sur INBOX — éviter une 2e sync IMAP multi-dossiers.
        void refreshUiAfterImapPush(ev.payload.mailbox?.trim() || "INBOX");
      });
      // Sync INBOX au démarrage (cache SQLite + nouveaux mails pendant l’app fermée).
      if (currentAccount()?.id?.trim()) {
        void syncInbox({ background: true });
      }
    }
    render();
    await loadBootDeferredPrefs();
    applyDefaultAccountFromPrefs();
    state.mailboxes = await safeInvoke<string[]>("list_imap_mailboxes", { accountId: currentAccount()?.id ?? null }, [], BOOT_INVOKE_TIMEOUT_MS);
    ensureValidSelectedMailbox();
    await loadMailView();
    await loadMailboxUnread();
    await refreshSavedDraftsMailboxCount();
    await loadAddressBookSidebarCount();
    await refreshSavedSearches(true);
    syncActivityRecordingPrefs();
    await refreshSuggestedSavedViews();
    await loadNewsletterRules();
    state.selectedThreadId = state.threads[0]?.id;
    render();

    if (isTauriRuntime() && !llmIdlePrefetchAfterBootScheduled) {
      llmIdlePrefetchAfterBootScheduled = true;
      window.setTimeout(() => {
        if (!isTauriRuntime()) return;
        const a = state.appPrefs.ai;
        if (!a.localLlmEnabled) return;
        if (!(a.aiBackgroundLlmPrefetch || a.llamaServerEnabled)) return;
        void invoke("prefetch_llm_model", {}).catch(() => {});
      }, 45_000);
    }
  } catch (error) {
    const msg = `boot failed: ${tauriErrorMessage(error)}`;
    render();
    toast(msg);
  }
}

boot();

// Si l’enregistrement drag était trop tôt (ex. IPC pas prêt), dernier essai après chargement complet.
window.addEventListener(
  "load",
  () => window.setTimeout(() => void bindTauriNativeFileDropAsync(), 0),
  { once: true }
);

function threadReadingIsSimpleLayout(): boolean {
  return true;
}

/** Digest dossier possible (liste IMAP, Tauri, compte). */
function mailboxDigestPanelEligible(): boolean {
  if (state.view !== "list") return false;
  if (isSavedDraftsVirtualMailbox(state.selectedMailbox ?? "")) return false;
  if (!isTauriRuntime()) return false;
  return Boolean(currentAccount()?.id?.trim());
}

/** Panneau digest affiché à droite sur la liste. */
function mailboxDigestSlotInList(): boolean {
  if (!isMailboxDigestFeatureEnabled()) return false;
  return state.mailboxDigestPanelOpen && mailboxDigestPanelEligible();
}

/** Bouton pour ouvrir / fermer le digest dossier (liste IMAP). */
function renderMailboxDigestTriggerButton(extraClass = ""): string {
  if (!isMailboxDigestFeatureEnabled()) return "";
  if (!mailboxDigestPanelEligible()) return "";
  const open = mailboxDigestSlotInList();
  const busy = state.mailboxDigestRefreshing && open;
  const title = open ? "Fermer le brief d’action du dossier" : "Ouvrir le brief d’action IA du dossier";
  const cls = ["ghost-button", "status-bar-digest-trigger", extraClass, open ? "is-active" : ""]
    .filter(Boolean)
    .join(" ");
  return `<button type="button" class="${cls}" data-action="toggle-mailbox-digest-panel" aria-expanded="${open ? "true" : "false"}" title="${escapeAttr(title)}">${
    busy ? `<span class="mini-sync"><span class="spinner" aria-hidden="true"></span><span>Brief</span></span>` : "Brief"
  }</button>`;
}

/** Panneau droit visible (digest dossier ou Détails / IA demandé par l’utilisateur). */
function aiSidePanelExpandedForShell(): boolean {
  if (state.view === "contacts" || state.view === "contact") return false;
  return state.aiOpen || mailboxDigestSlotInList();
}

function render() {
  syncMailboxDigestPanelWithFeaturePref();
  accountsFormIdentityScratch = undefined;
  if (state.view === "settings" && state.settingsTab === "accounts") {
    const mailInput = document.querySelector<HTMLInputElement>("#account-email");
    if (mailInput && !skipAccountIdentityCaptureOnce) {
      accountsFormIdentityScratch = {
        email: mailInput.value ?? "",
        displayName: document.querySelector<HTMLInputElement>("#account-display-name")?.value ?? "",
      };
    }
    if (skipAccountIdentityCaptureOnce) {
      skipAccountIdentityCaptureOnce = false;
    }
  }

  // Preserve scroll positions across full re-render (root.innerHTML rebuilds DOM).
  const prevFolderList = document.querySelector<HTMLElement>(".folder-list");
  const prevSidebarScrollTop = prevFolderList?.scrollTop ?? 0;
  const prevSidebarScrollLeft = prevFolderList?.scrollLeft ?? 0;
  const prevOrgPanel = document.querySelector<HTMLElement>(".organization-panel");
  const prevOrgScrollTop = prevOrgPanel?.scrollTop ?? 0;
  const prevAiModalBody = state.settingsAiModal
    ? document.querySelector<HTMLElement>(".settings-ai-modal-body")
    : null;
  const prevAiModalScrollTop = prevAiModalBody?.scrollTop ?? 0;

  const isCompose = state.view === "compose";
  const aiPanelExpanded = aiSidePanelExpandedForShell();
  root.className = `app-shell ${aiPanelExpanded ? "" : "ai-collapsed"}${isCompose ? " compose-fullscreen-active" : ""}${
    !isCompose && state.sidebarCollapsed ? " sidebar-collapsed" : ""
  }`;
  const panelW =
    typeof state.appPrefs.ai.aiPanelWidthPx === "number" && Number.isFinite(state.appPrefs.ai.aiPanelWidthPx) ?
      Math.min(640, Math.max(260, Math.round(state.appPrefs.ai.aiPanelWidthPx)))
    : 340;
  root.style.setProperty("--ai-width", aiPanelExpanded ? `${panelW}px` : "0px");
  root.innerHTML = `
    <div class="noise"></div>
    ${
      isCompose ?
        `
    ${renderComposer()}
    `
      : `
    ${renderSidebar()}
    <main class="main">${
      !isCompose && state.sidebarCollapsed ?
        `<button type="button" class="main-sidebar-reveal" data-action="toggle-sidebar" aria-label="Afficher le menu des dossiers" title="Menu">☰</button>`
      : ""
    }${renderMain()}</main>
    ${aiPanelExpanded ? renderAiPanel() : ""}
    `
    }
    ${renderMoveDialog()}
    ${renderMailboxManageDialog()}
    ${renderQuoteFoldDialog()}
    ${renderThreadTagsDialog()}
    ${renderCloseComposeDialog()}
    ${renderImageDialog()}
    ${renderSplitSendDialog()}
    ${renderTextPromptModal()}
    ${renderConfirmModal()}
    ${renderSearchModal()}
    ${renderSettingsAiModal()}
    ${renderAiQuickPanelOverlay()}
    ${renderGlobalStatusFooter()}
  `;
  wireEvents();
  wireFolderManagerDnD();
  if (textPromptModal) {
    window.requestAnimationFrame(() => {
      const inp = document.querySelector<HTMLInputElement>("#text-prompt-input");
      if (inp) {
        inp.focus();
        inp.select();
      }
    });
  }
  if (state.searchModalOpen && !textPromptModal) {
    window.requestAnimationFrame(() => {
      const inp = document.querySelector<HTMLInputElement>("#search-modal-input");
      if (!inp) return;
      inp.focus();
      const len = state.searchDraft.length;
      try {
        inp.setSelectionRange(len, len);
      } catch {
        /* type=search */
      }
    });
  }

  // Restore sidebar scroll after wiring events/layout.
  const nextFolderList = document.querySelector<HTMLElement>(".folder-list");
  if (nextFolderList) {
    nextFolderList.scrollTop = prevSidebarScrollTop;
    nextFolderList.scrollLeft = prevSidebarScrollLeft;
  }
  const nextOrgPanel = document.querySelector<HTMLElement>(".organization-panel");
  if (nextOrgPanel && prevOrgScrollTop > 0) {
    nextOrgPanel.scrollTop = prevOrgScrollTop;
  }
  const nextAiModalBody = state.settingsAiModal
    ? document.querySelector<HTMLElement>(".settings-ai-modal-body")
    : null;
  if (nextAiModalBody && prevAiModalScrollTop > 0) {
    nextAiModalBody.scrollTop = prevAiModalScrollTop;
  }
  window.requestAnimationFrame(() => {
    navApplyPendingScrollRestore();
    if (nextOrgPanel && prevOrgScrollTop > 0) {
      nextOrgPanel.scrollTop = prevOrgScrollTop;
    }
    if (nextAiModalBody && prevAiModalScrollTop > 0) {
      nextAiModalBody.scrollTop = prevAiModalScrollTop;
    }
  });
}

function renderCloseComposeDialog(): string {
  const m = state.closeComposeModal;
  if (!m) return "";
  const title = (m.subject || "").trim() || "Sans objet";
  const already = m.hasSavedRecord;
  return `
    <div class="modal-backdrop" data-action="close-close-compose-modal">
      <div class="modal surface-elevated modal-shell-stop-prop close-compose-modal" role="dialog" aria-modal="true" aria-label="Fermer le compositeur">
        <div class="modal-header">
          <strong>Fermer le compositeur ?</strong>
          <button type="button" class="icon-pill" data-action="close-close-compose-modal" aria-label="Annuler">${iconSvg("close")}</button>
        </div>
        <div class="modal-body" style="display:grid;gap:10px">
          <p style="margin:0">
            ${
              already
                ? `Ce brouillon est déjà dans <strong>Sauvés</strong>.`
                : `Ce brouillon n’est pas encore dans <strong>Sauvés</strong> (hors IMAP).`
            }
          </p>
          <p class="dim" style="margin:0">
            Objet : <strong>${escapeHtml(title)}</strong>
          </p>
        </div>
        <div class="modal-footer close-compose-modal__footer">
          <button type="button" class="ghost-button" data-action="close-close-compose-modal">Annuler</button>
          <button type="button" class="ghost-button" data-action="close-compose-without-saving">Fermer sans enregistrer</button>
          <button type="button" class="primary-button" data-action="save-and-close-compose" ${already ? "disabled" : ""}>Enregistrer</button>
        </div>
      </div>
    </div>
  `;
}

function renderImageDialog() {
  const m = state.imageModal;
  if (!m) return "";
  const safeSrc = escapeAttr(m.src);
  const label = (m.alt || "Image").trim();
  return `
    <div class="modal-backdrop" data-action="close-image-modal">
      <div class="modal surface-elevated image-modal modal-shell-stop-prop" role="dialog" aria-modal="true" aria-label="${escapeAttr(label)}">
        <div class="modal-header">
          <strong style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(label)}</strong>
          <button type="button" class="icon-pill" data-action="close-image-modal" aria-label="Fermer">${iconSvg("close")}</button>
        </div>
        <div class="modal-body image-modal-body">
          <img class="email-img-responsive" src="${safeSrc}" alt="${escapeAttr(label)}" />
        </div>
        <div class="modal-footer">
          <a class="ghost-button" href="${safeSrc}" target="_blank" rel="noreferrer noopener">Ouvrir dans un onglet</a>
          <button type="button" class="primary-button" data-action="close-image-modal">Fermer</button>
        </div>
      </div>
    </div>
  `;
}

function renderSplitSendDialog(): string {
  const plan = state.splitSendConfirm;
  if (!plan || !plan.chunks.length) return "";
  const n = plan.chunks.length;
  const targetMo = (plan.serverTargetBytes / (1024 * 1024)).toFixed(0);
  const budgetMo = (plan.budgetBytes / (1024 * 1024)).toFixed(1);
  const warnHtml =
    plan.hasOversized ?
      `<div class="split-send-warn" role="alert">
        <strong>Fichier(s) au-delà du budget (~${budgetMo} Mo par mail, cible serveur ~${targetMo} Mo)</strong>
        <p class="dim" style="margin:6px 0 0;font-size:13px">L’envoi peut être refusé par le serveur pour ces lots. Vous pouvez quand même essayer.</p>
        <ul class="split-send-warn-list">
          ${plan.chunks
            .filter((c) => c.oversized)
            .map((c) => {
              const label = (c.displayNames?.[0] ?? c.paths[0] ?? "?").trim();
              return `<li>${escapeHtml(label)} — ${formatAttachmentSizeKb(c.totalBytes)}</li>`;
            })
            .join("")}
        </ul>
      </div>`
    : "";
  const listHtml = plan.chunks
    .map((ch, i) => {
      const names =
        ch.displayNames?.length ?
          ch.displayNames.map((x) => escapeHtml(x.trim())).join(", ")
        : ch.paths.map((p) => escapeHtml((p.split(/[/\\]/).pop() ?? p).trim())).join(", ");
      const tag = ch.oversized ? ` <span class="split-send-oversized-tag">limite</span>` : "";
      return `<li class="split-send-chunk-row"><span class="dim">Mail ${i + 1}/${n}</span> — ${names} — <strong>${formatAttachmentSizeKb(ch.totalBytes)}</strong>${tag}</li>`;
    })
    .join("");
  return `
    <div class="modal-backdrop" data-action="cancel-split-send">
      <div class="modal surface-elevated split-send-modal modal-shell-stop-prop" role="dialog" aria-modal="true" aria-labelledby="split-send-title">
        <div class="modal-header">
          <strong id="split-send-title">Envoi en ${n} parties</strong>
          <button type="button" class="icon-pill" data-action="cancel-split-send" aria-label="Fermer">${iconSvg("close")}</button>
        </div>
        <div class="modal-body split-send-modal-body">
          <p class="dim" style="margin:0 0 10px;font-size:13px">
            Les pièces jointes dépassent ~${budgetMo} Mo par message (limite côté serveur souvent ~${targetMo} Mo une fois encodées).
            Le message sera découpé en <strong>${n} e-mails</strong> dans la même conversation (réponses chaînées).
          </p>
          ${warnHtml}
          <p class="dim" style="margin:0 0 6px;font-size:12px">Répartition proposée :</p>
          <ul class="split-send-chunk-list">${listHtml}</ul>
        </div>
        <div class="modal-footer">
          <button type="button" class="ghost-button" data-action="cancel-split-send">Annuler</button>
          <button type="button" class="primary-button" data-action="confirm-split-send">Envoyer en ${n} parties</button>
        </div>
      </div>
    </div>
  `;
}

function renderMoveDialog() {
  if (!state.moveOpen) return "";
  const tid = state.moveThreadId ?? "";
  const source = tid ? sourceMailboxForThread(tid) : state.selectedMailbox || "INBOX";
  const targets = mailboxesAllowedForMove(state.mailboxes).filter(
    (m) => m.toLowerCase() !== source.toLowerCase()
  );
  const current = state.moveTargetMailbox;
  const optionsHtml = targets
    .map((m) => {
      const { label } = threadMailboxListLabel(m);
      const display = label === m ? m : `${label} — ${m}`;
      const selected = m.toLowerCase() === current.toLowerCase() ? " selected" : "";
      return `<option value="${escapeAttr(m)}"${selected}>${escapeHtml(display)}</option>`;
    })
    .join("");
  const sourceLabel = threadMailboxListLabel(source).label;
  const noTargets = targets.length === 0;
  return `
    <div class="modal-backdrop" data-action="close-move">
      <div class="modal surface-elevated modal-shell-stop-prop" role="dialog" aria-modal="true" aria-labelledby="move-modal-title">
        <div class="modal-header">
          <strong id="move-modal-title">Déplacer vers…</strong>
          <button class="icon-pill" data-action="close-move" aria-label="Fermer">${iconSvg("close")}</button>
        </div>
        <div class="modal-body" style="display:grid;gap:10px;min-width:320px">
          <p class="dim" style="margin:0;font-size:12px">Depuis <strong>${escapeHtml(sourceLabel)}</strong> — la corbeille et les messages envoyés ne sont pas proposés.</p>
          ${
            noTargets
              ? `<p class="dim" style="margin:0;font-size:12px">Aucun dossier cible disponible.</p>`
              : `<label class="dim" style="display:grid;gap:6px;font-size:12px">Dossier cible
                  <select id="move-target-select" data-action="move-target-change" style="padding:8px 10px;border-radius:var(--radius-btn,6px);background:transparent;color:var(--text);border:1px solid var(--border-weak)">
                    ${optionsHtml}
                  </select>
                </label>`
          }
        </div>
        <div class="modal-footer">
          <button class="ghost-button" data-action="close-move">Annuler</button>
          <button class="primary-button" data-action="confirm-move" style="padding:9px 14px"${noTargets ? " disabled" : ""}>Déplacer</button>
        </div>
      </div>
    </div>
  `;
}

function threadTagsForModal(tags: Tag[]): Tag[] {
  const dedup = new Map<string, Tag>();
  for (const tag of tags) {
    if (!tag?.value) continue;
    if (isNoisyTag(tag)) continue;
    dedup.set(`${tag.family}:${tag.value}`, tag);
  }
  return [...dedup.values()].sort((a, b) => {
    const familyRank = (f: Tag["family"]) => {
      if (f === "Kind") return 0;
      if (f === "Source") return 1;
      if (f === "State") return 2;
      return 3;
    };
    const dr = familyRank(a.family) - familyRank(b.family);
    if (dr !== 0) return dr;
    return a.value.localeCompare(b.value, undefined, { sensitivity: "base" });
  });
}

function threadTagFamilyLabel(family: Tag["family"]): string {
  if (family === "Kind") return "Type";
  if (family === "Source") return "Source";
  if (family === "State") return "État";
  return "Entité";
}

function tagToSearchDraft(tag: Tag): string | null {
  const fam = String(tag.family).toLowerCase();
  const val = tag.value.trim();
  if (!val) return null;
  if (fam === "source" && val.toLowerCase() === "imap") return null;
  if (fam === "source" || fam === "kind" || fam === "state" || fam === "entity") {
    return `#${fam}:${val}`;
  }
  return null;
}

function launchTagMailSearch(tag: Tag): void {
  const draft = tagToSearchDraft(tag);
  if (!draft) {
    toast("Ce tag n’est pas utilisable pour la recherche.");
    return;
  }
  navReset();
  state.view = "list";
  state.threadTagsModalOpen = false;
  state.searchModalOpen = false;
  state.searchAccountOverrideId = null;
  state.searchMailboxPath = null;
  state.searchTags = [];
  state.searchNewsletterRule = null;
  state.searchLanguageFilter = null;
  state.searchSenders = [];
  state.search = "";
  state.searchDraft = draft;
  state.listFilter = "all";
  state.searchNlMode = null;
  state.searchScope = "account";
  state.searchModifiersTouched = true;
  clearThreadAiSummaryState();
  document.querySelectorAll<HTMLInputElement>("#search-input, #search-modal-input").forEach((el) => {
    el.value = draft;
  });
  resetSearchStructuralModifiers();
  applyParsedSearchBarToState(parseSearchBarDraft(draft, state.newsletterRules));
  render();
  void searchThreads();
}

function renderThreadTagChip(tag: Tag): string {
  const label = formatTag(tag);
  const draft = tagToSearchDraft(tag);
  if (!draft) {
    return `<span class="thread-tag-chip">${escapeHtml(label)}</span>`;
  }
  const fam = String(tag.family).toLowerCase();
  return `<button type="button" class="thread-tag-chip thread-tag-chip--search" data-action="search-from-tag" data-tag-family="${escapeAttr(fam)}" data-tag-value="${escapeAttr(tag.value)}" title="Rechercher · ${escapeAttr(label)}">${escapeHtml(label)}</button>`;
}

function renderThreadTagsChipsHtml(tags: Tag[]): string {
  if (!tags.length) return `<p class="dim thread-tags-empty">Aucun tag.</p>`;
  const byFamily = new Map<Tag["family"], Tag[]>();
  for (const tag of tags) {
    const list = byFamily.get(tag.family) ?? [];
    list.push(tag);
    byFamily.set(tag.family, list);
  }
  const order: Tag["family"][] = ["Kind", "Source", "State", "Entity"];
  return order
    .filter((family) => byFamily.has(family))
    .map((family) => {
      const chips = (byFamily.get(family) ?? [])
        .map((tag) => renderThreadTagChip(tag))
        .join("");
      return `<section class="thread-tags-group" aria-label="${escapeAttr(threadTagFamilyLabel(family))}">
        <p class="thread-tags-group-kicker dim">${escapeHtml(threadTagFamilyLabel(family))}</p>
        <div class="thread-tags-group-chips">${chips}</div>
      </section>`;
    })
    .join("");
}

function renderThreadTagsDialog(): string {
  if (!state.threadTagsModalOpen || state.view !== "thread" || !state.selectedThread) return "";
  const thread = state.selectedThread;
  const threadTags = threadTagsForModal(thread.tags ?? []);
  const msgs = sortMessagesByReceivedDescending(thread.messages ?? []);
  const perMessageHtml = msgs
    .map((message, i) => {
      const tags = threadTagsForModal(message.tags ?? []);
      if (!tags.length) return "";
      const label = normalizeThreadSenderLabel(message.sender) || `Message ${i + 1}`;
      const when = formatThreadReadingWhen(message.receivedAt);
      return `<section class="thread-tags-msg-block" aria-label="Tags message ${i + 1}">
        <p class="thread-tags-msg-kicker dim">${escapeHtml(label)}${when ? ` · ${escapeHtml(when)}` : ""}</p>
        ${renderThreadTagsChipsHtml(tags)}
      </section>`;
    })
    .filter(Boolean)
    .join("");
  const nThread = threadTags.length;
  const nMsg = msgs.reduce((s, m) => s + threadTagsForModal(m.tags ?? []).length, 0);
  const countHint =
    nThread + nMsg === 0 ? "Aucun tag indexé"
    : nMsg > 0 ? `${nThread} sur le fil · tags par message ci-dessous`
    : `${nThread} tag${nThread === 1 ? "" : "s"}`;
  return `
    <div class="modal-backdrop" data-action="close-thread-tags">
      <div class="modal surface-elevated thread-tags-modal modal-shell-stop-prop" role="dialog" aria-modal="true" aria-labelledby="thread-tags-title">
        <div class="modal-header">
          <strong id="thread-tags-title">Tags du fil</strong>
          <button type="button" class="icon-pill" data-action="close-thread-tags" aria-label="Fermer">${iconSvg("close")}</button>
        </div>
        <p class="thread-tags-subtitle dim">${escapeHtml(thread.subject)} · ${escapeHtml(countHint)}</p>
        <div class="modal-body thread-tags-body">
          <section class="thread-tags-section" aria-label="Tags du fil">
            <p class="thread-tags-section-kicker">Fil</p>
            ${renderThreadTagsChipsHtml(threadTags)}
          </section>
          ${perMessageHtml ? `<section class="thread-tags-section" aria-label="Tags par message"><p class="thread-tags-section-kicker">Par message</p>${perMessageHtml}</section>` : ""}
        </div>
        <div class="modal-footer">
          <button type="button" class="ghost-button" data-action="retag-thread" data-thread-id="${escapeAttr(state.selectedThreadId ?? "")}">Recalculer les tags</button>
          <button type="button" class="ghost-button" data-action="close-thread-tags">Fermer</button>
        </div>
      </div>
    </div>
  `;
}

function renderQuoteFoldDialog() {
  const m = state.quoteFoldModal;
  if (!m || m.blocks.length === 0) return "";
  const blocksHtml =
    m.blocks.length === 1
      ? `<pre class="quote-fold-pre">${escapeHtml(m.blocks[0])}</pre>`
      : m.blocks
          .map(
            (block, i) => `
        <section class="quote-fold-block" aria-label="Citation ${i + 1}">
          <p class="quote-fold-block-kicker dim">Citation ${i + 1}/${m.blocks.length}</p>
          <pre class="quote-fold-pre">${escapeHtml(block)}</pre>
        </section>`
          )
          .join("");
  const n = m.blocks.length;
  const extraitLbl = n === 1 ? "1 extrait cité" : `${n} extraits cités`;
  return `
    <div class="modal-backdrop" data-action="close-quote-fold">
      <div class="modal surface-elevated quote-fold-modal modal-shell-stop-prop" role="dialog" aria-modal="true" aria-labelledby="quote-fold-title">
        <div class="modal-header">
          <strong id="quote-fold-title">Historique masqué</strong>
          <button type="button" class="icon-pill" data-action="close-quote-fold" aria-label="Fermer">${iconSvg("close")}</button>
        </div>
        <p class="quote-fold-subtitle dim">${escapeHtml(m.senderLabel)} · ${m.foldedLines} lignes · ${extraitLbl}</p>
        <div class="modal-body quote-fold-body">${blocksHtml}</div>
        <div class="modal-footer">
          <button type="button" class="ghost-button" data-action="close-quote-fold">Fermer</button>
        </div>
      </div>
    </div>
  `;
}

function renderMailboxManageDialog() {
  if (!state.mailboxManageOpen) return "";
  return `
    <div class="modal-backdrop" data-action="close-mailbox-manage">
      <div class="modal surface-elevated modal-shell-stop-prop" role="dialog" aria-modal="true" aria-label="Mailbox actions">
        <div class="modal-header">
          <strong>Mailbox</strong>
          <button class="icon-pill" data-action="close-mailbox-manage" aria-label="Close">${iconSvg("close")}</button>
        </div>
        <div class="modal-body" style="display:grid;gap:10px">
          <button class="ghost-button" data-action="mb-create">Create mailbox…</button>
          <button class="ghost-button" data-action="mb-rename">Rename mailbox…</button>
          <button class="ghost-button" data-action="mb-subscribe">Subscribe mailbox</button>
          <button class="ghost-button" data-action="mb-delete" style="color:var(--danger)">Delete mailbox…</button>
          <button class="ghost-button" data-action="open-folder-manager-view">Ouvrir la vue Dossiers…</button>
          <p class="dim" style="font-size:12px;margin:4px 0 0">Current: <strong>${escapeHtml(state.selectedMailbox || "INBOX")}</strong></p>
        </div>
        <div class="modal-footer">
          <button class="ghost-button" data-action="close-mailbox-manage">Close</button>
        </div>
      </div>
    </div>
  `;
}

function renderAiQuickPanelOverlay(): string {
  if (!state.aiQuickPanelOpen) return "";
  return `
    <div class="ai-quick-panel-backdrop" data-action="toggle-ai-quick-panel" aria-hidden="true"></div>
    <div class="ai-quick-panel ai-quick-panel--overlay surface-sm modal-shell-stop-prop" role="dialog" aria-modal="true" aria-label="Fonctionnalités IA">
      <div class="ai-quick-panel__head">
        <strong>Fonctionnalités IA</strong>
        <div class="ai-quick-panel__head-actions">
          <div class="ai-quick-panel__bulk">
            <button type="button" class="ghost-button ghost-button-sm" data-action="ai-features-all-on">Tout activer</button>
            <button type="button" class="ghost-button ghost-button-sm" data-action="ai-features-all-off">Tout désactiver</button>
          </div>
          <button type="button" class="icon-pill" data-action="toggle-ai-quick-panel" aria-label="Fermer">${iconSvg("close")}</button>
        </div>
      </div>
      <div class="ai-quick-panel__body">${renderAiFeatureTogglesHtml()}</div>
      <p class="dim ai-quick-panel__hint">Les changements sont enregistrés immédiatement. Paramètres détaillés → IA & dictée → Fonctionnalités.</p>
    </div>`;
}

function renderSidebarAiQuickTrigger(): string {
  return `<div class="sidebar-footer-ai">
      <button
        type="button"
        class="folder-button sidebar-ai-trigger ${state.aiQuickPanelOpen ? "sidebar-ai-trigger--open" : ""}"
        data-action="toggle-ai-quick-panel"
        aria-expanded="${state.aiQuickPanelOpen ? "true" : "false"}"
        title="Activer ou désactiver les fonctionnalités IA"
      >
        <span class="folder-icon">IA</span>
        <span class="folder-name">Fonctionnalités IA</span>
      </button>
    </div>`;
}

function renderStatusBarAiQuickTrigger(): string {
  return `<button
      type="button"
      class="status-bar-ai-trigger ghost-button"
      data-action="toggle-ai-quick-panel"
      aria-expanded="${state.aiQuickPanelOpen ? "true" : "false"}"
      title="Activer ou désactiver les fonctionnalités IA"
    >IA</button>`;
}

function renderSidebar() {
  const account = currentAccount();
  const accountLabel = account?.email ?? "No account configured";
  const folders = state.mailboxes.length ? state.mailboxes : ["INBOX"];
  const system = pickSystemMailboxes(folders);
  const systemNames = new Set(system.map((x) => x.name));
  const personal = folders.filter((mb) => !systemNames.has(mb));
  const personalCount = personal.length;
  return `
    <aside class="sidebar" aria-label="Mail navigation">
      <button type="button" class="sidebar-collapse-edge" data-action="toggle-sidebar" aria-label="Masquer les dossiers" title="Réduire le volet">
        <span class="sidebar-collapse-edge__glyph" aria-hidden="true"></span>
      </button>
      <div class="sidebar-header">
        <div class="sidebar-header-top">
          <div class="sidebar-account">
            <span class="avatar large" style="background:rgba(200,149,108,.16);color:var(--accent)">SC</span>
            <span><strong>RustyMail</strong><small class="dim" style="display:block">${escapeHtml(accountLabel)}</small></span>
          </div>
        </div>
        <div class="sidebar-actions">
          <button class="primary-button" data-action="compose" style="padding:9px 10px;border-radius:var(--radius-btn);width:100%"><span>Composer</span> <span class="kbd">N</span></button>
          <select id="account-select" class="account-select" style="width:100%" ${state.accounts.length ? "" : "disabled"}>
            ${state.accounts.map((a) => `<option value="${escapeAttr(a.id)}" ${a.id === state.selectedAccountId ? "selected" : ""}>${escapeHtml(a.displayName || a.email)}</option>`).join("")}
          </select>
        </div>
      </div>
      <nav class="folder-list" aria-label="Folders">
        ${
          isTauriRuntime() && account
            ? `<div class="sidebar-folder-group sidebar-folder-group--virtual-local">
              <button type="button" class="folder-button ${state.selectedMailbox === LOCAL_SAVED_DRAFTS_MAILBOX ? "active" : ""}" data-mailbox="${escapeAttr(LOCAL_SAVED_DRAFTS_MAILBOX)}" aria-label="Sauvés — ${state.savedDraftsMailboxCount} brouillon${state.savedDraftsMailboxCount === 1 ? "" : "s"}">
                <span class="folder-icon">Sv</span>
                <span class="folder-name">Sauvés</span>
                <span class="folder-count">${state.savedDraftsMailboxCount}</span>
              </button>
              <button type="button" class="folder-button ${state.view === "contacts" || state.view === "contact" ? "active" : ""}" data-action="open-contacts-view" aria-label="Carnet d'adresses">
                <span class="folder-icon">Ct</span>
                <span class="folder-name">Carnet</span>
                ${renderAddressBookSidebarCountPill()}
              </button>
            </div>`
            : ""
        }
        <div class="sidebar-section-label sidebar-section-label--in-nav"><span class="dim">IMAP</span></div>
        <div class="sidebar-folder-group">
          ${system
            .map(
              ({ kind, name }) => `
                <button class="folder-button ${name === state.selectedMailbox ? "active" : ""}" data-mailbox="${escapeAttr(name)}">
                  <span class="folder-icon">${mailboxKindIcon(kind)}</span>
                  <span class="folder-name">${escapeHtml(mailboxKindLabelFr(kind))}</span>
                  ${renderFolderSidebarCountPill(name)}
                </button>
              `
            )
            .join("")}
        </div>

        <button type="button" class="folder-button ${state.view === "folderManager" ? "active" : ""}" data-action="open-folder-manager-view" title="Gérer l’arbre des dossiers personnels">
          <span class="folder-icon">Ar</span>
          <span class="folder-name">Dossiers</span>
          ${personalCount ? `<span class="folder-count">${personalCount}</span>` : ""}
        </button>
      </nav>
      ${
        isTauriRuntime() && account
          ? `<div class="sidebar-saved-views" aria-label="Vues enregistrées">
              <div class="sidebar-section-label sidebar-section-label--saved-views"><span class="dim">Vues</span></div>
              ${activityTrackingEnabled() ? renderSuggestedViewsCardHtml(state.suggestedSavedViews, escapeHtml, escapeAttr) : ""}
              ${renderSavedSearchesSidebarHtml(state.savedSearches, state.activeSavedSearchId, escapeHtml, escapeAttr)}
            </div>`
          : ""
      }
      <div class="sidebar-footer">
        <button type="button" class="folder-button ${state.view === "organizationV2" ? "active" : ""}" data-action="open-organization-v2-view" title="Organiser V2 — structure boîte (sans LLM). Les regroupements par critères = vues enregistrées.">
          <span class="folder-icon">O2</span><span class="folder-name">Organiser V2</span>
        </button>
        <button type="button" class="folder-button" data-action="settings">
          <span class="folder-icon">ST</span><span class="folder-name">Paramètres</span><span class="folder-count">${state.accounts.length}</span>
        </button>
        ${renderSidebarAiQuickTrigger()}
      </div>
    </aside>
  `;
}

/** Rescan heuristique du centre Organiser (après déplacements / apply). */
async function refreshOrganizationReport(): Promise<void> {
  if (state.view !== "organization") return;
  const acc = currentAccount();
  if (!acc?.id) return;
  state.organization.applyMessage = "Mise à jour des propositions…";
  render();
  try {
    const report = await orgScanAccount(acc.id, Boolean(state.appPrefs.ai.featureOrgProposalsEnabled));
    state.organization.report = report;
    state.organization.applyMessage = `${report.proposals.length} proposition(s) à jour.`;
    const llmMsg = report.llmStatus?.message?.trim();
    if (llmMsg) toast(llmMsg);
  } catch (e) {
    toast(tauriErrorMessage(e));
  } finally {
    if (state.view === "organization") render();
  }
}

async function refreshMailboxesAfterImapChange(): Promise<void> {
  if (!isTauriRuntime()) return;
  const acc = currentAccount();
  if (!acc?.id) return;
  try {
    state.mailboxes = await withTimeout(
      invoke<string[]>("list_imap_mailboxes", { accountId: acc.id }),
      BOOT_INVOKE_TIMEOUT_MS,
    );
  } catch {
    /* garde la liste actuelle */
  }
}

async function confirmThenRunOrgApply(
  accountId: string,
  proposalId: string,
  trashAck?: string,
  actionOverride?: import("./organizationView").OrgActionOverride | null,
  deleteMailboxAck?: string,
  threadIds?: string[] | null,
): Promise<void> {
  const proposal = state.organization.report?.proposals.find((p) => p.id === proposalId);
  if (!proposal) {
    toast("Proposition introuvable — relancez l’analyse du compte.");
    return;
  }
  if (proposal.applicable === false) return;
  const impact = formatOrgApplyImpact(proposal, actionOverride);
  const ok = await openConfirmModal({
    title: "Confirmer l’action",
    body: `${impact}\n\nAppliquer cette action sur le compte ?`,
    confirmLabel: "Appliquer",
  });
  if (!ok) return;
  await runOrgApply(accountId, proposalId, trashAck, actionOverride, deleteMailboxAck, threadIds);
}

async function runOrgApply(
  accountId: string,
  proposalId: string,
  trashAck?: string,
  actionOverride?: import("./organizationView").OrgActionOverride | null,
  deleteMailboxAck?: string,
  threadIds?: string[] | null,
): Promise<void> {
  state.organization.applying = true;
  state.organization.applyMessage = orgApplyStatusMessage(proposalId, actionOverride);
  render();
  try {
    const proposal = state.organization.report?.proposals.find((p) => p.id === proposalId);
    if (!proposal) {
      toast("Proposition introuvable — relancez l’analyse du compte.");
      return;
    }
    const p = await orgApplyProposal(
      accountId,
      proposalId,
      proposal,
      trashAck,
      actionOverride,
      deleteMailboxAck,
      threadIds,
    );
    state.organization.applyMessage = p.message;
    toast(p.message);
    if (p.errors.length > 0) {
      toast(p.errors.slice(0, 2).join(" · "));
    }
    if (state.organization.report) {
      state.organization.report = optimisticPatchOrgReport(
        state.organization.report,
        proposalId,
        p,
      );
    }
    render();
    const hadImapChange =
      p.done > 0 ||
      (p.mailboxesToSync?.length ?? 0) > 0 ||
      (p.threadsAffected?.length ?? 0) > 0;
    if (hadImapChange) {
      await refreshMailboxesAfterImapChange();
      if (state.view === "list" && isTauriRuntime()) {
        try {
          await loadMailView(false);
        } catch {
          /* liste courante au prochain affichage */
        }
      }
    }
    await refreshOrganizationReport();
  } catch (e) {
    toast(tauriErrorMessage(e));
  } finally {
    state.organization.applying = false;
    render();
  }
}

async function openOrganizationView() {
  const acc = currentAccount();
  if (!acc?.id) {
    toast("Configurez un compte pour organiser la boîte.");
    return;
  }
  await loadNewsletterRules();
  beginNavigation("organization", { resetStack: true });
  state.view = "organization";
  state.mailboxDigestPanelOpen = false;
  state.aiOpen = false;
  render();
}

async function refreshOrganizationV2Report(): Promise<void> {
  if (state.view !== "organizationV2") return;
  const acc = currentAccount();
  if (!acc?.id) return;
  state.organizationV2.applyMessage = "Mise à jour…";
  render();
  try {
    const report = await orgV2ScanAccount(acc.id);
    state.organizationV2.report = report;
    state.organizationV2.applyMessage = `${report.proposals.length} action(s) en file.`;
  } catch (e) {
    toast(tauriErrorMessage(e));
  } finally {
    if (state.view === "organizationV2") render();
  }
}

/** Quitte le mode recherche / vue enregistrée avant navigation dossier (sidebar, Organiser…). */
function exitSearchModeForMailboxBrowse(): void {
  state.search = "";
  state.searchDraft = "";
  state.searchSenders = [];
  state.searchMailboxPath = null;
  state.searchAccountOverrideId = null;
  state.searchTags = [];
  state.searchNewsletterRule = null;
  state.searchLanguageFilter = null;
  state.searchNlMode = null;
  state.searchModifiersTouched = false;
  state.activeSavedSearchId = null;
  document.querySelectorAll<HTMLInputElement>("#search-input, #search-modal-input").forEach((el) => {
    el.value = "";
  });
}

async function onOrgV2IgnoreMailboxUi(mailbox: string): Promise<void> {
  const acc = currentAccount();
  const mb = mailbox.trim();
  if (!acc?.id || !mb) return;
  try {
    await orgV2IgnoreMailbox(acc.id, mb);
    if (state.organizationV2.report) {
      const mem = state.organizationV2.report.memory;
      const ignored = new Set(mem.ignoredMailboxes);
      ignored.add(mb);
      state.organizationV2.report = {
        ...state.organizationV2.report,
        memory: { ...mem, ignoredMailboxes: [...ignored] },
      };
      state.organizationV2.applyMessage = `Dossier « ${threadMailboxListLabel(mb).label} » exclu de l’analyse.`;
    }
    toast(`« ${threadMailboxListLabel(mb).label} » exclu de l’analyse.`);
    render();
    void refreshOrganizationV2Report();
  } catch (e) {
    toast(tauriErrorMessage(e));
  }
}

async function onOrgV2UnignoreMailboxUi(mailbox: string): Promise<void> {
  const acc = currentAccount();
  const mb = mailbox.trim();
  if (!acc?.id || !mb) return;
  try {
    await orgV2UnignoreMailbox(acc.id, mb);
    if (state.organizationV2.report) {
      const mem = state.organizationV2.report.memory;
      state.organizationV2.report = {
        ...state.organizationV2.report,
        memory: {
          ...mem,
          ignoredMailboxes: mem.ignoredMailboxes.filter((x) => x !== mb),
        },
      };
      state.organizationV2.applyMessage = `Dossier « ${threadMailboxListLabel(mb).label} » réintégré.`;
    }
    toast(`« ${threadMailboxListLabel(mb).label} » réintégré dans l’analyse.`);
    render();
    void refreshOrganizationV2Report();
  } catch (e) {
    toast(tauriErrorMessage(e));
  }
}

async function orgV2DismissProposal(proposalId: string): Promise<void> {
  const acc = currentAccount();
  if (!acc?.id) return;
  const proposal = state.organizationV2.report?.proposals.find((p) => p.id === proposalId);
  if (!proposal) return;
  try {
    await orgV2RecordDecision(acc.id, proposal, "dismissed");
    if (state.organizationV2.report) {
      state.organizationV2.report = optimisticOrgV2RemoveProposal(state.organizationV2.report, proposalId);
    }
    state.organizationV2.applyMessage = "Proposition ignorée (mémorisée).";
    toast("Ignorée — ne reviendra pas pour ce lot.");
  } catch (e) {
    toast(tauriErrorMessage(e));
  }
  render();
}

async function orgV2SnoozeProposal(proposalId: string): Promise<void> {
  const acc = currentAccount();
  if (!acc?.id) return;
  const proposal = state.organizationV2.report?.proposals.find((p) => p.id === proposalId);
  if (!proposal) return;
  try {
    await orgV2RecordDecision(acc.id, proposal, "snoozed", 7);
    if (state.organizationV2.report) {
      state.organizationV2.report = optimisticOrgV2RemoveProposal(state.organizationV2.report, proposalId);
    }
    state.organizationV2.applyMessage = "Reportée 7 jours.";
    toast("Reportée 7 jours.");
  } catch (e) {
    toast(tauriErrorMessage(e));
  }
  render();
}

async function confirmThenRunOrgV2Apply(
  accountId: string,
  proposalId: string,
  trashAck?: string,
  actionOverride?: import("./organizationView").OrgActionOverride | null,
  deleteMailboxAck?: string,
): Promise<void> {
  const proposal = state.organizationV2.report?.proposals.find((p) => p.id === proposalId);
  if (!proposal) {
    toast("Proposition introuvable — relancez l’analyse.");
    return;
  }
  if (proposal.applicable === false) return;
  const impact = formatOrgApplyImpact(proposal, actionOverride);
  const ok = await openConfirmModal({
    title: "Confirmer l’action",
    body: `${impact}\n\nAppliquer cette action ?`,
    confirmLabel: "Appliquer",
  });
  if (!ok) return;
  await runOrgV2Apply(accountId, proposal, trashAck, actionOverride, deleteMailboxAck);
}

async function runOrgV2Apply(
  accountId: string,
  proposal: OrgProposal,
  trashAck?: string,
  actionOverride?: import("./organizationView").OrgActionOverride | null,
  deleteMailboxAck?: string,
  threadIds?: string[] | null,
): Promise<void> {
  const proposalId = proposal.id;
  state.organizationV2.applying = true;
  state.organizationV2.applyMessage = "Application…";
  render();
  try {
    const p = await orgApplyProposal(
      accountId,
      proposalId,
      proposal,
      trashAck,
      actionOverride,
      deleteMailboxAck,
      threadIds ?? null,
    );
    state.organizationV2.applyMessage = p.message;
    toast(p.message);
    if (p.errors.length > 0) toast(p.errors.slice(0, 2).join(" · "));
    if (state.organizationV2.report) {
      const patched = optimisticOrgV2PatchAfterApply(state.organizationV2.report, proposalId, p);
      const remaining = patched.proposals.find((x) => x.id === proposalId);
      const batchDone =
        !remaining ||
        remaining.applicable === false ||
        (remaining.totalCount === 0 &&
          remaining.threadRefs.filter((r) => !r.threadId.startsWith("mailbox:")).length === 0 &&
          remaining.threadRefs.filter((r) => r.threadId.startsWith("mailbox:")).length === 0);
      if (batchDone) {
        await orgV2RecordDecision(accountId, proposal, "applied");
        state.organizationV2.report = {
          ...patched,
          proposals: patched.proposals.filter((x) => x.id !== proposalId),
        };
      } else {
        state.organizationV2.report = patched;
      }
    }
    render();
    const hadImapChange =
      p.done > 0 ||
      (p.mailboxesToSync?.length ?? 0) > 0 ||
      (p.threadsAffected?.length ?? 0) > 0;
    if (hadImapChange) {
      await refreshMailboxesAfterImapChange();
      if (state.view === "list" && isTauriRuntime()) {
        try {
          await loadMailView(false);
        } catch {
          /* ok */
        }
      }
    }
    await refreshOrganizationV2Report();
  } catch (e) {
    toast(tauriErrorMessage(e));
  } finally {
    state.organizationV2.applying = false;
    render();
  }
}

async function openOrganizationV2View() {
  const acc = currentAccount();
  if (!acc?.id) {
    toast("Configurez un compte pour organiser la boîte.");
    return;
  }
  beginNavigation("organizationV2", { resetStack: true });
  state.view = "organizationV2";
  state.mailboxDigestPanelOpen = false;
  state.aiOpen = false;
  render();
  state.organizationV2.scanning = true;
  render();
  try {
    const report = await orgV2ScanAccount(acc.id);
    state.organizationV2.report = report;
    state.organizationV2.applyMessage = `${report.proposals.length} action(s).`;
  } catch (e) {
    toast(tauriErrorMessage(e));
  } finally {
    state.organizationV2.scanning = false;
    if (state.view === "organizationV2") render();
  }
}

function mailboxPathDelimiter(mb: string): string {
  return mb.includes("/") ? "/" : ".";
}

function mailboxLeafName(path: string): string {
  const segs = splitMailboxSegments(path);
  return segs[segs.length - 1] ?? path;
}

function reparentMailboxPath(from: string, newParent: string): string {
  const leaf = mailboxLeafName(from);
  const parent = newParent.trim();
  if (!parent) return leaf;
  const delim = mailboxPathDelimiter(parent);
  return `${parent.replace(/[/.]$/, "")}${delim}${leaf}`;
}

async function refreshFolderManagerTree(): Promise<void> {
  const acc = currentAccount();
  if (!acc?.id) return;
  state.folderManager.loading = true;
  render();
  try {
    state.folderManager.report = await fetchMailboxTree(acc.id);
    state.folderManager.message = `${state.folderManager.report.entries.length} dossier(s) personnel(s)`;
  } catch (e) {
    toast(tauriErrorMessage(e));
  } finally {
    state.folderManager.loading = false;
    if (state.view === "folderManager") render();
  }
}

async function fmSelectMailbox(mailbox: string, opts?: { skipHistory?: boolean }): Promise<void> {
  const mb = mailbox.trim();
  if (!mb) return;
  const prev = state.folderManager.selectedMailbox;
  if (
    !opts?.skipHistory &&
    state.view === "folderManager" &&
    prev !== mb
  ) {
    navPushBackEntry(captureCurrentNav());
    navClearForward();
  }
  state.folderManager.selectedMailbox = mb;
  resetFolderManagerPanelSearchState();
  render();
  try {
    await loadMailView(false);
  } catch (e) {
    toast(tauriErrorMessage(e));
  }
  render();
}

async function openFolderManagerView(): Promise<void> {
  const acc = currentAccount();
  if (!acc?.id) {
    toast("Configurez un compte pour gérer les dossiers.");
    return;
  }
  if (!isTauriRuntime()) {
    toast("Vue Dossiers : disponible dans l’app Tauri.");
    return;
  }
  beginNavigation("folderManager");
  state.view = "folderManager";
  state.mailboxDigestPanelOpen = false;
  state.aiOpen = false;
  state.folderManager.selectedMailbox = null;
  state.threads = [];
  state.folderManager.expandedNodes = loadFolderTreeExpanded();
  render();
  await refreshFolderManagerTree();
}

async function fmSyncMailbox(mailbox: string): Promise<void> {
  const acc = currentAccount();
  const mb = mailbox.trim();
  if (!acc?.id || !mb) return;
  state.folderManager.busyMailbox = mb;
  state.folderManager.busyAction = "sync";
  render();
  try {
    await withTimeout(
      invoke<SyncMailboxesOutcome>("sync_mailboxes", { accountId: acc.id, mailboxes: [mb] }),
      MAIL_ACTION_TIMEOUT_MS,
    );
    await refreshFolderManagerTree();
    if (state.folderManager.selectedMailbox === mb) await fmSelectMailbox(mb);
    toast(`Dossier synchronisé : ${mb}`);
  } catch (e) {
    toast(tauriErrorMessage(e));
  } finally {
    state.folderManager.busyMailbox = null;
    state.folderManager.busyAction = null;
    render();
  }
}

async function fmCreateMailbox(parentPrefix?: string): Promise<void> {
  const acc = currentAccount();
  if (!acc?.id) return;
  const prefix = parentPrefix?.trim() ? `${parentPrefix.trim().replace(/[/.]$/, "")}${mailboxPathDelimiter(parentPrefix)}` : "";
  const name =
    (await openTextPromptModal({
      title: "Créer un dossier IMAP",
      body: prefix ? `Préfixe parent : ${prefix}` : "Chemin du dossier (ex. Projets/2025)",
      label: "Chemin du dossier",
      defaultValue: prefix,
    }))?.trim() ?? "";
  if (!name) return;
  try {
    await withTimeout(invoke<string>("create_imap_mailbox", { accountId: acc.id, mailbox: name }), MAIL_ACTION_TIMEOUT_MS);
    await refreshMailboxesAfterImapChange();
    await refreshFolderManagerTree();
    await fmSelectMailbox(name);
    toast(`Dossier créé : ${name}`);
  } catch (e) {
    toast(tauriErrorMessage(e));
  }
}

async function fmRenameMailbox(from: string): Promise<void> {
  const acc = currentAccount();
  if (!acc?.id) return;
  const to =
    (await openTextPromptModal({
      title: "Renommer le dossier",
      label: "Nouveau chemin",
      defaultValue: from,
    }))?.trim() ?? "";
  if (!to || to === from) return;
  try {
    await withTimeout(
      invoke<string>("rename_imap_mailbox", { accountId: acc.id, fromMailbox: from, toMailbox: to }),
      MAIL_ACTION_TIMEOUT_MS,
    );
    await refreshMailboxesAfterImapChange();
    await refreshFolderManagerTree();
    await fmSelectMailbox(to);
    toast(`Dossier renommé : ${to}`);
  } catch (e) {
    toast(tauriErrorMessage(e));
  }
}

async function fmMoveFolder(from: string, newParent: string): Promise<void> {
  const acc = currentAccount();
  if (!acc?.id) return;
  if (from.trim().toLowerCase() === newParent.trim().toLowerCase()) return;
  if (isDescendantMailboxPath(from, newParent)) {
    toast("Impossible de déplacer un dossier dans l’un de ses descendants.");
    return;
  }
  const to = reparentMailboxPath(from, newParent);
  if (to.toLowerCase() === from.trim().toLowerCase()) return;
  state.folderManager.busyMailbox = from;
  state.folderManager.busyAction = "move";
  render();
  try {
    await withTimeout(
      invoke<string>("rename_imap_mailbox", { accountId: acc.id, fromMailbox: from, toMailbox: to }),
      MAIL_ACTION_TIMEOUT_MS,
    );
    await refreshMailboxesAfterImapChange();
    await refreshFolderManagerTree();
    await fmSelectMailbox(to);
    toast(`Dossier déplacé : ${to}`);
  } catch (e) {
    toast(tauriErrorMessage(e));
  } finally {
    state.folderManager.busyMailbox = null;
    state.folderManager.busyAction = null;
    state.folderManager.dragFolder = null;
    state.folderManager.dropTarget = null;
    render();
  }
}

async function fmConfirmArchiveMailbox(): Promise<void> {
  const acc = currentAccount();
  const mb = state.folderManager.pendingArchiveMailbox?.trim();
  if (!acc?.id || !mb) return;
  const remember = state.folderManager.archiveRemember;
  state.folderManager.archiveProgress = "Archivage…";
  render();
  try {
    const out = await archiveMailboxThreads(acc.id, mb, remember);
    state.folderManager.archiveConfirmOpen = false;
    state.folderManager.pendingArchiveMailbox = null;
    await refreshFolderManagerTree();
    if (state.folderManager.selectedMailbox === mb) await fmSelectMailbox(mb);
    if (out.errors.length) toast(`Archivage partiel : ${out.errors[0]}`);
    else toast(`${out.archived} conversation(s) archivée(s).`);
  } catch (e) {
    toast(tauriErrorMessage(e));
  } finally {
    state.folderManager.archiveProgress = null;
    render();
  }
}

async function fmConfirmDeleteMailbox(): Promise<void> {
  const acc = currentAccount();
  const mb = state.folderManager.pendingDeleteMailbox?.trim();
  if (!acc?.id || !mb || !state.folderManager.deleteConfirmChecked) return;
  state.folderManager.busyMailbox = mb;
  state.folderManager.busyAction = "delete";
  render();
  try {
    const out = await deleteMailboxWithContents(acc.id, mb);
    state.folderManager.deleteConfirmOpen = false;
    state.folderManager.pendingDeleteMailbox = null;
    state.folderManager.deleteConfirmChecked = false;
    await refreshMailboxesAfterImapChange();
    await refreshFolderManagerTree();
    const remaining = state.folderManager.report?.entries.map((e) => e.mailbox) ?? [];
    if (remaining.length) await fmSelectMailbox(remaining[0]!);
    else {
      state.folderManager.selectedMailbox = null;
      state.threads = [];
    }
    if (out.errors.length) toast(`Suppression partielle : ${out.errors[0]}`);
    else toast(`${out.deletedMailboxes} dossier(s) supprimé(s).`);
  } catch (e) {
    toast(tauriErrorMessage(e));
  } finally {
    state.folderManager.busyMailbox = null;
    state.folderManager.busyAction = null;
    render();
  }
}

function wireFolderManagerDnD(): void {
  if (state.view !== "folderManager") return;
  document.querySelectorAll<HTMLElement>(".folder-tree-act, .folder-tree-chevron, .folder-tree-drag-handle").forEach((el) => {
    el.addEventListener("click", (e) => e.stopPropagation());
  });
  document.querySelectorAll<HTMLElement>("[data-action=fm-drag-start]").forEach((el) => {
    el.addEventListener("dragstart", (ev) => {
      const mb = el.dataset.mailbox?.trim();
      if (!mb) return;
      state.folderManager.dragFolder = mb;
      ev.dataTransfer?.setData("text/plain", mb);
      ev.dataTransfer!.effectAllowed = "move";
    });
    el.addEventListener("dragend", () => {
      state.folderManager.dragFolder = null;
      state.folderManager.dropTarget = null;
      render();
    });
  });
  document.querySelectorAll<HTMLElement>("[data-drop-mailbox]").forEach((el) => {
    el.addEventListener("dragover", (ev) => {
      const target = el.dataset.dropMailbox?.trim();
      if (!target) return;
      const isThread = ev.dataTransfer?.types.includes("application/x-rustymail-thread");
      const from = state.folderManager.dragFolder;
      if (isThread) {
        ev.preventDefault();
        state.folderManager.dropTarget = target;
        ev.dataTransfer!.dropEffect = "move";
        return;
      }
      if (!from || target === from || isDescendantMailboxPath(from, target)) return;
      ev.preventDefault();
      state.folderManager.dropTarget = target;
      ev.dataTransfer!.dropEffect = "move";
    });
    el.addEventListener("dragleave", () => {
      state.folderManager.dropTarget = null;
    });
    el.addEventListener("drop", (ev) => {
      ev.preventDefault();
      const target = el.dataset.dropMailbox?.trim();
      const tid = ev.dataTransfer?.getData("application/x-rustymail-thread")?.trim();
      const from = state.folderManager.dragFolder ?? ev.dataTransfer?.getData("text/plain")?.trim();
      state.folderManager.dropTarget = null;
      if (tid && target) {
        void onThreadMoveTo(tid, target).then(async () => {
          await refreshFolderManagerTree();
          if (state.folderManager.selectedMailbox) await fmSelectMailbox(state.folderManager.selectedMailbox);
        });
        return;
      }
      if (from && target) void fmMoveFolder(from, target);
    });
  });
  document.querySelectorAll<HTMLElement>(".inbox-thread-row[data-thread-id]").forEach((el) => {
    el.setAttribute("draggable", "true");
    el.addEventListener("dragstart", (ev) => {
      const tid = el.dataset.threadId?.trim();
      if (!tid) return;
      ev.dataTransfer?.setData("application/x-rustymail-thread", tid);
      ev.dataTransfer!.effectAllowed = "move";
    });
  });
}

async function openOrganizationMailbox(mailbox: string) {
  const mb = mailbox.trim();
  if (!mb) return;
  beginNavigation("list");
  state.view = "list";
  state.selectedContactEmail = undefined;
  exitSearchModeForMailboxBrowse();
  await switchMailbox(mb);
  render();
}

async function openContactsView() {
  const acc = currentAccount();
  if (!acc?.id) {
    toast("Configurez un compte pour le carnet.");
    return;
  }
  beginNavigation("contacts", { resetStack: true });
  state.view = "contacts";
  state.selectedContactEmail = undefined;
  clearContactProfile();
  state.mailboxDigestPanelOpen = false;
  state.aiOpen = false;
  clearThreadAiSummaryState();
  render();
  try {
    await loadContactsList(acc.id, { reset: true });
    await loadAddressBookSidebarCount();
  } catch (e) {
    toast(tauriErrorMessage(e));
  }
  render();
}

async function openContactDetailView(email: string, opts?: { skipHistory?: boolean }) {
  const acc = currentAccount();
  if (!acc?.id) return;
  const em = email.trim().toLowerCase();
  if (!em) return;
  beginNavigation("contact", { skipHistory: opts?.skipHistory });
  state.view = "contact";
  state.selectedContactEmail = em;
  clearContactProfile();
  render();
  try {
    await loadContactDetail(acc.id, em);
  } catch (e) {
    toast(tauriErrorMessage(e));
  }
  recordActivity({ eventType: "contact_opened", senderEmail: em });
  render();
}

function launchContactMailSearch(opts: {
  email: string;
  listFilter?: State["listFilter"];
  text?: string;
  hybrid?: boolean;
}) {
  const email = opts.email.trim().toLowerCase();
  if (!email) return;
  navReset();
  state.view = "list";
  state.searchModalOpen = false;
  state.searchAccountOverrideId = null;
  state.searchMailboxPath = null;
  state.searchTags = [];
  state.searchNewsletterRule = null;
  state.searchLanguageFilter = null;
  state.searchSenders = [email];
  state.search = opts.text?.trim() ?? "";
  state.searchDraft = state.search;
  state.listFilter = opts.listFilter ?? "all";
  state.searchNlMode = opts.hybrid ? "hybrid" : null;
  state.searchScope = "account";
  state.searchModifiersTouched = true;
  state.selectedContactEmail = undefined;
  render();
  void searchThreads();
}

async function loadAddressBookSidebarCount(): Promise<void> {
  if (!isTauriRuntime()) {
    state.addressBookSidebarCount = null;
    return;
  }
  const acc = currentAccount();
  if (!acc?.id) {
    state.addressBookSidebarCount = null;
    return;
  }
  try {
    const n = await invoke<number>("count_address_contacts_scoped_cmd", { accountId: acc.id });
    state.addressBookSidebarCount = Math.max(0, Math.floor(Number(n)) || 0);
  } catch {
    state.addressBookSidebarCount = null;
  }
}

const SAVED_VIEW_BATCH_MAX = 500;

function buildSearchQueryFromCurrentState() {
  return buildSearchQueryPayload({
    search: state.search,
    searchTags: state.searchTags,
    searchSenders: state.searchSenders,
    searchNlMode: state.searchNlMode,
    searchLanguageFilter: state.searchLanguageFilter,
    accountId: searchAccountIdForQuery(),
    mailbox: searchMailboxForQuery(),
    semanticSearchEnabled: state.appPrefs.ai.semanticSearchEnabled,
    semanticModelAvailable: state.semanticModelAvailable,
  });
}

function syncCommitSearchDraftForSave(): void {
  if (!searchDraftDiffersFromCommitted()) return;
  const draftSnap = draftSearchCriteriaSnapshot();
  if (!hasSavableSearchCriteria(draftSnap)) return;
  if (searchCriteriaSnapshotsEqual(draftSnap, committedSearchCriteriaSnapshot())) return;
  const raw = state.searchDraft.trim();
  const parsed = parseSearchBarDraft(raw, state.newsletterRules);
  resetSearchStructuralModifiers();
  applyParsedSearchBarToState(parsed);
  state.search = parsed.text;
  state.searchModifiersTouched = false;
}

function suggestSavedSearchName(): string {
  if (state.searchTags.length === 1) {
    const t = state.searchTags[0]!;
    return `#${String(t.family).toLowerCase()}:${t.value}`.slice(0, 100);
  }
  if (state.searchSenders.length === 1) return state.searchSenders[0]!.slice(0, 100);
  const q = state.search.trim();
  if (q) return q.slice(0, 100);
  if (state.searchNewsletterRule) return formatNewsletterRuleInput(state.searchNewsletterRule).slice(0, 100);
  return "Ma vue";
}

function findNewsletterRuleByParts(domain: string, localPart: string | null): NewsletterRuleRow | null {
  const dom = domain.trim().toLowerCase();
  if (!dom) return null;
  const lp = (localPart?.trim() || "*").toLowerCase();
  const hit = state.newsletterRules.find(
    (r) => r.domain.toLowerCase() === dom && (r.localPart ?? "*").toLowerCase() === lp,
  );
  if (hit) return hit;
  return { domain: dom, localPart: lp };
}

async function refreshSavedSearches(includeCounts = true): Promise<void> {
  if (!isTauriRuntime()) {
    state.savedSearches = [];
    return;
  }
  const accountId = currentAccount()?.id?.trim();
  if (!accountId) {
    state.savedSearches = [];
    state.activeSavedSearchId = null;
    return;
  }
  try {
    state.savedSearches = await listSavedSearchesCmd(accountId, includeCounts);
    if (state.activeSavedSearchId && !state.savedSearches.some((s) => s.id === state.activeSavedSearchId)) {
      state.activeSavedSearchId = null;
    }
  } catch (e) {
    console.warn("list_saved_searches", e);
  }
}

async function markActiveSavedSearchSeen(options?: { toast?: boolean }): Promise<boolean> {
  const accountId = currentAccount()?.id?.trim();
  const sid = state.activeSavedSearchId;
  if (!accountId || !sid) {
    if (options?.toast !== false) toast("Aucune vue active à marquer.");
    return false;
  }
  if (state.savedSearchMarkingSeenId === sid) return false;
  state.savedSearchMarkingSeenId = sid;
  try {
    patchSavedSearchNewCount(sid, 0);
    render();
    const updated = await markSavedSearchSeenCmd(accountId, sid);
    patchSavedSearchNewCount(sid, 0, updated.lastSeenAt ?? undefined);
    recordActivity({ eventType: "saved_view_seen", metaJson: JSON.stringify({ savedSearchId: sid }) });
    await refreshSavedSearches(true);
    const row = state.savedSearches.find((s) => s.id === sid);
    if (row && (row.newCount ?? 0) > 0) patchSavedSearchNewCount(sid, 0, updated.lastSeenAt ?? undefined);
    if (options?.toast) toast("Vue marquée à jour.");
    render();
    return true;
  } catch (e) {
    await refreshSavedSearches(true);
    render();
    toast(tauriErrorMessage(e));
    return false;
  } finally {
    state.savedSearchMarkingSeenId = null;
  }
}

async function saveCurrentSearchView(): Promise<void> {
  if (!isTauriRuntime()) {
    toast("Vues enregistrées : disponible dans l’app Tauri.");
    return;
  }
  const accountId = searchAccountIdForQuery();
  if (!accountId) {
    toast("Choisissez un compte avant d’enregistrer une vue.");
    return;
  }
  syncCommitSearchDraftForSave();
  if (!canSaveSearchView()) {
    toast("Lancez d’abord la recherche (Entrée), puis enregistrez la vue.");
    return;
  }
  const defaultName = suggestSavedSearchName();
  const name = window.prompt("Nom de la vue enregistrée", defaultName);
  if (name === null) return;
  const trimmed = name.trim();
  if (!trimmed) {
    toast("Nom de vue invalide.");
    return;
  }
  const query = buildSearchQueryFromCurrentState();
  const ui = buildSavedSearchUiState({
    listFilter: state.listFilter,
    searchScope: state.searchScope,
    searchNlMode: state.searchNlMode,
    searchDraft: state.searchDraft,
    searchNewsletterRule: state.searchNewsletterRule,
    searchModifiersTouched: state.searchModifiersTouched,
  });
  try {
    const saved = await upsertSavedSearchCmd(buildSavedSearchUpsert(accountId, trimmed, query, ui));
    state.activeSavedSearchId = saved.id;
    await markSavedSearchSeenCmd(accountId, saved.id);
    recordActivity({ eventType: "saved_view_created", metaJson: JSON.stringify({ savedSearchId: saved.id }) });
    toast(`Vue « ${trimmed} » enregistrée — surveillance à jour.`);
    await refreshSavedSearches(true);
    await refreshSuggestedSavedViews();
    render();
  } catch (e) {
    toast(tauriErrorMessage(e));
  }
}

async function applySavedSearchView(id: string): Promise<void> {
  if (!isTauriRuntime()) return;
  const accountId = currentAccount()?.id?.trim();
  if (!accountId) {
    toast("Compte requis pour ouvrir une vue.");
    return;
  }
  try {
    const saved = await applySavedSearchCmd(accountId, id);
    state.activeSavedSearchId = saved.id;
    state.view = "list";
    state.selectedContactEmail = undefined;
    await markSavedSearchSeenCmd(accountId, saved.id);
    applySavedSearchToState(saved, state, {
      findNewsletterRule: findNewsletterRuleByParts,
      resolveMailboxPath: resolveSearchMailboxPath,
    });
    if (saved.query.accountId?.trim()) {
      state.selectedAccountId = saved.query.accountId.trim();
    }
    document.querySelectorAll<HTMLInputElement>("#search-input, #search-modal-input").forEach((el) => {
      el.value = state.searchDraft;
    });
    await searchThreads();
    recordActivity({ eventType: "saved_view_applied", metaJson: JSON.stringify({ savedSearchId: saved.id }) });
    await refreshSavedSearches(true);
    await refreshSuggestedSavedViews();
    render();
  } catch (e) {
    toast(tauriErrorMessage(e));
  }
}

async function deleteSavedSearchView(id: string): Promise<void> {
  const accountId = currentAccount()?.id?.trim();
  if (!accountId || !id.trim()) return;
  const item = state.savedSearches.find((s) => s.id === id);
  const ok = await openConfirmModal({
    title: "Supprimer la vue ?",
    body: item ? `« ${item.name} » sera retirée de la sidebar.` : "Cette vue sera supprimée.",
    danger: true,
    confirmLabel: "Supprimer",
  });
  if (!ok) return;
  try {
    await deleteSavedSearchCmd(accountId, id);
    if (state.activeSavedSearchId === id) state.activeSavedSearchId = null;
    toast("Vue supprimée.");
    await refreshSavedSearches(true);
    render();
  } catch (e) {
    toast(tauriErrorMessage(e));
  }
}

function searchViewBatchThreads(): ThreadListItem[] {
  return threadsVisibleInList().slice(0, SAVED_VIEW_BATCH_MAX);
}

async function bulkMarkReadSearchViewThreads(): Promise<void> {
  if (!isTauriRuntime()) {
    toast("Marquer lus : IMAP requiert l’app Tauri.");
    return;
  }
  if (!isSearchActive() && !state.activeSavedSearchId) {
    toast("Actions lot : ouvrez une recherche ou une vue enregistrée.");
    return;
  }
  const account = currentAccount();
  if (!account) {
    toast("Configurez d’abord un compte IMAP.");
    return;
  }
  const visible = searchViewBatchThreads();
  if (!visible.length) {
    toast("Aucune conversation dans cette vue.");
    return;
  }
  const ok = await openConfirmModal({
    title: "Marquer comme lus ?",
    body: `Marquer comme lus jusqu’à ${visible.length} conversation(s) affichée(s) (plafond ${SAVED_VIEW_BATCH_MAX}).`,
    confirmLabel: "Marquer lus",
  });
  if (!ok) return;
  recordActivity({
    eventType: "bulk_mark_read",
    metaJson: JSON.stringify({ count: visible.length }),
  });
  const unreadTargets = visible.filter((t) => t.unread);
  let done = 0;
  const errors: string[] = [];
  const total = unreadTargets.length;
  if (total > 0) upsertStatusBarJob({ id: "bulk-mark-read", label: "Marquage lu (lot)", done: 0, total }, true);
  try {
    for (let i = 0; i < unreadTargets.length; i++) {
      const t = unreadTargets[i]!;
      const tid = String(t.id);
      try {
        const mailbox = sourceMailboxForThread(tid);
        await withTimeout(
          invoke<string>("thread_mark_read", { accountId: account.id, mailbox, threadId: tid }),
          MAIL_ACTION_TIMEOUT_MS,
        );
        t.unread = false;
        done++;
      } catch (err) {
        errors.push(tauriErrorMessage(err));
      }
      upsertStatusBarJob({ id: "bulk-mark-read", label: "Marquage lu (lot)", done: i + 1, total });
    }
  } finally {
    clearStatusBarJob("bulk-mark-read");
  }
  if (errors.length) toast(`Marquage partiel : ${errors[0]}`);
  else toast(done ? `${done} conversation(s) marquée(s) lue(s).` : "Aucun fil non lu dans la sélection.");
  render();
}

async function bulkArchiveSearchViewThreads(): Promise<void> {
  if (!isTauriRuntime()) {
    toast("Archivage : IMAP requiert l’app Tauri.");
    return;
  }
  if (!isSearchActive() && !state.activeSavedSearchId) {
    toast("Actions lot : ouvrez une recherche ou une vue enregistrée.");
    return;
  }
  const account = currentAccount();
  if (!account) {
    toast("Configurez d’abord un compte IMAP.");
    return;
  }
  if (isSavedDraftsVirtualMailbox(state.selectedMailbox)) {
    toast("Archivage : actions IMAP uniquement.");
    return;
  }
  const visible = searchViewBatchThreads();
  if (!visible.length) {
    toast("Aucune conversation dans cette vue.");
    return;
  }
  const ok = await openConfirmModal({
    title: "Archiver le lot ?",
    body: `Archiver jusqu’à ${visible.length} conversation(s) (plafond ${SAVED_VIEW_BATCH_MAX}).`,
    confirmLabel: "Archiver",
  });
  if (!ok) return;
  recordActivity({
    eventType: "bulk_archive",
    metaJson: JSON.stringify({ count: visible.length }),
  });
  const prevThreads = state.threads;
  const ids = new Set(visible.map((t) => String(t.id)));
  markThreadsRecentlyRemoved(ids);
  state.threads = state.threads.filter((t) => !ids.has(String(t.id)));
  if (state.view === "thread" && state.selectedThreadId && ids.has(String(state.selectedThreadId))) {
    state.view = "list";
    state.selectedThread = undefined;
    state.selectedThreadId = undefined;
  }
  render();
  let moved = 0;
  const errors: string[] = [];
  const idList = [...ids];
  const total = idList.length;
  upsertStatusBarJob({ id: "bulk-archive", label: "Archivage (lot)", done: 0, total }, true);
  try {
    for (let i = 0; i < idList.length; i++) {
      const tid = idList[i]!;
      try {
        const mailbox = sourceMailboxForThread(tid);
        await withTimeout(
          invoke<string>("move_thread_archive", { accountId: account.id, mailbox, threadId: tid }),
          MAIL_ACTION_TIMEOUT_MS,
        );
        moved++;
      } catch (err) {
        errors.push(tauriErrorMessage(err));
      }
      upsertStatusBarJob({ id: "bulk-archive", label: "Archivage (lot)", done: i + 1, total });
    }
  } finally {
    clearStatusBarJob("bulk-archive");
  }
  if (errors.length) {
    clearThreadsRecentlyRemoved(ids);
    state.threads = prevThreads;
    toast(`Archivage partiel : ${errors[0]}`);
    render();
    return;
  }
  toast(`${moved} conversation(s) archivée(s).`);
  await searchThreads();
}

type FluxAffinerResult = {
  folderTitle: string;
  confidence: number;
  rationale: string;
};

async function runFluxAffinerFromSearchView(): Promise<void> {
  if (!isTauriRuntime()) {
    toast("Affiner : disponible dans l’app Tauri.");
    return;
  }
  if (!isAiFeatureEnabled(state.appPrefs.ai, "featureOrgProposalsEnabled")) {
    toast("Activez « Propositions Organiser (LLM) » dans Paramètres → IA.");
    return;
  }
  const account = currentAccount();
  if (!account?.id) {
    toast("Compte requis.");
    return;
  }
  const visible = searchViewBatchThreads().slice(0, 50);
  if (visible.length < 5) {
    toast("Affiner : au moins 5 fils visibles requis.");
    return;
  }
  const viewLabel =
    activeSavedSearchItem()?.name?.trim() ||
    state.search.trim() ||
    "Recherche";
  const samples = visible.map((t) => ({
    subject: t.subject,
    sender: t.participants[0] ?? "",
    mailbox: t.mailbox ?? state.selectedMailbox ?? "INBOX",
  }));
  try {
    const result = await withLlmQueue("Affiner le flux", async (signal) => {
      if (signal.aborted) throw new Error("Annulé");
      return withTimeout(
        invoke<FluxAffinerResult>("llm_affiner_flux_cmd", {
          payload: {
            accountId: account.id,
            viewLabel,
            samples,
            existingMailboxes: state.mailboxes,
          },
        }),
        LLM_INVOKE_TIMEOUT_MS,
      );
    });
    if (!result) return;
    const pct = Math.round(Math.max(0, Math.min(1, result.confidence)) * 100);
    const ok = await openConfirmModal({
      title: "Affiner — dossier suggéré",
      body: `« ${result.folderTitle} » (${pct} % de confiance)\n\n${result.rationale}\n\nCréer ce dossier IMAP et y déplacer ${visible.length} fil(s) ?`,
      confirmLabel: "Créer et déplacer",
    });
    if (!ok) return;
    const mailbox = result.folderTitle.trim();
    const total = visible.length;
    setSearchViewBatchJob({ phase: "create", done: 0, total: 1, target: mailbox });
    toast(`Création du dossier « ${mailbox} »…`, 4500);
    await withTimeout(
      invoke<string>("create_imap_mailbox", { accountId: account.id, mailbox }),
      MAIL_ACTION_TIMEOUT_MS,
    );
    setSearchViewBatchJob({ phase: "move", done: 0, total, target: mailbox });
    toast(`Déplacement de ${total} fil(s) vers « ${mailbox} »…`, 5000);
    const ids = new Set(visible.map((t) => String(t.id)));
    let moved = 0;
    const errors: string[] = [];
    for (const t of visible) {
      const tid = String(t.id);
      const src = (t.mailbox?.trim() || sourceMailboxForThread(tid)).trim() || "INBOX";
      try {
        await withTimeout(
          invoke<string>("move_thread_mailbox", {
            accountId: account.id,
            mailbox: src,
            threadId: tid,
            destMailbox: mailbox,
          }),
          MAIL_ACTION_TIMEOUT_MS,
        );
        moved++;
        setSearchViewBatchJob({ phase: "move", done: moved, total, target: mailbox });
      } catch (err) {
        errors.push(tauriErrorMessage(err));
      }
    }
    setSearchViewBatchJob(null, false);
    if (moved > 0) {
      state.threads = state.threads.filter((row) => !ids.has(String(row.id)));
      if (state.view === "thread" && state.selectedThreadId && ids.has(String(state.selectedThreadId))) {
        state.view = "list";
        state.selectedThread = undefined;
        state.selectedThreadId = undefined;
      }
    }
    if (errors.length && moved === 0) {
      toast(`Déplacement échoué : ${errors[0]}`, 10_000);
    } else if (errors.length) {
      toast(`${moved}/${total} fil(s) déplacé(s) vers « ${mailbox} » · ${errors.length} échec(s).`, 10_000);
    } else {
      toast(`${moved} fil(s) déplacé(s) vers « ${mailbox} ».`, 10_000);
    }
    state.syncMessage = moved > 0 ? `${moved} déplacé(s) → ${mailbox}` : "";
    if (moved > 0) {
      recordActivity({
        eventType: "affiner_applied",
        metaJson: JSON.stringify({ mailbox, moved, total }),
      });
    }
    await refreshMailboxesAfterImapChange();
    if (moved > 0) await searchThreads();
    else render();
    if (state.syncMessage) {
      window.setTimeout(() => {
        if (state.syncMessage === `${moved} déplacé(s) → ${mailbox}`) {
          state.syncMessage = "";
          render();
        }
      }, 3500);
    }
  } catch (e) {
    setSearchViewBatchJob(null, false);
    const msg = tauriErrorMessage(e);
    if (!msg.toLowerCase().includes("annul")) toast(msg);
  }
}

async function launchDomainMailSearch(domain: string): Promise<void> {
  const dom = domain.trim().toLowerCase().replace(/^@+/, "");
  if (!dom) return;
  const acc = currentAccount();
  if (!acc?.id || !isTauriRuntime()) {
    toast("Recherche domaine : compte ou Tauri requis.");
    return;
  }
  try {
    const senders = await invoke<string[]>("list_sender_emails_for_domain_cmd", {
      accountId: acc.id,
      domain: dom,
    });
    const emails = (senders ?? []).map((s) => s.trim().toLowerCase()).filter((s) => s.includes("@"));
    if (!emails.length) {
      toast(`Aucun expéditeur local pour @${dom}.`);
      return;
    }
    navReset();
    state.view = "list";
    state.searchModalOpen = false;
    state.searchAccountOverrideId = null;
    state.searchMailboxPath = null;
    state.searchTags = [];
    state.searchNewsletterRule = null;
    state.searchLanguageFilter = null;
    state.searchSenders = emails;
    state.search = "";
    state.searchDraft = "";
    state.listFilter = "all";
    state.searchNlMode = null;
    state.searchScope = "account";
    state.searchModifiersTouched = true;
    state.selectedContactEmail = undefined;
    render();
    void searchThreads();
  } catch (e) {
    toast(tauriErrorMessage(e));
  }
}

function renderAddressBookSidebarCountPill(): string {
  const n = state.addressBookSidebarCount;
  if (n == null || n < 0) return "";
  const title = `${n} contact${n === 1 ? "" : "s"} dans le carnet`;
  return `<span class="folder-count folder-count-wrap" title="${escapeAttr(title)}"><span class="folder-count-num">${n}</span></span>`;
}

function renderMain() {
  if (state.view === "thread") return renderThread();
  if (state.view === "compose") return renderComposer();
  if (state.view === "settings") return renderSettings();
  if (state.view === "contacts") {
    const acc = currentAccount();
    return renderContactsListPage(acc?.displayName || acc?.email || "Compte");
  }
  if (state.view === "contact") return renderContactDetailPage();
  if (state.view === "organization") {
    return renderOrganizationView(state.organization, {
      escapeHtml,
      escapeAttr,
      iconSvg: (name) => iconSvg(name as Parameters<typeof iconSvg>[0]),
      renderThreadSample: renderOrgThreadSampleRow,
      mailboxLabel: (mb) => threadMailboxListLabel(mb).label,
    });
  }
  if (state.view === "organizationV2") {
    return renderOrganizationV2View(state.organizationV2, {
      escapeHtml,
      escapeAttr,
      iconSvg: (name) => iconSvg(name as Parameters<typeof iconSvg>[0]),
      renderThreadSample: renderOrgThreadSampleRow,
      mailboxLabel: (mb) => threadMailboxListLabel(mb).label,
    });
  }
  if (state.view === "folderManager") {
    return renderFolderManagerView(state.folderManager, {
      escapeHtml,
      escapeAttr,
      iconSvg: (name) => iconSvg(name as Parameters<typeof iconSvg>[0]),
      mailboxLabel: (mb) => threadMailboxListLabel(mb).label,
      renderSearchFilters: () => renderList("filters-only"),
      renderListPanel: () => renderList("threads-only"),
    });
  }
  return renderList();
}

function isSearchActive(): boolean {
  if (state.view === "folderManager" && folderManagerPanelMailbox()) return false;
  if (state.activeSavedSearchId) return true;
  return hasCommittedSearchCriteria(committedSearchCriteriaSnapshot());
}

/** Liste chargée via barre de recherche / `#` (portée compte), pas la simple navigation dossier. */
function usesSearchContextLoader(): boolean {
  if (state.view === "folderManager" && folderManagerBrowsingPanel()) return false;
  if (isSavedDraftsVirtualMailbox(listMailboxForPanel())) return false;
  if (isSearchActive()) return true;
  return (
    state.searchScope === "account" &&
    (state.listFilter !== "all" || state.searchNewsletterRule !== null)
  );
}

function threadMatchesNewsletterRule(thread: ThreadListItem, rule: NewsletterRuleRow): boolean {
  for (const p of thread.participants) {
    const matched = firstMatchingNewsletterRule(p);
    if (!matched) continue;
    if (
      matched.domain.toLowerCase() === rule.domain.toLowerCase() &&
      matched.localPart.toLowerCase() === (rule.localPart ?? "*").toLowerCase()
    ) {
      return true;
    }
  }
  return false;
}

function mergeSearchBarTagOnTarget(
  target: SearchStructuralState & { searchTags: Tag[] },
  raw: { family: string; value: string }
): void {
  const value = raw.value.trim();
  if (!value) return;
  const family = tagFamilyForInvoke(raw.family);
  const key = `${family}:${value}`.toLowerCase();
  if (target.searchTags.some((t) => `${t.family}:${t.value}`.toLowerCase() === key)) return;
  target.searchTags.push({ family, value });
}

function addSearchSenderOnTarget(target: SearchStructuralState, email: string): void {
  const c = canonicalEmailForNlMatch(email) ?? email.trim().toLowerCase();
  if (!c) return;
  if (!target.searchSenders.some((s) => s.toLowerCase() === c)) target.searchSenders.push(c);
}

function applyParsedSearchBarToStructural(
  target: SearchStructuralState & { searchTags: Tag[] },
  parsed: ReturnType<typeof parseSearchBarDraft>
): void {
  target.search = parsed.text;
  if (parsed.scope !== undefined) target.searchScope = parsed.scope;
  if (parsed.mailboxPath !== undefined) {
    const raw = parsed.mailboxPath?.trim() || null;
    target.searchMailboxPath = raw ? resolveSearchMailboxPath(raw) : null;
    if (target.searchMailboxPath) target.searchScope = "mailbox";
  }
  if (parsed.accountRef !== undefined) {
    const id = parsed.accountRef?.trim() ? resolveAccountIdFromRef(parsed.accountRef) : null;
    target.searchAccountOverrideId = id;
    if (id && target === state) {
      state.selectedAccountId = id;
      target.searchScope = "account";
    } else if (id) {
      target.searchScope = "account";
    } else if (!parsed.accountRef?.trim()) {
      target.searchAccountOverrideId = null;
    }
  }
  for (const s of parsed.senders) addSearchSenderOnTarget(target, s);
  for (const t of parsed.tags) mergeSearchBarTagOnTarget(target, t);
  if (parsed.listFilter !== undefined) {
    target.listFilter = parsed.listFilter;
    if (parsed.listFilter === "all") target.searchNewsletterRule = null;
  }
  if (parsed.newsletterRule !== undefined) {
    target.searchNewsletterRule = parsed.newsletterRule;
  }
}

function applyParsedSearchBarToState(parsed: ReturnType<typeof parseSearchBarDraft>): void {
  applyParsedSearchBarToStructural(state, parsed);
}

function hasSearchBarCriteria(): boolean {
  return Boolean(
    state.search.trim() ||
      state.searchSenders.length > 0 ||
      state.searchMailboxPath?.trim() ||
      state.searchAccountOverrideId?.trim() ||
      state.searchTags.length > 0 ||
      state.searchNewsletterRule ||
      state.searchLanguageFilter?.trim() ||
      state.listFilter !== "all" ||
      state.searchModifiersTouched
  );
}

function toastSearchBarResult(): void {
  const n = threadsVisibleInList().length;
  const mbTarget = searchMailboxForQuery();
  const scope =
    state.searchScope === "account" && !mbTarget
      ? " · tout le compte"
      : ` · ${threadMailboxListLabel(mbTarget ?? (state.selectedMailbox || "INBOX")).full}`;
  const parts: string[] = [];
  if (state.searchSenders.length) parts.push(`de: ${state.searchSenders.join(", ")}`);
  if (state.searchMailboxPath?.trim()) parts.push(`dossier: ${state.searchMailboxPath}`);
  if (state.searchTags.length) parts.push(`${state.searchTags.length} tag(s)`);
  if (state.search.trim()) parts.push(`« ${state.search.trim()} »`);
  if (state.searchNewsletterRule) parts.push(formatNewsletterRuleInput(state.searchNewsletterRule));
  if (state.listFilter === "auto") parts.push("auto");
  else if (state.listFilter === "focused") parts.push("priorité");
  else if (state.listFilter === "unread") parts.push("non lus");
  else if (state.listFilter === "starred") parts.push("suivis");
  const hint = parts.length ? parts.join(" · ") : "tous les messages";
  if (n === 0) {
    const scopeHint =
      state.searchScope === "mailbox"
        ? " Essayez #compte dans la barre si les messages sont dans un autre dossier."
        : "";
    toast(`Aucun résultat (${hint})${scope}.${scopeHint}`);
  }
  else toast(`${n} conversation${n === 1 ? "" : "s"} · ${hint}${scope}.`);
}

async function applySearchBarQuery(): Promise<void> {
  if (searchQueryUsesThreadsApi()) {
    await searchThreads();
    return;
  }
  if (isSearchActive()) {
    await loadThreadsForSearchContext(false);
    return;
  }
  await loadMailView(false);
}

function applyHashAutocompleteHitToState(hit: InboxFilterHit): void {
  state.searchModifiersTouched = true;
  const searchIn = document.querySelector<HTMLInputElement>("#search-input");
  if (searchIn) state.searchDraft = searchIn.value;

  if (hit.id.startsWith("mailbox:")) {
    const raw = hit.id.slice(8);
    state.searchMailboxPath = resolveSearchMailboxPath(raw) ?? raw;
    state.searchScope = "mailbox";
    return;
  }
  if (hit.id.startsWith("account:")) {
    const id = hit.id.slice(8);
    state.searchAccountOverrideId = id;
    state.selectedAccountId = id;
    state.searchScope = "account";
    return;
  }
  if (hit.id.startsWith("tag:")) {
    const body = hit.id.slice(4);
    const sep = body.indexOf("\0");
    if (sep >= 0) {
      mergeSearchBarTag({ family: body.slice(0, sep), value: body.slice(sep + 1) });
    }
    return;
  }
  if (hit.id === "scope:account") {
    state.searchScope = "account";
    state.searchMailboxPath = null;
    return;
  }
  if (hit.id === "scope:mailbox") {
    state.searchScope = "mailbox";
    state.searchMailboxPath = null;
  }
}

async function applyInboxFilterFromHashHit(hit: InboxFilterHit): Promise<void> {
  if (isSavedDraftsVirtualMailbox(state.selectedMailbox)) return;
  applyHashAutocompleteHitToState(hit);
  if (hit.id.startsWith("mailbox:")) {
    toast(`Dossier : ${state.searchMailboxPath}`);
    if (hasSearchBarCriteria()) {
      await applySearchBarQuery();
      toastSearchBarResult();
    }
    render();
    return;
  }
  if (hit.id.startsWith("account:")) {
    const id = hit.id.slice(8);
    state.mailboxes = await safeInvoke<string[]>("list_imap_mailboxes", { accountId: id }, [], BOOT_INVOKE_TIMEOUT_MS);
    ensureValidSelectedMailbox();
    const acc = state.accounts.find((a) => a.id === id);
    toast(`Compte : ${acc?.email ?? id}`);
    void refreshSearchTagCatalog();
    if (hasSearchBarCriteria()) {
      await applySearchBarQuery();
      toastSearchBarResult();
    }
    render();
    return;
  }
  if (hit.id.startsWith("tag:")) {
    const body = hit.id.slice(4);
    const sep = body.indexOf("\0");
    if (sep >= 0) {
      toast(`Tag : ${body.slice(0, sep)}:${body.slice(sep + 1)}`);
      if (hasSearchBarCriteria()) {
        await applySearchBarQuery();
        toastSearchBarResult();
      }
    }
    render();
    return;
  }
  if (hit.id.startsWith("scope:")) {
    toast(
      state.searchScope === "account"
        ? "Portée : tout le compte (tous dossiers synchronisés)"
        : `Portée : ${threadMailboxListLabel(state.selectedMailbox || "INBOX").full}`
    );
    if (hasSearchBarCriteria()) {
      await applySearchBarQuery();
      toastSearchBarResult();
    }
    render();
    return;
  }
  resetManualSearchNlFilters();
  state.searchSenders = [];
  state.search = "";
  state.searchDraft = "";
  if (hit.id.startsWith("list:")) {
    state.searchNewsletterRule = null;
    const kind = hit.id.slice(5) as State["listFilter"];
    state.listFilter = kind;
    await applySearchBarQuery();
    toastSearchBarResult();
    render();
    return;
  }
  if (hit.id.startsWith("rule:")) {
    const body = hit.id.slice(5);
    const sep = body.indexOf("\0");
    if (sep < 0) return;
    state.searchNewsletterRule = {
      domain: body.slice(0, sep),
      localPart: body.slice(sep + 1),
    };
    state.listFilter = "all";
    await applySearchBarQuery();
    toastSearchBarResult();
    render();
  }
}

function searchDraftDiffersFromCommitted(): boolean {
  return !searchCriteriaSnapshotsEqual(
    draftSearchCriteriaSnapshot(),
    committedSearchCriteriaSnapshot()
  );
}

function resetManualSearchNlFilters(): void {
  state.searchNlMode = null;
  state.searchLanguageFilter = null;
}

function resetSearchStructuralModifiers(): void {
  resetSearchStructuralState(state);
}

async function clearSearchAndReloadInbox(): Promise<void> {
  state.search = "";
  state.searchDraft = "";
  state.searchSenders = [];
  state.searchMailboxPath = null;
  state.searchAccountOverrideId = null;
  state.searchTags = [];
  state.searchNewsletterRule = null;
  state.searchScope = "account";
  state.searchModifiersTouched = false;
  state.activeSavedSearchId = null;
  resetManualSearchNlFilters();
  await loadMailView(false);
  render();
}

function threadsVisibleInList(): ThreadListItem[] {
  let base = state.threads;
  if (isSavedDraftsVirtualMailbox(state.selectedMailbox)) return base;
  if (state.searchNewsletterRule) {
    const rule = state.searchNewsletterRule;
    base = base.filter((t) => threadMatchesNewsletterRule(t, rule));
  }
  /** Résultats recherche : ne pas masquer via les puces Non lus / Priorité / Auto. */
  if (isSearchActive()) return base;
  if (state.listFilter === "unread") return base.filter((t) => t.unread);
  if (state.listFilter === "starred") return base.filter((t) => threadListFollowed(t));
  if (state.listFilter === "focused") return base.filter((t) => !t.isNewsletterThread);
  if (state.listFilter === "auto") return base.filter((t) => Boolean(t.isNewsletterThread));
  return base;
}

function threadListFollowed(thread: ThreadListItem): boolean {
  return Boolean(thread.followed);
}

function inboxSearchIconSvg() {
  return `<svg class="inbox-search-svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.35-4.35"/></svg>`;
}

function activeMessageTranslationJobCount(): number {
  return Object.values(state.messageTranslationBusy).filter(Boolean).length;
}

function activeSecurityLlmAugmentCount(): number {
  let n = 0;
  for (const v of Object.values(securityLlmAugmentBusy)) {
    if (v) n += 1;
  }
  return n;
}

function orgApplyStatusMessage(
  proposalId: string,
  actionOverride?: import("./organizationView").OrgActionOverride | null,
): string {
  if (actionOverride === "trash") return "Mise en corbeille (lot)…";
  if (actionOverride === "archive") return "Archivage (lot)…";
  if (actionOverride === "markRead") return "Marquage comme lu (lot)…";
  const p = state.organization.report?.proposals.find((x) => x.id === proposalId);
  if (!p) return "Traitement organisation…";
  switch (p.suggestedAction) {
    case "retag":
      return "Normalisation des tags (lot)…";
    case "archive":
      return "Archivage (lot)…";
    case "trash":
      return "Mise en corbeille (lot)…";
    case "markRead":
      return "Marquage comme lu (lot)…";
    case "move":
      return p.targetMailbox ? `Déplacement vers « ${p.targetMailbox} »…` : "Déplacement (lot)…";
    case "deleteMailbox":
      return "Suppression des dossiers vides…";
    default:
      return "Traitement organisation…";
  }
}

let statusBarProgressPaintQueued = false;

function upsertStatusBarJob(job: StatusBarProgressJob, renderNow = false): void {
  const idx = state.statusBarJobs.findIndex((j) => j.id === job.id);
  if (idx >= 0) state.statusBarJobs[idx] = job;
  else state.statusBarJobs.push(job);
  if (renderNow) {
    render();
    return;
  }
  scheduleStatusBarProgressPaint();
}

function clearStatusBarJob(id: string, renderNow = false): void {
  const before = state.statusBarJobs.length;
  state.statusBarJobs = state.statusBarJobs.filter((j) => j.id !== id);
  if (before === state.statusBarJobs.length && !renderNow) return;
  if (renderNow) render();
  else scheduleStatusBarProgressPaint();
}

function scheduleStatusBarProgressPaint(): void {
  if (statusBarProgressPaintQueued) return;
  statusBarProgressPaintQueued = true;
  requestAnimationFrame(() => {
    statusBarProgressPaintQueued = false;
    paintStatusBarProgressDom();
  });
}

function gatherStatusBarProgressJobs(): StatusBarProgressJob[] {
  const byId = new Map<string, StatusBarProgressJob>();
  const put = (job: StatusBarProgressJob) => {
    byId.set(job.id, job);
  };

  for (const j of state.statusBarJobs) put(j);

  const batch = state.searchViewBatchJob;
  if (batch) {
    const target = batch.target.trim() || "dossier";
    put({
      id: "search-view-batch",
      label: batch.phase === "create" ? `Création « ${target} »` : `Déplacement → ${target}`,
      done: batch.done,
      total: batch.total,
    });
  }

  if (state.syncInProgress) {
    const batchProg = state.syncProgressBatch;
    put({
      id: "imap-sync",
      label: (state.syncMessage || "Synchronisation IMAP").replace(/^Sync…\s*/i, "").trim() || "Synchronisation IMAP",
      done: batchProg?.current ?? 0,
      total: batchProg?.total ?? null,
    });
  }

  if (state.organization.scanning) {
    put({ id: "org-scan", label: "Analyse Organiser", done: 0, total: null });
  } else if (state.organization.applying) {
    const msg = (state.organization.applyMessage || "Application Organiser").replace(/…+$/, "").trim();
    put({ id: "org-apply", label: msg || "Application Organiser", done: 0, total: null });
  }

  if (state.organizationV2.scanning) {
    put({ id: "org-v2-scan", label: "Analyse Organiser V2", done: 0, total: null });
  } else if (state.organizationV2.applying) {
    const msg = (state.organizationV2.applyMessage || "Application Organiser V2").replace(/…+$/, "").trim();
    put({ id: "org-v2-apply", label: msg || "Application Organiser V2", done: 0, total: null });
  }

  if (state.folderManager.archiveProgress?.trim()) {
    put({
      id: "folder-archive",
      label: state.folderManager.archiveProgress.replace(/…+$/, "").trim() || "Archivage dossier",
      done: 0,
      total: null,
    });
  }

  if (state.llmJobLabel?.trim()) {
    put({
      id: "llm-queue",
      label: state.llmJobLabel.trim(),
      done: 0,
      total: null,
    });
  }

  if (state.llmPrefetchPercent != null) {
    put({
      id: "llm-prefetch",
      label: "Téléchargement modèle LLM",
      done: state.llmPrefetchPercent,
      total: 100,
    });
  }

  return Array.from(byId.values());
}

function renderStatusBarProgressInline(): string {
  const jobs = gatherStatusBarProgressJobs();
  return renderStatusBarProgressInlineHtml(jobs, escapeHtml, escapeAttr);
}

function paintLlmPrefetchProgressDom(): void {
  const pct = state.llmPrefetchPercent;
  const active = state.llmPrefetchInFlight || (pct != null && Number.isFinite(pct));
  const pctRounded =
    pct != null && Number.isFinite(pct) ? Math.min(100, Math.max(0, Math.round(pct))) : 0;
  const labelHtml =
    pct != null && Number.isFinite(pct)
      ? `Téléchargement : <strong>${pctRounded}%</strong>`
      : "Téléchargement du modèle…";
  document.querySelectorAll<HTMLElement>("[data-llm-prefetch-block]").forEach((block) => {
    block.hidden = !active;
    if (!active) return;
    const label = block.querySelector<HTMLElement>("[data-llm-prefetch-label]");
    if (label) label.innerHTML = labelHtml;
    const fill = block.querySelector<HTMLElement>("[data-llm-prefetch-fill]");
    if (fill) fill.style.width = `${pctRounded}%`;
    const track = block.querySelector<HTMLElement>("[data-llm-prefetch-track]");
    if (track) track.setAttribute("aria-valuenow", String(pctRounded));
    const cancelBtn = block.querySelector<HTMLButtonElement>('[data-action="cancel-llm-prefetch"]');
    if (cancelBtn) cancelBtn.disabled = !state.llmPrefetchInFlight && pct == null;
  });
}

function paintStatusBarProgressDom(): void {
  const bar = document.querySelector<HTMLElement>(".status-bar-wrap > .status-bar");
  if (!bar) return;
  const jobs = gatherStatusBarProgressJobs();
  const html = renderStatusBarProgressInlineHtml(jobs, escapeHtml, escapeAttr);
  const existing = bar.querySelector(".status-bar-progress-slot");
  if (!html) {
    existing?.remove();
    return;
  }
  if (existing) {
    existing.outerHTML = html;
    return;
  }
  const anchor = bar.querySelector(".status-bar-compact") ?? bar.querySelector(".status-bar-sep");
  if (anchor) anchor.insertAdjacentHTML("afterend", html);
  else bar.insertAdjacentHTML("beforeend", html);
}

function searchViewBatchJobStatusText(): string {
  const j = state.searchViewBatchJob;
  if (!j) return "";
  const target = j.target.trim() || "dossier";
  if (j.phase === "create") return `Création « ${target} »…`;
  return `Déplacement ${j.done}/${j.total} → ${target}…`;
}

function setSearchViewBatchJob(job: SearchViewBatchJob | null, renderNow = true): void {
  state.searchViewBatchJob = job;
  if (renderNow) render();
  else scheduleStatusBarProgressPaint();
}

function searchViewBatchActivityChipHtml(): string {
  const tip = searchViewBatchJobStatusText();
  if (!tip) return "";
  const short = tip.replace(/…+$/, "").trim();
  const label = short.length > 34 ? `${short.slice(0, 32)}…` : short;
  return `<span class="inbox-footer-chip inbox-footer-chip--busy inbox-footer-chip--affiner" title="${escapeAttr(tip)}"><span class="spinner spinner--tiny" aria-hidden="true"></span> ${escapeHtml(label)}</span>`;
}

function organizationV2ActivityChipHtml(): string {
  if (!state.organizationV2.scanning && !state.organizationV2.applying) return "";
  const tip = (
    state.organizationV2.applyMessage ||
    (state.organizationV2.scanning ? "Analyse Organiser V2…" : "Application Organiser V2…")
  ).trim();
  const short = tip.replace(/…+$/, "").trim();
  const label = state.organizationV2.scanning
    ? "Organiser V2"
    : short.length > 34
      ? `${short.slice(0, 32)}…`
      : short || "Organiser V2";
  return `<span class="inbox-footer-chip inbox-footer-chip--busy inbox-footer-chip--org" title="${escapeAttr(tip)}"><span class="spinner spinner--tiny" aria-hidden="true"></span> ${escapeHtml(label)}</span>`;
}

/** Puce barre d’état pendant analyse / application dans Organiser. */
function organizationActivityChipHtml(): string {
  if (!state.organization.scanning && !state.organization.applying) return "";
  const tip = (
    state.organization.applyMessage ||
    (state.organization.scanning ? "Analyse de la boîte (structure, doublons, tags)…" : "Traitement organisation…")
  ).trim();
  let label = "Organiser";
  if (state.organization.scanning) {
    label = "Analyse compte";
  } else {
    const short = tip.replace(/…+$/, "").trim();
    label = short.length > 36 ? `${short.slice(0, 34)}…` : short;
  }
  return `<span class="inbox-footer-chip inbox-footer-chip--busy inbox-footer-chip--org" title="${escapeAttr(tip)}"><span class="spinner spinner--tiny" aria-hidden="true"></span> ${escapeHtml(label)}</span>`;
}

/** Puces d’activité (sync IMAP, LLM, brief, autres tâches IA) — `digestSlot: true` inclut le brief dossier (barre globale). */
function renderBackgroundActivityChips(opts: { digestSlot: boolean }): string {
  const chips: string[] = [];
  const orgChip = organizationActivityChipHtml();
  if (orgChip) chips.push(orgChip);
  const orgV2Chip = organizationV2ActivityChipHtml();
  if (orgV2Chip) chips.push(orgV2Chip);
  const affinerChip = searchViewBatchActivityChipHtml();
  if (affinerChip) chips.push(affinerChip);
  if (state.syncInProgress) {
    const tip = (state.syncMessage || "Synchronisation IMAP en cours").trim();
    chips.push(
      `<span class="inbox-footer-chip inbox-footer-chip--busy" title="${escapeAttr(tip)}"><span class="spinner spinner--tiny" aria-hidden="true"></span> IMAP</span>`
    );
  }
  if (state.llmPrefetchPercent != null) {
    chips.push(
      `<span class="inbox-footer-chip" title="Téléchargement ou préparation du modèle LLM">LLM ${state.llmPrefetchPercent}%</span>`
    );
  }
  if (state.idleAiCachePrefetchBusy) {
    chips.push(
      `<span class="inbox-footer-chip inbox-footer-chip--busy" title="Préremplissage du cache IA (synthèses / traductions de fil) pendant une période calme"><span class="spinner spinner--tiny" aria-hidden="true"></span> Cache IA</span>`
    );
  }
  if (opts.digestSlot && state.mailboxDigestRefreshing) {
    chips.push(
      `<span class="inbox-footer-chip inbox-footer-chip--busy" title="Brief d’action du dossier en cours"><span class="spinner spinner--tiny" aria-hidden="true"></span> Brief</span>`
    );
  }
  if (state.llmJobLabel) {
    chips.push(
      `<span class="inbox-footer-chip inbox-footer-chip--busy" title="${escapeAttr(state.llmJobLabel)}"><span class="spinner spinner--tiny" aria-hidden="true"></span> ${escapeHtml(state.llmJobLabel)}</span>`
    );
  }
  const nMsgTr = activeMessageTranslationJobCount();
  if (nMsgTr > 0) {
    const tip =
      nMsgTr === 1 ?
        "Traduction LLM d’un message en cours"
      : `${nMsgTr} traductions de messages en cours`;
    chips.push(
      `<span class="inbox-footer-chip inbox-footer-chip--busy" title="${escapeAttr(tip)}"><span class="spinner spinner--tiny" aria-hidden="true"></span> Trad. msg${nMsgTr > 1 ? ` (${nMsgTr})` : ""}</span>`
    );
  }
  const nSec = activeSecurityLlmAugmentCount();
  if (nSec > 0) {
    chips.push(
      `<span class="inbox-footer-chip inbox-footer-chip--busy" title="${escapeAttr(
        nSec === 1 ? "Analyse sécurité IA (complément LLM) en cours" : `${nSec} analyses sécurité IA en cours`
      )}"><span class="spinner spinner--tiny" aria-hidden="true"></span> Sécurité${nSec > 1 ? ` (${nSec})` : ""}</span>`
    );
  }
  if (state.agentSession?.busy && !state.llmJobLabel) {
    chips.push(
      `<span class="inbox-footer-chip inbox-footer-chip--busy" title="Assistant « Préparer une réponse » — transition"><span class="spinner spinner--tiny" aria-hidden="true"></span> Assistant</span>`
    );
  }
  return chips.join("");
}

function inboxListFooterInnerHtml(draftBoxVirtual: boolean, total: number): string {
  const loadMore =
    state.hasMoreThreads ?
      '<button type="button" class="ghost-button inbox-load-more" data-action="load-more">Charger plus</button>'
    : "";
  const chips = renderBackgroundActivityChips({ digestSlot: false });
  let center = "";
  if (chips) {
    center = `<div class="inbox-footer-activity" role="status" aria-live="polite">${chips}</div>`;
  } else if (!draftBoxVirtual && isTauriRuntime()) {
    center = `<span class="inbox-end-hint dim">Arrière-plan : en veille</span>`;
  } else if (draftBoxVirtual) {
    center = `<span class="inbox-end-hint dim">Stockage local SQLite · pas de sync IMAP</span>`;
  } else {
    center = `<span class="inbox-end-hint dim">Mode navigateur — lancez Tauri pour la sync</span>`;
  }
  const endList =
    !draftBoxVirtual && !state.hasMoreThreads && total > 0
      ? `<span class="inbox-end-hint dim" title="Pagination locale">Fin de liste (${total})</span>`
    : "";
  return `
    <div class="inbox-panel-footer__row">
      <div class="inbox-panel-footer__lead">${loadMore}</div>
      <div class="inbox-panel-footer__center">${center}</div>
      <div class="inbox-panel-footer__trail">${endList}</div>
    </div>`;
}

function renderGlobalStatusFooter(): string {
  const st = state.status;
  const coreReady = isTauriRuntime() && Boolean(state.capabilities?.mailCore);
  const dotClass = coreReady ? "status-dot status-dot--ok" : "status-dot status-dot--idle";
  const modeLabel = isTauriRuntime() ? "Tauri" : "Navigateur";
  const coreLabel = !isTauriRuntime() ? "hors Tauri" : coreReady ? "cœur prêt" : "cœur off";
  const readLabel =
    !isTauriRuntime() ? "—" : state.capabilities?.readabilityModules ? "lisibilité OK" : "lisibilité off";
  const chips = renderBackgroundActivityChips({ digestSlot: true });
  const chipBlock = chips ? `<span class="status-bar-chip-group" role="status" aria-live="polite">${chips}</span>` : "";
  const acc = currentAccount();
  const email = acc?.email?.trim() ?? "";
  const accShort = email.length > 36 ? `${email.slice(0, 34)}…` : email;
  const accBlock = accShort
    ? `<span class="status-bar-account dim" title="${escapeAttr(email)}">${escapeHtml(accShort)}</span>`
    : `<span class="status-bar-account dim">Aucun compte</span>`;
  const composeAiQuick =
    state.view === "compose" ?
      `<div class="status-bar-compose-ai">${renderStatusBarAiQuickTrigger()}</div>`
    : "";
  const progressInline = renderStatusBarProgressInline();
  return `
    <footer class="status-bar-wrap">
      ${composeAiQuick}
      <footer class="status-bar">
        <span class="${dotClass}" title="${coreReady ? "Noyau mail prêt" : "Noyau mail indisponible ou navigateur"}"></span>
        <span class="status-bar-app">${escapeHtml(st?.appName ?? "RustyMail")} ${escapeHtml(st?.version ?? "0.1.1")}</span>
        <span class="status-bar-sep" aria-hidden="true">·</span>
        <span class="dim status-bar-compact">${escapeHtml(modeLabel)} · ${escapeHtml(coreLabel)} · ${escapeHtml(readLabel)}</span>
        ${progressInline}
        ${chipBlock}
        ${
          state.llmJobLabel
            ? `<button type="button" class="ghost-button status-bar-llm-cancel" data-action="llm-cancel-job" title="Annuler l’opération IA en cours">Annuler IA</button>`
            : ""
        }
        <span class="status-bar-spacer" aria-hidden="true"></span>
        ${accBlock}
      </footer>
    </footer>`;
}

function renderList(mode: "full" | "threads-only" | "filters-only" = "full") {
  const visible = threadsVisibleInList();
  const total = state.threads.length;
  const panelMb = folderManagerPanelMailbox();
  const listMailbox = panelMb ?? state.selectedMailbox;
  const draftBoxVirtual = isSavedDraftsVirtualMailbox(listMailbox);
  const mailboxKey = listMailbox || "INBOX";
  const fc = state.inboxFilterCounts;
  const allN = draftBoxVirtual ? 0 : (fc?.all ?? state.mailboxTotal[mailboxKey] ?? total);
  const unreadN = draftBoxVirtual ? 0 : (fc?.unread ?? state.mailboxUnread[mailboxKey] ?? 0);
  const starredN = draftBoxVirtual ? 0 : (fc?.starred ?? 0);
  const focusedN = draftBoxVirtual ? 0 : (fc?.focused ?? 0);
  const autoN = draftBoxVirtual ? 0 : (fc?.auto ?? 0);
  const listEntityPlural = draftBoxVirtual ? `brouillon${total === 1 ? "" : "s"}` : `conversation${total === 1 ? "" : "s"}`;
  const imapToolbarLocked = draftBoxVirtual;
  const filterAll = state.listFilter === "all";
  const filterUnread = state.listFilter === "unread";
  const filterStarred = state.listFilter === "starred";
  const filterFocused = state.listFilter === "focused";
  const filterAuto = state.listFilter === "auto";
  const showEmptyTrash =
    !draftBoxVirtual && isTauriRuntime() && mailboxKind(listMailbox || "") === "trash";
  const showBulkTrashVisible =
    !draftBoxVirtual &&
    isTauriRuntime() &&
    !isSearchActive() &&
    mailboxKind(listMailbox || "") !== "trash" &&
    visible.length > 0 &&
    (state.listFilter === "all" ||
      state.listFilter === "unread" ||
      state.listFilter === "focused" ||
      state.listFilter === "auto" ||
      state.listFilter === "starred");

  const searchContext = inboxSearchContextActive();
  const savedView = activeSavedSearchItem();
  const mailboxTitleRaw = draftBoxVirtual
    ? threadMailboxListLabel(LOCAL_SAVED_DRAFTS_MAILBOX).label
    : panelMb
      ? threadMailboxListLabel(panelMb).label
      : state.selectedMailbox || "INBOX";
  const listTitle = searchContext
    ? savedView
      ? savedView.name
      : "Recherche"
    : mailboxTitleRaw;
  const mailboxLabel = escapeHtml(listTitle);
  const batchJobMsg = searchViewBatchJobStatusText();
  const listSubtitle = searchContext
    ? `${visible.length} fil${visible.length === 1 ? "" : "s"} affiché${visible.length === 1 ? "" : "s"}${savedView && (savedView.newCount ?? 0) > 0 ? ` · ${savedView.newCount} nouveau${savedView.newCount === 1 ? "" : "x"}` : ""}${batchJobMsg ? ` · ${batchJobMsg}` : state.syncMessage ? ` · ${state.syncMessage}` : ""}`
    : `${visible.length} sur ${total} ${listEntityPlural}${state.syncMessage ? ` · ${state.syncMessage}` : ""}`;

  const imapFiltersBlock =
    draftBoxVirtual ?
      `
        <label class="inbox-search surface-sm inbox-search--sauves-only">
          ${inboxSearchIconSvg()}
          <input id="search-input" type="search" value="${escapeAttr(state.searchDraft)}" placeholder="Filtrer… Entrée pour appliquer" aria-label="Filtrer les brouillons sauvegardés" autocomplete="off" />
          ${searchDraftDiffersFromCommitted() ? `<span class="inbox-search-pending dim" title="Entrée pour appliquer le filtre">↵</span>` : ""}
        </label>
      `
    : searchContext
      ? renderInboxSearchContextBlock(visible.length)
    : `
        ${renderSearchBarStackHtml("search-input", { showSlashHint: true })}

        <div class="inbox-chips" role="toolbar" aria-label="Filtres de la boîte">
          <button type="button" class="inbox-chip ${filterAll ? "inbox-chip-active" : ""}" data-action="list-filter-all">Tout${renderInboxChipBadge(allN)}</button>
          <button type="button" class="inbox-chip ${filterUnread ? "inbox-chip-active" : ""}" data-action="list-filter-unread">
            Non lus${renderInboxChipBadge(unreadN)}
          </button>
          <button type="button" class="inbox-chip ${filterStarred ? "inbox-chip-active" : ""}" data-action="list-filter-starred" title="Fils marqués « Suivre » (étoile) — tous dossiers">
            Suivis${renderInboxChipBadge(starredN)}
          </button>
          <button type="button" class="inbox-chip ${filterFocused ? "inbox-chip-active" : ""}" data-action="list-filter-focused" title="Masquer les fils classés expéditeur automatique">
            Priorité${renderInboxChipBadge(focusedN)}
          </button>
          <button type="button" class="inbox-chip ${filterAuto ? "inbox-chip-active" : ""}" data-action="list-filter-auto" title="Uniquement les fils expéditeur automatique">
            Auto${renderInboxChipBadge(autoN)}
          </button>
        </div>
      `;

  const sauvesHint =
    draftBoxVirtual ?
      `<p class="inbox-mailbox-note dim">Stockage local (SQLite). Aucune donnée envoyée au serveur IMAP.</p>`
    : "";

  const inboxListPanelHtml = `
      <div class="inbox-panel surface">
        <div class="inbox-thread-list" role="list">
          ${
            visible.length
              ? visible.map(renderThreadRow).join("")
              : `<div class="inbox-empty">
                  <p class="inbox-empty-title">${draftBoxVirtual ? "Aucun brouillon sauvegardé" : "Aucune conversation"}</p>
                  <p class="inbox-empty-hint dim">${
                    draftBoxVirtual
                      ? "Dans le compositeur, appuyez sur « Enregistrer » pour ajouter un brouillon à cette liste."
                      : isSearchActive()
                        ? "Aucun message ne correspond. Essayez un autre mot-clé, le dossier « Tout », ou synchronisez la boîte."
                        : "Changez de filtre ou de dossier, ou lancez une synchronisation."
                  }</p>
                </div>`
          }
        </div>
        <div class="inbox-panel-footer">
          ${inboxListFooterInnerHtml(draftBoxVirtual, total)}
        </div>
      </div>`;

  if (mode === "threads-only") return inboxListPanelHtml;
  if (mode === "filters-only") return imapFiltersBlock;

  return `
    <section class="thread-view inbox-index ${draftBoxVirtual ? "inbox-index--sauves" : ""}${searchContext ? " inbox-index--search-context" : ""}" aria-label="Inbox">
      <header class="inbox-appbar${searchContext ? " inbox-appbar--search-context" : ""}">
        <div class="inbox-appbar-top">
          <div class="inbox-appbar-intro">
            <div class="inbox-mailbox-title-row">
              ${
                draftBoxVirtual ?
                  `<button type="button" class="ghost-button inbox-back-imap-btn" data-action="leave-saved-drafts-mailbox" title="Revenir aux dossiers IMAP">← IMAP</button>`
                : searchContext
                  ? `<button type="button" class="ghost-button inbox-back-imap-btn" data-action="clear-search-exit" title="Quitter la recherche et revenir au dossier">← ${escapeHtml(threadMailboxListLabel(mailboxTitleRaw).label)}</button>`
                : ""
              }
              <h1 class="inbox-mailbox-title${searchContext ? " inbox-mailbox-title--search" : ""}">${mailboxLabel}</h1>
              ${
                savedView && (savedView.newCount ?? 0) > 0
                  ? `<span class="inbox-view-new-pill" aria-label="${savedView.newCount} nouveau${savedView.newCount === 1 ? "" : "x"}">+${savedView.newCount}</span>`
                  : ""
              }
            </div>
            <p class="inbox-mailbox-sub">${escapeHtml(listSubtitle)}</p>
            ${
              state.mailListError && !draftBoxVirtual
                ? `<p class="inbox-load-error" role="alert">${escapeHtml(state.mailListError)}</p>`
                : ""
            }
            ${sauvesHint}
          </div>
          <div class="inbox-appbar-actions">
            ${!imapToolbarLocked ? renderMailboxDigestTriggerButton("inbox-toolbar-btn") : ""}
            <button type="button" class="ghost-button inbox-toolbar-btn" data-action="open-mailbox-manage" title="Gérer les dossiers" ${
              imapToolbarLocked ? "disabled" : ""
            }>Dossiers</button>
            <button type="button" class="ghost-button inbox-toolbar-btn" data-action="sync-inbox" title="Synchroniser la boîte IMAP (Ctrl+F5)" ${
              imapToolbarLocked || state.syncInProgress ? "disabled" : ""
            }>
              ${state.syncInProgress ? `<span class="mini-sync"><span class="spinner" aria-hidden="true"></span><span>Sync…</span></span>` : "Sync"}
            </button>
            ${
              showEmptyTrash
                ? `<button type="button" class="ghost-button inbox-toolbar-btn" style="color:var(--danger)" data-action="empty-trash-mailbox" title="Supprimer définitivement tous les messages de ce dossier">Tout supprimer</button>`
                : ""
            }
            ${
              showBulkTrashVisible
                ? `<button type="button" class="ghost-button inbox-toolbar-btn" style="color:var(--danger)" data-action="bulk-trash-visible" title="Mettre à la corbeille toutes les conversations actuellement affichées">Tout supprimer</button>`
                : ""
            }
          </div>
        </div>

        ${imapFiltersBlock}
      </header>
      ${renderAccountsRecoveryBanner()}
      ${renderDefaultAccountPromptBanner()}

      ${inboxListPanelHtml}
    </section>
  `;
}

function renderThreadRow(thread: ThreadListItem) {
  const firstParticipant = thread.participants[0] ?? "??";
  const tid = String(thread.id);
  const savedRowId = savedDraftIdFromThreadId(tid);
  const unreadCls = thread.unread ? "thread-row--unread" : "";
  const mbRaw = thread.mailbox ?? state.selectedMailbox ?? "INBOX";
  const { label: folderLabel } = threadMailboxListLabel(mbRaw);
  const folderTitle = escapeAttr(threadMailboxColumnTitle(mbRaw));
  const unread = Boolean(thread.unread);
  const toggleSeenTitle = unread ? "Marquer comme lu" : "Marquer comme non lu";
  const activityRaw = thread.lastActivity ?? "";
  const activityDisplay = formatFriendlyThreadListDate(activityRaw);
  const activityTip = escapeAttr(threadListActivityTooltip(activityRaw));
  const activityParsed = parseThreadListActivityDate(activityRaw);
  const activityDatetime = activityParsed ? escapeAttr(activityParsed.toISOString()) : "";
  const attachN = Math.max(0, Math.floor(Number(thread.attachmentCount) || 0));
  const attachAria = attachN === 1 ? "1 pièce jointe" : `${attachN} pièces jointes`;
  const attachGlyph =
    attachN > 0
      ? `<span class="inbox-thread-attach-hint dim" role="img" aria-label="${escapeAttr(attachAria)}">${iconSvg("attachment")}</span>`
      : "";
  const messageN = Math.max(1, Math.floor(Number(thread.messageCount) || 1));
  const threadAria = `Conversation, ${messageN} messages`;
  const threadGlyph =
    messageN > 1
      ? `<span class="inbox-thread-count-hint dim" role="img" aria-label="${escapeAttr(threadAria)}" title="${escapeAttr(threadAria)}">${iconSvg("thread")}<span class="inbox-thread-count-badge">${messageN}</span></span>`
      : "";

  if (savedRowId) {
    const revN = Math.max(0, Number(thread.savedRevisionCount) || 0);
    const verLabel = revN <= 1 ? "1 version locale" : `${revN} versions locales`;
    const { line1, line2, tip } = savedDraftDatesColumnSnippet(thread.savedCreatedAt, thread.lastActivity);
    const dateTip = escapeAttr(tip || activityTip);

    return `
    <div class="thread-row inbox-thread-row thread-row--saved-local" data-thread-id="${escapeAttr(tid)}" role="listitem">
      <button type="button" class="thread-row-main inbox-thread-row-main" data-open-thread="1" data-thread-id="${escapeAttr(tid)}">
        <span class="avatar inbox-thread-avatar" style="background:rgba(111,122,111,.2);color:var(--sm-primary)">${initials(firstParticipant)}</span>
        <span class="inbox-thread-stack">
          <span class="inbox-thread-line1">
            <span class="inbox-thread-from">${escapeHtml(firstParticipant)}</span>
          </span>
          <span class="inbox-thread-subject">
            <strong>${escapeHtml(thread.subject)}</strong>
          </span>
          <p class="thread-preview inbox-thread-preview dim">${escapeHtml(verLabel)} · ouvrir dans le compositeur</p>
        </span>
      </button>
      <div class="inbox-thread-date-col inbox-thread-date-col--saved-draft" title="${dateTip}">
        <div class="saved-draft-date-stack">
          ${
            line1
              ? `<div class="saved-draft-date-line saved-draft-date-line--primary">${escapeHtml(line1)}</div>`
              : ""
          }
          ${
            line2
              ? `<div class="saved-draft-date-line saved-draft-date-line--secondary dim">${escapeHtml(line2)}</div>`
              : ""
          }
        </div>
      </div>
      <div class="inbox-thread-folder-col" title="${folderTitle}">
        <span class="inbox-thread-folder-label">${escapeHtml(folderLabel)}</span>
      </div>
      <div class="thread-row-actions inbox-thread-actions row-actions" onclick="event.stopPropagation()">
        <button type="button" class="icon-pill danger" data-action="delete-saved-draft" data-saved-draft-id="${escapeAttr(savedRowId)}" title="Retirer de la liste" aria-label="Supprimer le brouillon enregistré">${iconSvg(
      "trash"
    )}</button>
      </div>
    </div>
  `;
  }

  const allowedTargets = mailboxesAllowedForMove(state.mailboxes);
  const sourceKey = mbRaw.trim().toLowerCase();
  const moveOptionsHtml = allowedTargets
    .filter((m) => m.toLowerCase() !== sourceKey)
    .map((m) => {
      const { label } = threadMailboxListLabel(m);
      const display = label === m ? m : `${label} — ${m}`;
      return `<option value="${escapeAttr(m)}">${escapeHtml(display)}</option>`;
    })
    .join("");
  const folderSelectHtml =
    allowedTargets.length > 0
      ? `<select class="inbox-thread-folder-move" data-action="move-thread-select" data-thread-id="${escapeAttr(tid)}" data-source-mailbox="${escapeAttr(mbRaw)}" title="Déplacer vers un autre dossier" aria-label="Déplacer ce fil vers un autre dossier"><option value="" selected>${escapeHtml(folderLabel)}</option>${moveOptionsHtml}</select>`
      : `<span class="inbox-thread-folder-label">${escapeHtml(folderLabel)}</span>`;
  const followed = threadListFollowed(thread);
  const followTitle = followed ? "Retirer du suivi" : "Suivre ce fil";
  const followIconHtml = `<button type="button" class="icon-pill inbox-thread-follow-toggle ${
    followed ? "inbox-thread-follow-toggle--on" : ""
  }" data-action="toggle-thread-follow" data-thread-id="${escapeAttr(tid)}" title="${escapeAttr(
    followTitle
  )}" aria-label="${escapeAttr(followTitle)}" aria-pressed="${followed}">${iconSvg(
    followed ? "starFilled" : "starOutline"
  )}</button>`;
  const previewClean = cleanThreadListPreview(thread.preview);

  return `
    <div class="thread-row inbox-thread-row ${unreadCls}" data-thread-id="${escapeAttr(tid)}" role="listitem">
      <button type="button" class="thread-row-main inbox-thread-row-main" data-open-thread="1" data-thread-id="${escapeAttr(tid)}">
        <span class="avatar inbox-thread-avatar" style="background:rgba(111,122,111,.2);color:var(--sm-primary)">${initials(firstParticipant)}</span>
        <span class="inbox-thread-stack">
          <span class="inbox-thread-line1">
            <span class="inbox-thread-from">${escapeHtml(firstParticipant)}</span>
            <time class="inbox-thread-time inbox-thread-time-narrow-only dim" datetime="${activityDatetime}" title="${activityTip}">${escapeHtml(activityDisplay)}</time>
          </span>
          <span class="inbox-thread-subject">
            ${thread.unread ? '<span class="inbox-unread-dot" aria-hidden="true"></span>' : ""}
            <strong>${escapeHtml(thread.subject)}</strong>
            ${attachGlyph}
            ${threadGlyph}
          </span>
          <p class="thread-preview inbox-thread-preview">${escapeHtml(previewClean)}</p>
        </span>
      </button>
      <div class="inbox-thread-date-col" title="${activityTip}">
        <time class="inbox-thread-date-label dim" datetime="${activityDatetime}">${escapeHtml(activityDisplay)}</time>
      </div>
      <div class="inbox-thread-folder-col" title="${folderTitle}" onclick="event.stopPropagation()">
        ${folderSelectHtml}
      </div>
      <div class="thread-row-actions inbox-thread-actions row-actions" onclick="event.stopPropagation()">
        ${followIconHtml}
        <span class="action-sep" aria-hidden="true"></span>
        <button type="button" class="icon-pill inbox-seen-toggle ${unread ? "inbox-seen-toggle--is-unread" : ""}" data-action="toggle-thread-seen" data-thread-id="${escapeAttr(
    tid
  )}" title="${escapeAttr(toggleSeenTitle)}" aria-label="${escapeAttr(toggleSeenTitle)}">${iconSvg(unread ? "read" : "unread")}</button>
        <span class="action-sep" aria-hidden="true"></span>
        <button type="button" class="icon-pill danger" data-mv="trash" data-thread-id="${escapeAttr(tid)}" title="Corbeille" aria-label="Corbeille">${iconSvg("trash")}</button>
        <button type="button" class="icon-pill" data-mv="archive" data-thread-id="${escapeAttr(tid)}" title="Archiver" aria-label="Archiver">${iconSvg("archive")}</button>
      </div>
    </div>
  `;
}

async function onOrgSyncMailbox(mailbox: string): Promise<void> {
  const mb = mailbox.trim();
  if (!mb || !isTauriRuntime()) {
    toast("Synchronisation : disponible dans l’app Tauri.");
    return;
  }
  const account = currentAccount();
  if (!account?.id) {
    toast("Configurez d’abord un compte IMAP.");
    return;
  }
  state.organization.rowSyncMailbox = mb;
  render();
  try {
    const outcome = await withTimeout(
      invoke<SyncMailboxesOutcome>("sync_mailboxes", {
        accountId: account.id,
        mailboxes: [mb],
        focusMailbox: mb,
        limitPerMailbox: 80,
      }),
      SYNC_INVOKE_TIMEOUT_MS,
    );
    const n = (outcome.results ?? []).reduce((s, r) => s + (r.fetchedUids ?? 0), 0);
    toast(n > 0 ? `${n} message(s) importé(s) · ${mb}` : `Dossier à jour · ${mb}`);
    await refreshOrganizationReport();
    if (state.view === "list" && state.selectedMailbox === mb) {
      await reloadCurrentThreadList(false);
    }
    await loadMailboxUnread();
  } catch (e) {
    toast(tauriErrorMessage(e));
  } finally {
    state.organization.rowSyncMailbox = null;
    render();
  }
}

function findEmptyMailboxesProposal(): OrgProposal | undefined {
  return (
    state.organizationV2.report?.proposals.find((p) => p.id === "empty-mailboxes") ??
    state.organization.report?.proposals.find((p) => p.id === "empty-mailboxes")
  );
}

async function onOrgDeleteMailboxOne(mailbox: string, mailboxRefId: string): Promise<void> {
  const mb = mailbox.trim();
  const refId = mailboxRefId.trim();
  if (!mb || !refId) return;
  const ok = await openConfirmModal({
    title: "Supprimer ce dossier vide ?",
    body: `Le dossier « ${mb} » sera supprimé côté serveur IMAP s’il est vide. Action irréversible.`,
    danger: true,
    confirmLabel: "Supprimer le dossier",
  });
  if (!ok) return;
  const acc = currentAccount();
  if (!acc?.id) return;
  const proposal = findEmptyMailboxesProposal();
  if (!proposal) {
    toast("Proposition introuvable — relancez l’analyse.");
    return;
  }
  const useV2 = Boolean(state.organizationV2.report?.proposals.some((p) => p.id === "empty-mailboxes"));
  if (useV2) {
    await runOrgV2Apply(acc.id, proposal, undefined, undefined, "delete-mailbox", [refId]);
    return;
  }
  await runOrgApply(acc.id, "empty-mailboxes", undefined, undefined, "delete-mailbox", [refId]);
}

/** Ligne fil / dossier du centre d'organisation — corbeille, archiver, resync sur chaque ligne. */
function renderOrgThreadSampleRow(ref: OrgThreadRef, proposal: OrgProposal): string {
  const syncBtn = (mailbox: string, title: string) => {
    const mbAttr = escapeAttr(mailbox);
    const syncing = state.organization.rowSyncMailbox === mailbox;
    return `<button type="button" class="icon-pill${syncing ? " is-loading" : ""}" data-action="org-sync-mailbox" data-mailbox="${mbAttr}" title="${escapeAttr(title)}" aria-label="${escapeAttr(title)}" ${syncing ? "disabled" : ""}>${iconSvg("sync")}</button>`;
  };
  if (ref.threadId.startsWith("mailbox:")) {
    const mbRaw = ref.mailbox.trim();
    const { label: folderLabel } = threadMailboxListLabel(mbRaw);
    const mbAttr = escapeAttr(mbRaw);
    const rowActions = [
      syncBtn(mbRaw, "Resynchroniser ce dossier"),
      `<span class="action-sep" aria-hidden="true"></span>`,
      `<button type="button" class="icon-pill danger" data-action="org-delete-mailbox-one" data-mailbox="${mbAttr}" data-mailbox-ref-id="${escapeAttr(ref.threadId)}" title="Supprimer ce dossier vide" aria-label="Supprimer le dossier">${iconSvg("trash")}</button>`,
    ].join("");
    return `
    <div class="thread-row inbox-thread-row org-thread-row org-thread-row--mailbox" data-mailbox-ref="${mbAttr}" role="listitem">
      <button type="button" class="thread-row-main inbox-thread-row-main" data-action="org-open-mailbox" data-mailbox="${mbAttr}" title="Ouvrir ce dossier">
        <span class="avatar inbox-thread-avatar" style="background:rgba(111,122,111,.12);color:var(--sm-primary)">${iconSvg("archive")}</span>
        <span class="inbox-thread-stack">
          <span class="inbox-thread-line1">
            <span class="inbox-thread-from">${escapeHtml(folderLabel)}</span>
          </span>
          <span class="inbox-thread-subject"><strong>${escapeHtml(ref.subject)}</strong></span>
        </span>
      </button>
      <div class="inbox-thread-folder-col" title="${escapeAttr(mbRaw)}" onclick="event.stopPropagation()">
        <button type="button" class="org-mailbox-link inbox-thread-folder-label" data-action="org-open-mailbox" data-mailbox="${mbAttr}" title="Ouvrir ce dossier">${escapeHtml(folderLabel)}</button>
      </div>
      <div class="thread-row-actions inbox-thread-actions row-actions org-thread-row-actions" onclick="event.stopPropagation()">${rowActions}</div>
    </div>`;
  }
  const tid = ref.threadId;
  const senderRaw = (ref.senderEmail ?? ref.fromLabel ?? "").trim();
  const from = senderRaw || ref.mailbox || "??";
  const unread = Boolean(ref.unread);
  const unreadCls = unread ? "thread-row--unread" : "";
  const mbRaw = ref.mailbox || "INBOX";
  const { label: folderLabel } = threadMailboxListLabel(mbRaw);
  const folderTitle = escapeAttr(threadMailboxColumnTitle(mbRaw));
  const previewClean = cleanThreadListPreview(ref.preview ?? "");
  const activityRaw = ref.lastActivity ?? "";
  const activityDisplay = formatFriendlyThreadListDate(activityRaw);
  const activityTip = escapeAttr(threadListActivityTooltip(activityRaw));
  const activityParsed = parseThreadListActivityDate(activityRaw);
  const activityDatetime = activityParsed ? escapeAttr(activityParsed.toISOString()) : "";
  const nlListed = senderRaw ? newsletterEmailListed(senderRaw) : false;
  const autoBtn = senderRaw.includes("@") ? renderThreadNlRuleButton(senderRaw, nlListed) : "";
  const mbAttr = escapeAttr(mbRaw);
  const rowActions: string[] = [];
  if (autoBtn) rowActions.push(autoBtn);
  if (rowActions.length) rowActions.push(`<span class="action-sep" aria-hidden="true"></span>`);
  rowActions.push(
    `<button type="button" class="icon-pill danger" data-mv="trash" data-thread-id="${escapeAttr(tid)}" data-source-mailbox="${mbAttr}" title="Corbeille (ce fil)" aria-label="Corbeille">${iconSvg("trash")}</button>`,
  );
  rowActions.push(`<span class="action-sep" aria-hidden="true"></span>`);
  rowActions.push(
    `<button type="button" class="icon-pill" data-mv="archive" data-thread-id="${escapeAttr(tid)}" data-source-mailbox="${mbAttr}" title="Archiver (ce fil)" aria-label="Archiver">${iconSvg("archive")}</button>`,
  );
  rowActions.push(`<span class="action-sep" aria-hidden="true"></span>`);
  rowActions.push(syncBtn(mbRaw, "Resynchroniser le dossier de ce fil"));
  const rowActionsHtml = rowActions.join("");
  const unsubCol = (() => {
    // Affiche une colonne dédiée uniquement pour les cartes de désinscription.
    const isUnsubCard =
      proposal.kind === "unsubscribeNewsletter" || proposal.kind === "unsubscribeTransactional";
    if (!isUnsubCard) return "";
    const links = sortUnsubscribeLinks((ref.unsubscribeLinks ?? []).filter(Boolean)).slice(0, 3);
    if (!links.length) return `<div class="org-unsub-col dim" title="Aucun lien de désinscription indexé">—</div>`;
    const primary = links[0];
    const extra = links.length > 1 ? ` (+${links.length - 1})` : "";
    return `<div class="org-unsub-col" onclick="event.stopPropagation()" onmousedown="event.stopPropagation()">
      <button type="button" class="org-unsub-link" data-action="mail-unsubscribe-open" data-href="${escapeAttr(primary)}" title="${escapeAttr(primary)}">Se désinscrire${escapeHtml(extra)}</button>
    </div>`;
  })();
  return `
    <div class="thread-row inbox-thread-row org-thread-row ${unreadCls}" data-thread-id="${escapeAttr(tid)}" role="listitem">
      <button type="button" class="thread-row-main inbox-thread-row-main" data-open-thread="1" data-thread-id="${escapeAttr(tid)}" title="Lire le fil">
        <span class="avatar inbox-thread-avatar" style="background:rgba(111,122,111,.2);color:var(--sm-primary)">${initials(from)}</span>
        <span class="inbox-thread-stack">
          <span class="inbox-thread-line1">
            <span class="inbox-thread-from">${escapeHtml(from)}</span>
            <time class="inbox-thread-time inbox-thread-time-narrow-only dim" datetime="${activityDatetime}" title="${activityTip}">${escapeHtml(activityDisplay)}</time>
          </span>
          <span class="inbox-thread-subject">
            ${unread ? '<span class="inbox-unread-dot" aria-hidden="true"></span>' : ""}
            <strong>${escapeHtml(ref.subject || "(sans sujet)")}</strong>
          </span>
          <p class="thread-preview inbox-thread-preview">${escapeHtml(previewClean)}</p>
        </span>
      </button>
      <div class="inbox-thread-date-col" title="${activityTip}">
        <time class="inbox-thread-date-label dim" datetime="${activityDatetime}">${escapeHtml(activityDisplay)}</time>
      </div>
      <div class="inbox-thread-folder-col" title="${folderTitle}" onclick="event.stopPropagation()">
        <button type="button" class="org-mailbox-link inbox-thread-folder-label" data-action="org-open-mailbox" data-mailbox="${mbAttr}" title="Ouvrir ce dossier">${escapeHtml(folderLabel)}</button>
      </div>
      ${unsubCol}
      <div class="thread-row-actions inbox-thread-actions row-actions" onclick="event.stopPropagation()">${rowActionsHtml}</div>
    </div>
  `;
}

function iconSvg(
  name:
    | "trash"
    | "archive"
    | "read"
    | "unread"
    | "reply"
    | "replyAll"
    | "forward"
    | "spark"
    | "download"
    | "open"
    | "close"
    | "move"
    | "attachment"
    | "shield"
    | "mic"
    | "mailViewClean"
    | "mailViewRaw"
    | "thread"
    | "starOutline"
    | "starFilled"
    | "globe"
    | "unsubscribe"
    | "sync"
    | "panel"
    | "tags"
) {
  const common = 'width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false"';
  switch (name) {
    case "trash":
      return `<svg ${common}><path d="M9 3h6m-8 4h10m-9 0 1 15h6l1-15" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><path d="M10 11v7M14 11v7" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>`;
    case "archive":
      return `<svg ${common}><path d="M4 7h16v14H4V7Z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M3 7l1-3h16l1 3H3Z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M10 11h4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>`;
    case "read":
      return `<svg ${common}><path d="M20 7 9 18l-5-5" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
    case "unread":
      return `<svg ${common}><path d="M4 6h16v12H4V6Z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M4 7l8 6 8-6" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>`;
    case "reply":
      return `<svg ${common}><path d="M10 9V5L3 12l7 7v-4c7 0 10 2 11 6 0-8-3-12-11-12Z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>`;
    case "replyAll":
      return `<svg ${common}><path d="M2 10h7M2 13h7M2 16h7" stroke="currentColor" stroke-width="1.65" stroke-linecap="round"/><path d="M14 10V6L7 13l7 7v-4c7 0 10 2 11 6 0-8-3-12-11-12Z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>`;
    case "forward":
      return `<svg ${common}><path d="M14 9V5l7 7-7 7v-4c-7 0-10 2-11 6 0-8 3-12 11-12Z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>`;
    case "spark":
      return `<svg ${common}><path d="M12 2l1.2 4.2L17.5 8l-4.3 1.8L12 14l-1.2-4.2L6.5 8l4.3-1.8L12 2Z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M19 13l.7 2.4L22 16l-2.3 1-.7 2.5-.7-2.5-2.3-1 2.3-.6L19 13Z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>`;
    case "download":
      return `<svg ${common}><path d="M12 3v10" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="M8 11l4 4 4-4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><path d="M4 20h16" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>`;
    case "open":
      return `<svg ${common}><path d="M14 3h7v7" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><path d="M10 14 21 3" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="M21 14v5a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
    case "close":
      return `<svg ${common}><path d="M18 6 6 18M6 6l12 12" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/></svg>`;
    case "move":
      return `<svg ${common}><path d="M7 7h10v10H7V7Z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M10 3h11v11" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><path d="M10 14 21 3" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>`;
    case "attachment":
      return `<svg ${common}><path d="M9 12.5 13.8 7.7a3.1 3.1 0 1 1 4.4 4.4L11 19.3a5.1 5.1 0 1 1-7.2-7.2l7.2-7.2" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
    case "shield":
      return `<svg ${common}><path d="M12 3 20 6v6c0 5-3.5 9-8 10-4.5-1-8-5-8-10V6l8-3Z" stroke="currentColor" stroke-width="1.75" stroke-linejoin="round"/><path d="M9.2 12.3 11 14l3.8-4.2" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
    case "mic":
      return `<svg ${common}><path d="M12 15a4 4 0 0 0 4-4V7a4 4 0 0 0-8 0v4a4 4 0 0 0 4 4Z" stroke="currentColor" stroke-width="1.75" stroke-linejoin="round"/><path d="M8 12v.5a4 4 0 0 0 8 0V12M12 19v3" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"/></svg>`;
    case "mailViewClean":
      /* Lecture « mise en page » */
      return `<svg ${common}><path d="M7 8h14M7 13h14M7 18h11" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"/></svg>`;
    case "mailViewRaw":
      /* Source brut (</>) */
      return `<svg ${common}><path d="M9 17 5 12l4-5M15 17l4-5-4-5" stroke="currentColor" stroke-width="1.85" stroke-linecap="round" stroke-linejoin="round"/><path d="m13 6.5-2 12" stroke="currentColor" stroke-width="1.65" stroke-linecap="round"/></svg>`;
    case "thread":
      /* Trois bulles empilées : conversation à plusieurs messages. */
      return `<svg ${common}><path d="M5 6h11a3 3 0 0 1 3 3v4a3 3 0 0 1-3 3H10l-4 3v-3H5a3 3 0 0 1-3-3V9a3 3 0 0 1 3-3Z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M9 10h6M9 13h4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>`;
    case "starOutline":
      return `<svg ${common}><path d="m12 3.5 2.7 5.5 6 .9-4.3 4.2 1 6-5.4-2.8-5.4 2.8 1-6L3.3 9.9l6-.9L12 3.5Z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" fill="none"/></svg>`;
    case "starFilled":
      return `<svg ${common}><path d="m12 3.5 2.7 5.5 6 .9-4.3 4.2 1 6-5.4-2.8-5.4 2.8 1-6L3.3 9.9l6-.9L12 3.5Z" fill="currentColor" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/></svg>`;
    case "globe":
      return `<svg ${common}><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.65" fill="none"/><path d="M3 12h18M12 3a14 14 0 0 0 0 18M12 3a14 14 0 0 1 0 18" stroke="currentColor" stroke-width="1.4" fill="none"/></svg>`;
    case "unsubscribe":
      return `<svg ${common}><path d="M8 8.5h8M8 12h5.5" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"/><path d="M9 16.5h6M12 3v3.5" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"/><path d="m7.5 6.5 1.2-2.2M16.5 6.5 15.3 4.3" stroke="currentColor" stroke-width="1.65" stroke-linecap="round"/></svg>`;
    case "sync":
      return `<svg ${common}><path d="M20 12a8 8 0 0 1-14.5 4.5" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"/><path d="M4 4v5h5M4 12a8 8 0 0 1 14.5-4.5" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"/><path d="M20 20v-5h-5" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
    case "panel":
      return `<svg ${common}><rect x="4" y="5" width="16" height="14" rx="1.5" stroke="currentColor" stroke-width="1.75"/><path d="M11 5v14" stroke="currentColor" stroke-width="1.75"/></svg>`;
    case "tags":
      return `<svg ${common}><path d="M10 3h4l7 7-9 9-7-7 5-5Z" stroke="currentColor" stroke-width="1.75" stroke-linejoin="round"/><circle cx="9" cy="9" r="1.35" fill="currentColor"/></svg>`;
  }
}

function iconThreadMessageViewToggle(userMode: MessageViewMode): string {
  /* En vue lisible : proposer le passage au brut ; en brut : revenir lisible quand pertinent. */
  const cleanActive = userMode === "clean";
  const rawTitle =
    "Afficher tout brut — HTML MIME ou texte source tel quel (sans nettoyage d’affichage).";
  const cleanTitle = "Vue lisible — nettoyage et mise en forme automatiques quand le message le permet.";
  return `<button type="button" class="icon-pill thread-view-mode-toggle ${cleanActive ? "" : "thread-view-mode-toggle--raw"}" data-action="toggle-message-view" title="${
    cleanActive ? escapeAttr(rawTitle) : escapeAttr(cleanTitle)
  }" aria-label="${escapeAttr(cleanActive ? "Afficher tout brut" : "Vue lisible automatique")}">${iconSvg(cleanActive ? "mailViewRaw" : "mailViewClean")}</button>`;
}

/** MIME HTML en attribut DOM : évite `escapeHtml` (très long → troncature navigateur → shadow vide / identique). */
function utf8StringToBase64(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]!);
  return btoa(bin);
}

function base64ToUtf8String(b64: string): string {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

function mailHtmlMountAttrs(messageId: string, html: string): string {
  const b64 = utf8StringToBase64(html);
  return `data-message-id="${escapeAttr(messageId)}" data-email-html-b64="${b64}"`;
}

/** Évite `<p><p>…img…</p></p>` (HTML mail cassé → double rendu après correction navigateur). */
function flattenNestedParagraphInDocument(doc: Document) {
  const root = doc.body;
  if (!root) return;
  for (let guard = 0; guard < 400; guard++) {
    const inner = root.querySelector("p > p");
    if (!inner?.parentElement) break;
    const parent = inner.parentElement;
    while (inner.firstChild) parent.insertBefore(inner.firstChild, inner);
    inner.remove();
  }
}

type MailUnsubscribeLink = { href: string; label: string };

function unsubscribeHrefScore(hrefRaw: string): number {
  const href = decodeHtmlEntitiesLoose(hrefRaw.trim());
  const low = href.toLowerCase();
  let score = 0;
  if (/^https?:\/\//i.test(href)) score += 30;
  if (/^mailto:/i.test(href)) score += 10;
  if (/unsubscribe|opt[-_]?out|optout|desinscri|desabonner/i.test(low)) score += 80;
  if (/\/un\/|\/unsub\b|\/opt-?out\b|\/manage-subscription/i.test(low)) score += 70;
  if (/list-unsubscribe|list-manage|subscription|preferences/i.test(href)) score += 25;
  if (/unsub\.aspx/i.test(href)) score += 35;
  // De-prioritize generic click-tracking / “view online” redirectors.
  if (/\/ats\/show\.aspx/i.test(low)) score -= 60;
  if (/(\/click|\/redirect|\/track|\/open)\b/i.test(low)) score -= 20;
  if (/utm_/i.test(low)) score -= 5;
  return score;
}

function sortUnsubscribeLinks(links: string[]): string[] {
  return [...links].sort((a, b) => unsubscribeHrefScore(b) - unsubscribeHrefScore(a));
}

/** Liens de désinscription / préférences mail (FR + EN + motifs ESP courants). */
function linkLooksLikeUnsubscribe(anchor: HTMLAnchorElement): boolean {
  const href = (anchor.getAttribute("href") || "").trim();
  const hrefLc = href.toLowerCase();
  const text = (anchor.textContent || "").trim().toLowerCase();
  const title = (anchor.getAttribute("title") || "").trim().toLowerCase();
  const blob = `${hrefLc} ${text} ${title}`;
  if (
    /\bunsubscribe\b|opt\s*-?\s*out|optout|d[ée]sinscri|d[ée]sabonner|d[ée]sinscription|list-unsubscribe|list-manage|subscription\s*center|one\s*-?\s*click|email\s*preferences|communication\s*preferences|advertising\s*preferences/i.test(
      blob
    )
  ) {
    return true;
  }
  if (/unsubscribe|opt[-_]out|optout|subscription|preferences\/email|email-preference|list-manage|\/u\/\d+\/unsub/i.test(hrefLc)) {
    return true;
  }
  if (/^mailto:/i.test(hrefLc) && /unsubscribe|d[ée]sinscri|opt[-_]out/i.test(blob)) return true;
  try {
    const base =
      typeof window !== "undefined" && window.location?.origin ? window.location.origin : "https://local.invalid";
    const u = new URL(href, base);
    const path = `${u.pathname}${u.search}`.toLowerCase();
    if (/unsubscribe|optout|opt_out|subscription|preferences|list-manage/i.test(path)) return true;
    if (/\/un\/|\/unsub\b|\/opt-?out\b|\/manage-subscription/i.test(path)) return true;
  } catch {
    /* ignore */
  }
  if (
    /^(ici|here|cliquez ici|click here)$/i.test(text) &&
    /\bd[ée]s(inscri|abonner)|unsubscribe|opt\s*-?\s*out/i.test(blob)
  ) {
    return true;
  }
  return false;
}

function unsubscribeLinkLabel(anchor: HTMLAnchorElement): string {
  const text = (anchor.textContent || "").replace(/\s+/g, " ").trim();
  if (text.length >= 3 && text.length <= 80) return text;
  const title = (anchor.getAttribute("title") || "").replace(/\s+/g, " ").trim();
  if (title.length >= 3 && title.length <= 80) return title;
  const href = (anchor.getAttribute("href") || "").trim();
  if (/^mailto:/i.test(href)) return "Se désinscrire (courriel)";
  return "Se désinscrire";
}

function collectUnsubscribeLinksFromDoc(doc: Document): MailUnsubscribeLink[] {
  const seen = new Set<string>();
  const out: MailUnsubscribeLink[] = [];
  doc.querySelectorAll<HTMLAnchorElement>("a[href]").forEach((a) => {
    if (!linkLooksLikeUnsubscribe(a)) return;
    const href = normalizeMailHrefForOpen(a.getAttribute("href") || "");
    if (!href || seen.has(href)) return;
    seen.add(href);
    out.push({ href, label: unsubscribeLinkLabel(a) });
  });
  return out;
}

function blockIsMostlyUnsubscribe(el: Element): boolean {
  const text = (el.textContent || "").replace(/\s+/g, " ").trim();
  if (!text) return true;
  const links = el.querySelectorAll<HTMLAnchorElement>("a.mail-unsubscribe-link");
  if (!links.length) return false;
  const linkText = [...links].map((a) => (a.textContent || "").trim()).join(" ");
  const rest = text.replace(linkText, "").replace(/\s+/g, " ").trim();
  return !rest || /^[|·•\-–—\s]+$/.test(rest);
}

/** Masque les liens/sections de désabonnement déjà remontés dans la barre du message. */
function hideRelocatedUnsubscribeInDoc(doc: Document): void {
  doc.querySelectorAll<HTMLAnchorElement>("a.mail-unsubscribe-link").forEach((a) => {
    a.classList.add("mail-unsubscribe-link--relocated");
    const p = a.closest("p");
    if (p && blockIsMostlyUnsubscribe(p)) {
      p.classList.add("mail-unsubscribe-section--relocated");
    }
    const row = a.closest("tr");
    if (row && blockIsMostlyUnsubscribe(row)) {
      row.classList.add("mail-unsubscribe-section--relocated");
    }
    const cell = a.closest("td, th");
    if (cell && blockIsMostlyUnsubscribe(cell)) {
      cell.classList.add("mail-unsubscribe-section--relocated");
    }
  });
  doc.querySelectorAll("article.rm-amazon-digest, article.rm-deblock-digest").forEach((article) => {
    const h3 = article.querySelector(":scope > h3");
    if (!h3 || !/désabon|unsub/i.test(h3.textContent || "")) return;
    h3.classList.add("mail-unsubscribe-section--relocated");
    let sib = h3.nextElementSibling;
    while (sib && (sib.tagName === "TABLE" || sib.tagName === "P")) {
      sib.classList.add("mail-unsubscribe-section--relocated");
      if (sib.tagName === "TABLE") break;
      sib = sib.nextElementSibling;
    }
  });
}

function extractUnsubscribeLinksFromHtml(raw: string): MailUnsubscribeLink[] {
  if (!raw.trim()) return [];
  return sanitizeEmailHtml(raw, { allowRemoteImages: false, relocateUnsubscribe: false }).unsubscribeLinks;
}

function renderMailUnsubscribeBar(links: MailUnsubscribeLink[]): string {
  if (!links.length) return "";
  const sorted = [...links].sort((a, b) => unsubscribeHrefScore(b.href) - unsubscribeHrefScore(a.href));
  const btns = sorted
    .map(
      (l) =>
        `<button type="button" class="mail-unsubscribe-bar__btn" data-action="mail-unsubscribe-open" data-href="${escapeAttr(l.href)}" title="${escapeAttr(l.href)}">${escapeHtml(l.label)}</button>`
    )
    .join("");
  const hint =
    sorted.length > 1 ? `${sorted.length} liens détectés dans le message` : "Lien extrait du corps du message";
  return `<div class="mail-unsubscribe-bar" role="region" aria-label="Désabonnement">
    <div class="mail-unsubscribe-bar__lead">
      <span class="mail-unsubscribe-bar__kicker">Désabonnement</span>
      <span class="mail-unsubscribe-bar__hint dim">${escapeHtml(hint)}</span>
    </div>
    <div class="mail-unsubscribe-bar__actions">${btns}</div>
  </div>`;
}

function messageHtmlForDisplay(message: CleanedMessageView, mode: MessageViewMode): string | null {
  if (mode === "original") return message.htmlBody?.trim() || null;
  const clean = message.cleanedHtmlBody?.trim();
  if (clean) return clean;
  return message.htmlBody?.trim() || null;
}

/** Liens qu’on peut déléguer au navigateur / OS (hors WebView Tauri). */
function normalizeMailHrefForOpen(href: string): string | null {
  const t = href.trim();
  if (!t || /^javascript:/i.test(t)) return null;
  if (t.startsWith("#")) return null;
  if (t.startsWith("cid:")) return null;
  if (/^https?:\/\//i.test(t)) return t;
  if (t.startsWith("//")) return `https:${t}`;
  if (/^mailto:/i.test(t) || /^tel:/i.test(t)) return t;
  return null;
}

function decodeHtmlEntitiesLoose(input: string): string {
  // `data-*` attrs are usually decoded by the DOM, but keep this as a safety net
  // for copied/serialized fragments where `&amp;` survives.
  return input
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/gi, "'");
}

function mailUrlLooksRemote(raw: string): boolean {
  return /^https?:\/\//i.test(raw.trim()) || raw.trim().startsWith("//");
}

function safeDataImageSrc(raw: string): boolean {
  return /^data:image\/(?:png|jpe?g|gif|webp|bmp);base64,/i.test(raw.trim());
}

async function openExternalFromMailHref(href: string): Promise<void> {
  const raw = href.trim();
  if (!raw) return;
  try {
    if (isTauriRuntime()) {
      const { openUrl } = await import("@tauri-apps/plugin-opener");
      await openUrl(raw);
    } else {
      // `mailto:` should trigger the system mail composer (not a browser tab).
      if (/^mailto:/i.test(raw)) {
        window.location.assign(raw);
        return;
      }
      window.open(raw, "_blank", "noopener,noreferrer");
    }
  } catch (e) {
    console.error("openExternalFromMailHref", e);
    toast(`Impossible d'ouvrir le lien : ${tauriErrorMessage(e)}`);
  }
}

function sanitizeEmailHtml(
  input: string,
  opts?: { allowRemoteImages?: boolean; relocateUnsubscribe?: boolean; stripOutlookNoise?: boolean }
): { html: string; unsubscribeLinks: MailUnsubscribeLink[] } {
  const allowRemoteImages = opts?.allowRemoteImages === true;
  const relocateUnsubscribe = opts?.relocateUnsubscribe !== false;
  const stripOutlookNoise = opts?.stripOutlookNoise === true;
  try {
    const clean = DOMPurify.sanitize(String(input), {
      FORBID_TAGS: ["script", "iframe", "object", "embed", "link", "meta", "base", "form", "input", "button", "textarea", "select"],
      FORBID_ATTR: ["onerror", "onload", "onclick", "onmouseover", "onfocus", "onblur"],
      ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto|cid):|data:image\/)/i
    });
    const doc = new DOMParser().parseFromString(String(clean), "text/html");
    flattenNestedParagraphInDocument(doc);
    doc.querySelectorAll<HTMLElement>("[style]").forEach((el) => {
      const v = (el.getAttribute("style") || "").toLowerCase();
      if (
        /(position\s*:\s*(fixed|sticky))/.test(v) ||
        /(z-index\s*:)/.test(v) ||
        /(behavior\s*:)/.test(v) ||
        /url\s*\(/.test(v) ||
        /expression\s*\(/.test(v)
      ) {
        el.removeAttribute("style");
      }
    });
    doc.querySelectorAll<HTMLAnchorElement>("a[href]").forEach((a) => {
      const href = a.getAttribute("href") || "";
      const normalized = normalizeMailHrefForOpen(href);
      if (!normalized) {
        a.removeAttribute("href");
        a.removeAttribute("target");
        a.removeAttribute("rel");
        a.classList.add("mail-link-disabled");
        return;
      }
      a.setAttribute("href", normalized);
      a.rel = "noreferrer noopener";
      a.target = "_blank";
      if (linkLooksLikeUnsubscribe(a)) {
        a.classList.add("mail-unsubscribe-link");
        if (!a.getAttribute("aria-label")) {
          a.setAttribute("aria-label", "Lien de désinscription ou de gestion des envois");
        }
      }
    });
    doc.querySelectorAll<HTMLImageElement>("img").forEach((img) => {
      img.removeAttribute("width");
      img.removeAttribute("height");
      img.removeAttribute("srcset");
      const src = (img.getAttribute("src") || "").trim();
      if (src && mailUrlLooksRemote(src) && !allowRemoteImages) {
        img.setAttribute("data-remote-src", src);
        img.removeAttribute("src");
        img.classList.add("mail-remote-image-blocked");
        if (!img.getAttribute("alt")) img.setAttribute("alt", "Image distante bloquée");
      } else if (src && /^data:image\//i.test(src) && !safeDataImageSrc(src)) {
        img.removeAttribute("src");
        img.classList.add("mail-image-blocked");
        if (!img.getAttribute("alt")) img.setAttribute("alt", "Image data non autorisée");
      }
      const rawStyle = (img.getAttribute("style") || "").trim();
      if (!rawStyle) return;
      const pieces = rawStyle
        .split(";")
        .map((s) => s.trim())
        .filter(Boolean)
        .filter((rule) => {
          const prop = rule.split(":")[0]?.trim().toLowerCase() ?? "";
          return !/^(width|height|max-width|max-height|min-width|min-height)$/.test(prop);
        });
      if (!pieces.length) img.removeAttribute("style");
      else img.setAttribute("style", pieces.join("; "));
    });
    const unsubscribeLinks = collectUnsubscribeLinksFromDoc(doc);
    if (relocateUnsubscribe && unsubscribeLinks.length) hideRelocatedUnsubscribeInDoc(doc);
    const hasConversationReport = Boolean(doc.querySelector("article.rm-conversation-report"));
    if (stripOutlookNoise && !hasConversationReport) stripOutlookDisplayNoiseFromDoc(doc);
    return { html: doc.body?.innerHTML ?? String(clean), unsubscribeLinks };
  } catch {
    return { html: escapeHtml(input), unsubscribeLinks: [] };
  }
}

/** Filet UI : retire signatures / en-têtes Outlook restés dans le HTML nettoyé. */
function stripOutlookDisplayNoiseFromDoc(doc: Document): void {
  const ids = ["Signature", "x_Signature", "signature", "divRplyFwdMsg", "x_divRplyFwdMsg"];
  for (const id of ids) {
    doc.getElementById(id)?.remove();
  }
  doc.querySelectorAll("[id*='LSI_marker']").forEach((el) => el.remove());
  doc.querySelectorAll('img[data-outlook-trace], img[id*="x0000_i"], img[id*="_x0000_"]').forEach((img) => {
    const wrap = img.parentElement;
    img.remove();
    if (wrap && wrap.tagName === "SPAN" && !(wrap.textContent ?? "").trim()) wrap.remove();
  });
  const reQuote = /(?:de\s*:|from\s*:|-----original message-----).*?(?:envoy[ée]\s*:|sent\s*:).*?(?:objet\s*:|subject\s*:)/is;
  const quoteBlocks = [...doc.querySelectorAll<HTMLElement>("div, p, blockquote")]
    .map((el) => ({ el, text: (el.textContent ?? "").replace(/\u00a0/g, " ") }))
    .filter(({ text }) => text.length > 0 && text.length <= 5000 && reQuote.test(text))
    .sort((a, b) => a.text.length - b.text.length);
  for (const { el } of quoteBlocks) {
    if (el.isConnected) el.remove();
  }
}

function pickImgSrcForLightbox(img: HTMLImageElement): string {
  // `getAttribute("src")` peut être vide si l’image vient de `srcset`.
  // `currentSrc` est la source réellement utilisée par le navigateur.
  const current = (img.currentSrc || "").trim();
  if (current) return current;
  const prop = (img.src || "").trim();
  if (prop) return prop;
  return (img.getAttribute("src") || "").trim();
}

function mailImageSrcLooksLikeCid(raw: string): boolean {
  return /^cid:/i.test(String(raw).trim());
}

/** Correspond au `Content-ID` stocké en base (sans `<>`). */
function normalizeMailCidToken(cidUrl: string): string {
  const tail = cidUrl.trim().replace(/^cid:/i, "").trim();
  try {
    return decodeURIComponent(tail).replace(/^<|>$/g, "").trim().toLowerCase();
  } catch {
    return tail.replace(/^<|>$/g, "").trim().toLowerCase();
  }
}

type InlineAttachPayload = { mimeType: string; dataBase64: string };

function base64ToImageBlob(base64: string, mimeType: string): Blob {
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mimeType.trim() || "application/octet-stream" });
}

/** `cid:` n’est pas une URL exploitable dans le popup : on résout depuis SQLite après sync IMAP. */
async function resolveSrcForMailImageLightbox(rawSrc: string, messageId?: string | null): Promise<{ src: string; revokeObjectUrl?: string | null }> {
  let src = String(rawSrc).trim();
  if (!src) return { src };

  const mid = (messageId ?? "").trim();
  if (mid && mailImageSrcLooksLikeCid(src) && isTauriRuntime()) {
    try {
      const token = normalizeMailCidToken(src);
      if (token) {
        const fetched = await invoke<InlineAttachPayload | null>("inline_attachment_fetch", { messageId: mid, cid: token });
        if (fetched?.dataBase64 && fetched.mimeType) {
          const blob = base64ToImageBlob(fetched.dataBase64, fetched.mimeType);
          const objectUrl = URL.createObjectURL(blob);
          return { src: objectUrl, revokeObjectUrl: objectUrl };
        }
      }
    } catch {
      /* garder rawSrc pour afficher l’icône « image cassée » */
    }
  }
  return { src };
}

function readMailHtmlRawFromHost(host: HTMLDivElement): string {
  const b64 = host.dataset.emailHtmlB64?.trim();
  if (b64) {
    try {
      return base64ToUtf8String(b64);
    } catch {
      return host.dataset.emailHtml ?? "";
    }
  }
  return host.dataset.emailHtml ?? "";
}

function buildMailShadowInnerHtml(messageId: string, raw: string, isCleanView = false): string {
  const allowRemoteImages = Boolean(messageId && state.remoteImagesAllowedByMessage[messageId]);
  const { html: sanitized } = sanitizeEmailHtml(raw, {
    allowRemoteImages,
    relocateUnsubscribe: true,
    stripOutlookNoise: isCleanView
  });
  const blockedRemoteImages = !allowRemoteImages && sanitized.includes("data-remote-src=");
  const remoteImageBanner = blockedRemoteImages ?
    `<div class="remote-images">
        <span>Images distantes bloquées pour protéger votre confidentialité.</span>
        <button type="button" class="mail-load-remote-images">Charger les images</button>
      </div>`
  : "";
  return `
      <style>
        :host{display:block;box-sizing:border-box;color:var(--text);font-family:system-ui,-apple-system,"Segoe UI","Helvetica Neue",Arial,sans-serif;padding:0 2px}
        .mail{padding:0;line-height:1.55;font-size:13px;background:transparent}
        .mail :is(p, ul, ol, blockquote, pre, table){margin:0 0 10px}
        .mail :is(h1,h2,h3){margin:8px 0 10px;font-family:ui-serif,Georgia,Cambria,"Times New Roman",serif;font-weight:400;letter-spacing:-0.02em}
        .mail a{color:var(--accent)}
        .remote-images{display:flex;flex-wrap:wrap;align-items:center;gap:10px 12px;margin:0 0 10px;padding:10px 16px;box-sizing:border-box;max-width:100%;border:1px solid rgba(232,228,223,.14);border-radius:10px;background:rgba(255,255,255,.035);color:var(--dim,rgba(238,240,238,.72));font-size:12px;line-height:1.45}
        .remote-images span{flex:1 1 10rem;min-width:0}
        .remote-images button{flex:0 0 auto;margin-left:auto;border:1px solid rgba(232,228,223,.18);border-radius:999px;background:rgba(255,255,255,.06);color:var(--text);padding:6px 12px;cursor:pointer}
        .mail a.mail-link-disabled{color:var(--dim,rgba(238,240,238,.56));text-decoration:line-through;cursor:not-allowed}
        .mail a.mail-unsubscribe-link{
          display:inline-flex;
          align-items:center;
          gap:6px;
          margin:12px 0;
          padding:9px 16px;
          border-radius:10px;
          font-weight:650;
          font-size:13px;
          line-height:1.25;
          text-decoration:none !important;
          color:var(--text) !important;
          background:rgba(108,200,138,.16);
          border:1px solid rgba(108,200,138,.42);
          box-shadow:0 1px 0 rgba(0,0,0,.12);
        }
        .mail a.mail-unsubscribe-link:hover{
          background:rgba(108,200,138,.26);
          border-color:rgba(108,200,138,.58);
        }
        .mail .mail-unsubscribe-link--relocated,
        .mail .mail-unsubscribe-section--relocated{display:none !important}
        .mail img{
          box-sizing:border-box;
          max-width:100% !important;
          width:auto !important;
          height:auto !important;
          max-height:min(50vh,520px) !important;
          object-fit:contain;
          display:block;
          border-radius:12px;
          border:1px solid rgba(232,228,223,.10);
          cursor:zoom-in
        }
        .mail img.mail-remote-image-blocked,.mail img.mail-image-blocked{
          min-height:42px;
          padding:10px;
          cursor:default;
          background:rgba(255,255,255,.035);
        }
        .mail code{background:rgba(255,255,255,.065);padding:3px 7px;border-radius:6px;font-size:12px}
        .mail article.rm-deblock-digest table,.mail article.rm-amazon-digest table{width:100%;border-collapse:collapse;font-size:inherit}
        .mail article.rm-deblock-digest th,.mail article.rm-deblock-digest td,
        .mail article.rm-amazon-digest th,.mail article.rm-amazon-digest td{padding:7px 12px 7px 0;vertical-align:top;text-align:left;line-height:1.45}
        .mail article.rm-deblock-digest th,.mail article.rm-amazon-digest tbody th{font-weight:600;white-space:nowrap;width:1%;color:var(--dim,rgba(238,240,238,.58))}
        .mail article.rm-deblock-digest tbody tr:not(:first-child) th,.mail article.rm-deblock-digest tbody tr:not(:first-child) td,
        .mail article.rm-amazon-digest tbody tr:not(:first-child) th,.mail article.rm-amazon-digest tbody tr:not(:first-child) td{border-top:1px solid rgba(120,119,117,.16)}
        .mail article.rm-conversation-report{display:flex;flex-direction:column;gap:14px;margin:0}
        .mail article.rm-conversation-report .rm-conversation-turn{padding:12px 14px;border:1px solid rgba(120,119,117,.18);border-radius:10px;background:rgba(255,255,255,.025)}
        .mail article.rm-conversation-report .rm-conversation-turn--cited{border-left:2px solid rgba(232,228,223,.14)}
        .mail article.rm-conversation-report .rm-conversation-turn--cited[data-depth="1"]{margin-left:12px}
        .mail article.rm-conversation-report .rm-conversation-turn--cited[data-depth="2"]{margin-left:24px}
        .mail article.rm-conversation-report .rm-conversation-turn--cited[data-depth="3"]{margin-left:36px}
        .mail article.rm-conversation-report .rm-conversation-turn--cited[data-depth="4"]{margin-left:48px}
        .mail article.rm-conversation-report .rm-conversation-turn--cited[data-depth="5"]{margin-left:60px}
        .mail article.rm-conversation-report .rm-conversation-envelope{width:100%;border-collapse:collapse;font-size:12px;margin:0 0 10px}
        .mail article.rm-conversation-report .rm-conversation-envelope th,.mail article.rm-conversation-report .rm-conversation-envelope td{padding:4px 12px 4px 0;vertical-align:top;text-align:left;line-height:1.4}
        .mail article.rm-conversation-report .rm-conversation-envelope th{font-weight:600;white-space:nowrap;width:1%;color:var(--dim,rgba(238,240,238,.58))}
        .mail article.rm-conversation-report .rm-conversation-envelope tr:not(:first-child) th,.mail article.rm-conversation-report .rm-conversation-envelope tr:not(:first-child) td{border-top:1px solid rgba(120,119,117,.12)}
        .mail article.rm-conversation-report .rm-conversation-participants{display:flex;flex-wrap:wrap;gap:6px;align-items:center}
        .mail article.rm-conversation-report .rm-conversation-chip{display:inline-flex;align-items:center;border-radius:999px;padding:3px 10px;font-size:12px;font-weight:600;line-height:1.3;background:rgba(173,188,216,.10);color:var(--text);border:1px solid rgba(173,188,216,.18);cursor:default}
        .mail article.rm-conversation-report .rm-conversation-body{margin:0;line-height:1.55}
        .mail article.rm-conversation-report .rm-conversation-body :is(p, div){margin:0 0 10px}
        .mail article.rm-conversation-report .rm-conversation-body br{display:block;content:"";margin-bottom:0.45em}
        .mail table{max-width:100%;width:100%;border-collapse:collapse}
        .mail blockquote{padding:8px 12px;border-left:2px solid rgba(232,228,223,.12);background:rgba(255,255,255,.02);border-radius:10px}
        .mail :is(.gmail_quote, .gmail_quote_container, blockquote.gmail_quote){display:none !important}
        .mail .rm-mail-signature{display:none !important}
        .mail :is(.rm-mail-forward-header, .rm-mail-outlook-quote-header){display:none !important}
        /* Vue clean : filet si le marqueur rm-mail-* manque (HTML déjà nettoyé sans wrapper). */
        .mail.mail--clean :is(#Signature, #x_Signature, #signature, #divRplyFwdMsg, #x_divRplyFwdMsg){display:none !important}
        .mail *{max-width:100%}
      </style>
      ${remoteImageBanner}
      <div class="mail${isCleanView ? " mail--clean" : ""}">${sanitized}</div>
    `;
}

function bindMailShadowClick(shadow: ShadowRoot, host: HTMLDivElement): void {
  const shadowState = shadow as unknown as { __mailClickBound?: boolean };
  if (shadowState.__mailClickBound) return;
  shadowState.__mailClickBound = true;
  shadow.addEventListener("click", (ev) => {
    const t = ev.target as HTMLElement | null;
    if (!t) return;
    const remoteBtn = t.closest(".mail-load-remote-images") as HTMLButtonElement | null;
    if (remoteBtn) {
      ev.preventDefault();
      ev.stopPropagation();
      const mid = (host.dataset.messageId ?? "").trim();
      if (mid) state.remoteImagesAllowedByMessage[mid] = true;
      remountMailHtmlShadow(host);
      return;
    }
    const a = t.closest("a[href]") as HTMLAnchorElement | null;
    if (a) {
      ev.preventDefault();
      ev.stopPropagation();
      const href = a.getAttribute("href")?.trim() ?? "";
      const normalized = normalizeMailHrefForOpen(href);
      if (normalized) void openExternalFromMailHref(normalized);
      return;
    }
    if (t.tagName !== "IMG") return;
    const img = t as HTMLImageElement;
    const messageId = (host.dataset.messageId ?? "").trim();
    const src = pickImgSrcForLightbox(img);
    if (!src) return;
    const alt = (img.getAttribute("alt") || "").trim();
    void resolveSrcForMailImageLightbox(src, messageId).then((resolved) => {
      state.imageModal = { src: resolved.src, alt, revokeObjectUrl: resolved.revokeObjectUrl ?? null };
      render();
    });
  });
}

function remountMailHtmlShadow(host: HTMLDivElement): void {
  const messageId = (host.dataset.messageId ?? "").trim();
  const shadow = host.shadowRoot ?? host.attachShadow({ mode: "open" });
  const isCleanView = host.classList.contains("message-html--clean");
  shadow.innerHTML = buildMailShadowInnerHtml(messageId, readMailHtmlRawFromHost(host), isCleanView);
  bindMailShadowClick(shadow, host);
}

function hydrateEmailHtml() {
  const nodes = document.querySelectorAll<HTMLDivElement>(
    ".message-html[data-email-html-b64], .message-html[data-email-html]"
  );
  nodes.forEach((host) => {
    if ((host as unknown as { __hydrated?: boolean }).__hydrated) return;
    (host as unknown as { __hydrated?: boolean }).__hydrated = true;
    remountMailHtmlShadow(host);
  });
}

function uniqueSendersOrdered(msgs: CleanedMessageView[]): string[] {
  const seen = new Set<string>();
  const names: string[] = [];
  for (const m of msgs) {
    const s = m.sender.trim();
    if (!s || seen.has(s)) continue;
    seen.add(s);
    names.push(s);
  }
  return names;
}

type ThreadParticipantLink = { name: string; email: string };

function threadParticipantsWithEmails(messages: CleanedMessageView[]): ThreadParticipantLink[] {
  const map = new Map<string, string>();
  for (const m of sortMessagesByReceivedAscending(messages)) {
    const name = m.sender.trim();
    if (!name || map.has(name)) continue;
    const email = (m.senderEmail ?? "").trim().toLowerCase();
    map.set(name, email.includes("@") ? email : "");
  }
  return [...map.entries()].map(([name, email]) => ({ name, email }));
}

function renderThreadParticipantLink(p: ThreadParticipantLink, className = "thread-participant-link"): string {
  if (p.email) {
    return `<button type="button" class="${className} label" data-action="contacts-open-detail" data-email="${escapeAttr(p.email)}" title="${escapeAttr(p.email)}">${escapeHtml(p.name)}</button>`;
  }
  return `<span class="label" style="margin-right:6px;background:rgba(173,188,216,.06);color:var(--text)">${escapeHtml(p.name)}</span>`;
}

function renderMessageSenderLink(message: CleanedMessageView, className = "thread-msg-from"): string {
  const email = (message.senderEmail ?? "").trim().toLowerCase();
  if (email.includes("@")) {
    return `<button type="button" class="${className} thread-participant-link" data-action="contacts-open-detail" data-email="${escapeAttr(email)}" title="${escapeAttr(email)}">${escapeHtml(message.sender)}</button>`;
  }
  return `<strong class="${className}">${escapeHtml(message.sender)}</strong>`;
}

/** Ordre chronologique (réception) pour métadonnées (participants…) indépendant de l’ordre d’affichage du fil. */
function sortMessagesByReceivedAscending(messages: CleanedMessageView[]): CleanedMessageView[] {
  return sortMessagesByReceivedAt(messages, "asc");
}

/** Tri descendant par date de réception (ancien dernier ⇄ premier selon besoin métier). */
function sortMessagesByReceivedDescending(messages: CleanedMessageView[]): CleanedMessageView[] {
  return sortMessagesByReceivedAt(messages, "desc");
}

/** Regroupe les lignes citations (Rust: une entrée du tableau ≈ une ligne) par niveau de citation (nouveau mail / ligne « On … wrote » ou équivalent). */
function groupCollapsedQuotesByAttribution(lines: string[]): string[] {
  const trimmed = lines.map((s) => s.replace(/\r$/, ""));
  if (!trimmed.length) return [];

  const isAttributionHeader = (raw: string) => {
    const t = raw.trim();
    return (
      /^On\s+.+\bwrote:?/i.test(t) ||
      /^Le\s.+a\s+[éeè]crit\s*:?/i.test(t) ||
      /^[\s_*-]*(forwarded message|original message|\|)\s*[:\-_]?\s*$/i.test(t) ||
      /^[\s_-]{3,}.{0,80}(forwarded|message original)/i.test(t)
    );
  };

  const groups: string[] = [];
  let buf: string[] = [];

  const flush = () => {
    const joined = buf.join("\n").trimEnd();
    buf = [];
    if (joined.length) groups.push(joined);
  };

  for (const line of trimmed) {
    if (isAttributionHeader(line) && buf.length > 0) flush();
    buf.push(line);
  }
  flush();
  return groups;
}

function sortMessagesByReceivedAt(messages: CleanedMessageView[], direction: "asc" | "desc"): CleanedMessageView[] {
  const cmp = direction === "asc" ? 1 : -1;
  const indexed = messages.map((m, index) => ({ m, index, t: parseMaybeDate(m.receivedAt)?.getTime() ?? Number.NaN }));
  indexed.sort((a, b) => {
    const aOk = Number.isFinite(a.t);
    const bOk = Number.isFinite(b.t);
    if (aOk && bOk && a.t !== b.t) return cmp * (a.t - b.t);
    if (aOk && !bOk) return -1;
    if (!aOk && bOk) return 1;
    const idCmp = a.m.messageId.localeCompare(b.m.messageId);
    if (idCmp !== 0) return direction === "asc" ? idCmp : -idCmp;
    return a.index - b.index;
  });
  return indexed.map((x) => x.m);
}

function normalizeThreadSenderLabel(sender: string): string {
  return sender.trim().toLowerCase().replace(/\s+/g, " ");
}

/** Extrait un extrait de texte brut pour heuristique de langue (corps nettoyé ou source). */
function messagePlainSampleForLangGuess(message: CleanedMessageView): string {
  const raw = (message.cleanedText || message.sourceText || "").trim();
  if (!raw) return "";
  return raw.slice(0, 4000);
}

/** Code ISO 639-1 à 2 lettres à partir des préférences (ex. `fr`, `en-US` → `en`). */
function normalizeIso639Primary(langRaw: string): string {
  const t = langRaw.trim().toLowerCase();
  if (t.length < 2) return "fr";
  const two = t.slice(0, 2);
  return /^[a-z]{2}$/.test(two) ? two : "fr";
}

/** Indices lexicaux très légers (aucune dépendance) — suffisant pour EN/FR/IT/DE/ES/PT courants. */
const LANG_GUESS_HINTS: Readonly<Record<string, readonly string[]>> = {
  fr: [
    " le ",
    " la ",
    " les ",
    " l'",
    " un ",
    " une ",
    " des ",
    " du ",
    " de ",
    " et ",
    " est ",
    " que ",
    " qui ",
    " pour ",
    " dans ",
    " pas ",
    " avec ",
    " sur ",
    " par ",
    " vous ",
    " nous ",
    " été ",
    " tout ",
    " comme ",
    " salut ",
    " comment ",
    " vas ",
    " peux ",
    " veux ",
    " faire ",
    " cette ",
    " merci ",
    " bonjour ",
    " mais ",
    " aussi ",
    " leur ",
    " aux ",
    " je ",
    " te ",
    " tu ",
    " moi ",
    " mon ",
    " ma ",
    " mes ",
    " son ",
    " sa ",
    " ses ",
    " ce ",
    " ces ",
    " ou ",
    " où ",
    " très ",
    " plus ",
    " bien ",
    " s'il ",
    " n'est ",
    " d'un ",
    " d'une ",
  ],
  en: [
    " the ",
    " and ",
    " that ",
    " this ",
    " with ",
    " from ",
    " have ",
    " were ",
    " been ",
    " are ",
    " was ",
    " for ",
    " not ",
    " you ",
    " they ",
    " your ",
    " what ",
    " when ",
    " will ",
    " would ",
    " there ",
    " could ",
    " about ",
    " hello ",
    " thanks ",
    " please ",
    " does ",
    " how ",
    " it's ",
    " don't ",
    " i'm ",
    " we ",
    " our ",
    " has ",
    " had ",
  ],
  it: [
    " il ",
    " la ",
    " lo ",
    " gli ",
    " le ",
    " un ",
    " una ",
    " uno ",
    " per ",
    " con ",
    " che ",
    " non ",
    " sono ",
    " questo ",
    " anche ",
    " dalla ",
    " nella ",
    " grazie ",
    " ciao ",
    " buongiorno ",
    " come ",
    " molto ",
    " tutto ",
    " stato ",
    " hai ",
    " ho ",
    " mi ",
    " ti ",
    " era ",
    " suo ",
    " sua ",
    " degli ",
    " delle ",
    " quando ",
    " dove ",
  ],
  de: [
    " der ",
    " die ",
    " das ",
    " und ",
    " nicht ",
    " mit ",
    " von ",
    " den ",
    " dem ",
    " ein ",
    " eine ",
    " ist ",
    " auf ",
    " für ",
    " wie ",
    " auch ",
    " als ",
    " an ",
    " des ",
    " zu ",
    " sie ",
    " wir ",
    " ich ",
    " noch ",
    " nur ",
    " oder ",
    " wenn ",
    " aber ",
    " guten ",
    " danke ",
    " hallo ",
    " haben ",
    " sein ",
  ],
  es: [
    " el ",
    " la ",
    " los ",
    " las ",
    " de ",
    " que ",
    " y ",
    " en ",
    " para ",
    " con ",
    " una ",
    " un ",
    " por ",
    " no ",
    " como ",
    " más ",
    " su ",
    " del ",
    " se ",
    " ha ",
    " está ",
    " yo ",
    " hola ",
    " gracias ",
    " muy ",
    " todo ",
    " este ",
    " esta ",
    " también ",
  ],
  pt: [
    " o ",
    " a ",
    " os ",
    " as ",
    " de ",
    " e ",
    " do ",
    " da ",
    " dos ",
    " das ",
    " em ",
    " com ",
    " não ",
    " um ",
    " uma ",
    " para ",
    " por ",
    " que ",
    " se ",
    " como ",
    " mais ",
    " seu ",
    " obrigado ",
    " olá ",
    " bom ",
    " está ",
    " tem ",
  ],
};

/**
 * Devine une langue ISO 639-1 ou `null` si trop court / ambigu.
 * Sert uniquement à décider d’afficher l’icône « traduire » vs langue mère.
 */
function guessIso6391FromMessageText(raw: string): string | null {
  const sample = raw.slice(0, 4000).toLowerCase().normalize("NFC");
  if (sample.trim().length < 24) return null;

  if (/\p{Script=Han}/u.test(sample)) return "zh";
  if (/\p{Script=Hiragana}|\p{Script=Katakana}/u.test(sample)) return "ja";
  if (/\p{Script=Hangul}/u.test(sample)) return "ko";
  if (/\p{Script=Cyrillic}/u.test(sample)) return "ru";
  if (/\p{Script=Arabic}/u.test(sample)) return "ar";
  if (/\p{Script=Greek}/u.test(sample)) return "el";

  const normalized = sample.replace(/[^\p{L}\p{N}]+/gu, " ").replace(/\s+/g, " ").trim();
  const blob = ` ${normalized} `;
  let best: string | null = null;
  let bestScore = 0;
  let second = 0;
  for (const [lang, hints] of Object.entries(LANG_GUESS_HINTS)) {
    let s = 0;
    for (const h of hints) {
      if (blob.includes(h)) s += 1;
    }
    if (s > bestScore) {
      second = bestScore;
      bestScore = s;
      best = lang;
    } else if (s > second) {
      second = s;
    }
  }
  if (bestScore < 4) return null;
  if (bestScore - second < 2 && second >= 4) return null;
  return best;
}

/** ISO 639-1 depuis `messages.detected_lang` (Tauri). */
function normalizeDetectedLangIso639(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const t = raw.trim().toLowerCase();
  if (!t || t === "und" || t === "unknown" || t === "xxx") return null;
  const two = t.slice(0, 2);
  return /^[a-z]{2}$/.test(two) ? two : null;
}

/** Langue ISO depuis tags `kind:lang-xx` (sync / retag). */
function langFromKindTags(tags: Tag[]): string | null {
  for (const t of tags) {
    if (String(t.family).toLowerCase() !== "kind") continue;
    const v = String(t.value).trim().toLowerCase();
    if (!v.startsWith("lang-")) continue;
    const iso = normalizeIso639Primary(v.slice(5));
    if (iso) return iso;
  }
  return null;
}

/** Afficher l’action « traduire ce message » uniquement si la langue du corps ≠ langue mère. */
function shouldOfferPerMessageTranslate(
  message: CleanedMessageView,
  motherLangRaw: string,
  threadTags?: Tag[]
): boolean {
  if (!isTauriRuntime()) return false;
  const mother = normalizeIso639Primary(motherLangRaw || "fr");

  const fromTags = langFromKindTags(message.tags) ?? (threadTags?.length ? langFromKindTags(threadTags) : null);
  if (fromTags && fromTags === mother) return false;

  const fromDb = normalizeDetectedLangIso639(message.detectedLang);
  if (fromDb) {
    return fromDb !== mother;
  }

  const plain = messagePlainSampleForLangGuess(message);
  if (plain.trim().length < 24) return false;

  const guess = guessIso6391FromMessageText(plain);
  if (guess === null) return false;
  return guess !== mother;
}

/** Proposer la traduction du fil si au moins un message semble être dans une autre langue. */
function shouldOfferThreadTranslate(
  thread: { messages: CleanedMessageView[]; tags?: Tag[] },
  motherLangRaw: string,
): boolean {
  if (!isTauriRuntime()) return false;
  const mother = motherLangRaw || "fr";
  return thread.messages.some((m) => shouldOfferPerMessageTranslate(m, mother, thread.tags));
}

/**
 * Bouton expéditeur auto (A) — rendu sur chaque message du fil (pas seulement la « tête » de groupe).
 */
function renderThreadNlRuleButton(seSenderRaw: string, nlListedHere: boolean): string {
  if (!isTauriRuntime()) return "";
  const seNorm = canonicalEmailForNlMatch(seSenderRaw);
  if (!seNorm) return "";
  if (nlListedHere) {
    const matched = firstMatchingNewsletterRule(seSenderRaw);
    const key = matched ? formatNewsletterRuleInput(matched) : (seNorm as string);
    const tip = `Expéditeur auto (activé) — cliquer pour désactiver · ${key}`;
    return `<button type="button" class="icon-pill icon-pill-sm thread-auto-sender thread-auto-sender--on" data-action="newsletter-msg-remove-rule" data-rule="${escapeAttr(key)}" title="${escapeAttr(tip)}" aria-label="${escapeAttr(tip)}"><span class="thread-auto-sender__glyph" aria-hidden="true">A</span></button>`;
  }
  const tip = `Expéditeur auto — cliquer pour activer · ${seNorm}`;
  return `<button type="button" class="icon-pill icon-pill-sm thread-auto-sender thread-auto-sender--off" data-action="newsletter-msg-add-rule" data-rule="${escapeAttr(seNorm)}" title="${escapeAttr(tip)}" aria-label="${escapeAttr(tip)}"><span class="thread-auto-sender__glyph" aria-hidden="true">A</span></button>`;
}

/**
 * Barre d’actions par message : même ordre et même placement sur tout le fil.
 */
function renderThreadMsgHeadActions(
  message: CleanedMessageView,
  nlRuleHtml: string,
  threadTags?: Tag[]
): string {
  const motherRaw = state.appPrefs.general.motherLanguage?.trim() || "fr";
  const offerTr = shouldOfferPerMessageTranslate(message, motherRaw, threadTags);
  const globeBtn =
    offerTr ?
      `<button type="button" class="icon-pill icon-pill-sm thread-msg-translate" data-action="llm-translate-message" data-msg-id="${escapeAttr(message.messageId)}" title="Traduire ce message vers la langue mère (LLM)" aria-label="Traduire ce message">${iconSvg("globe")}</button>`
    : "";
  const security = renderMailSecurityPop(message, { compact: true });
  const retagBtn = state.selectedThreadId?.trim()
    ? `<button type="button" class="icon-pill icon-pill-sm thread-msg-retag" data-action="retag-thread" data-thread-id="${escapeAttr(state.selectedThreadId)}" title="Recalculer les tags du fil" aria-label="Recalculer les tags du fil">${iconSvg("sync")}</button>`
    : "";
  const quoteBtn =
    message.collapsedQuotes.length ?
      `<button type="button" class="icon-pill icon-pill-sm thread-quote-open" data-action="open-quote-fold" data-msg-id="${escapeAttr(message.messageId)}" title="Citations repliées" aria-label="Citations repliées">${iconSvg("open")}</button>`
    : "";
  const replyBtn = `<button type="button" class="icon-pill icon-pill-sm thread-reply-one" data-action="reply-one" data-msg-id="${escapeAttr(message.messageId)}" title="Répondre à ce mail" aria-label="Répondre à ce mail">${iconSvg("reply")}</button>`;
  const forwardOneBtn = `<button type="button" class="icon-pill icon-pill-sm thread-forward-one" data-action="forward-one" data-msg-id="${escapeAttr(message.messageId)}" title="Transférer ce message" aria-label="Transférer ce message">${iconSvg("forward")}</button>`;

  const aiBar = globeBtn ? `<div class="action-bar action-bar--ai action-bar--compact">${globeBtn}</div>` : "";
  const secBar = security ? `<div class="action-bar action-bar--sec action-bar--compact">${security}</div>` : "";
  const utilParts = [retagBtn, quoteBtn, nlRuleHtml].filter(Boolean).join("");
  const utilBar = utilParts ? `<div class="action-bar action-bar--util action-bar--compact">${utilParts}</div>` : "";
  const opsBar = `<div class="action-bar action-bar--ops action-bar--compact">${replyBtn}${forwardOneBtn}</div>`;

  return `<div class="thread-msg-head-actions" role="group" aria-label="Actions sur ce message">${aiBar}${secBar}${utilBar}${opsBar}</div>`;
}

/** Chaîne UTF-8 lue comme Latin-1 (ex. RÃ©cit) → texte lisible si le motif est évident. */
function repairUtf8Mojibake(s: string): string {
  const t = s ?? "";
  if (!t.includes("Ã") && !t.includes("Â")) return t;
  try {
    const bytes = new Uint8Array(t.length);
    for (let i = 0; i < t.length; i++) bytes[i] = t.charCodeAt(i) & 0xff;
    const dec = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
    if (!dec || dec === t) return t;
    const mojib = (x: string) => (x.match(/Ã.|Â[^\s]/g) ?? []).length;
    return mojib(dec) <= mojib(t) ? dec : t;
  } catch {
    return t;
  }
}

/** Clé stable par expéditeur (email canon si possible, sinon libellé). */
function threadParticipantDedupKey(msg: CleanedMessageView): string {
  const c = canonicalEmailForNlMatch(msg.senderEmail ?? "");
  if (c) return `e:${c}`;
  return `s:${normalizeThreadSenderLabel(msg.sender)}`;
}

/** `message_id` chronologiquement premiers pour chaque participant du fil. */
function threadParticipantFirstMessageIds(messages: CleanedMessageView[]): Set<string> {
  const asc = sortMessagesByReceivedAscending(messages);
  const ids = new Set<string>();
  const seen = new Set<string>();
  for (const m of asc) {
    const k = threadParticipantDedupKey(m);
    if (seen.has(k)) continue;
    seen.add(k);
    ids.add(m.messageId);
  }
  return ids;
}

function repairSummaryResultStrings(o: SummaryResult): SummaryResult {
  return {
    ...o,
    title: repairUtf8Mojibake(String(o.title ?? "")),
    bullets: (o.bullets ?? []).map((b) => repairUtf8Mojibake(String(b))),
  };
}

function summaryResultToZenText(o: SummaryResult): string {
  const r = repairSummaryResultStrings(o);
  return `${r.title}\n\n${r.bullets.map((bullet) => `- ${bullet}`).join("\n")}`;
}

async function withLlmQueue<T>(
  label: string,
  fn: (signal: AbortSignal) => Promise<T>
): Promise<T | null> {
  if (state.llmJobLabel) {
    toast(`IA occupée (${state.llmJobLabel}). Annulez ou attendez la fin.`);
    return null;
  }
  idlePrefetchAbort?.abort();
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

function cancelLlmQueueJob(): void {
  cancelActiveLlmStreamJob();
  idlePrefetchAbort?.abort();
  llmQueueAbort?.abort();
}

function commitSearchQuery(opts?: { fromModal?: boolean }): void {
  const input = activeSearchInputElement();
  const raw = (input?.value ?? state.searchDraft).trim();
  const parsed = parseSearchBarDraft(raw, state.newsletterRules);
  resetSearchStructuralModifiers();
  applyParsedSearchBarToState(parsed);
  state.searchDraft = raw;
  state.searchModifiersTouched = false;
  document.querySelectorAll<HTMLInputElement>("#search-input, #search-modal-input").forEach((el) => {
    el.value = raw;
  });
  const closeModal = opts?.fromModal ?? state.searchModalOpen;
  if (!hasSearchBarCriteria()) {
    if (closeModal) state.searchModalOpen = false;
    void clearSearchAndReloadInbox();
    return;
  }
  const plainTextOnly =
    !parsedSearchBarHasModifiers(parsed) &&
    state.search.trim().split(/\s+/).filter((w) => w.length > 0).length >= 3 &&
    isAiFeatureEnabled(state.appPrefs.ai, "featureSearchNlEnabled") &&
    isTauriRuntime();

  if (plainTextOnly) {
    const accountId = state.selectedAccountId?.trim();
    const phrase = state.searchDraft.trim();
    if (!accountId || !phrase) {
      void applySearchBarQuery().then(() => {
        toastSearchBarResult();
        if (closeModal) state.searchModalOpen = false;
        if (state.view === "thread") clearThreadAiSummaryState();
        if (state.view !== "list") state.view = "list";
        render();
      });
      return;
    }
    void (async () => {
      const ran = await withLlmQueue("Recherche NL", async (signal) => {
        if (signal.aborted) return;
        let sq:
          | {
              text?: string | null;
              sender?: string | null;
              senders?: string[];
              tags?: Tag[];
              mode?: string | null;
              accountId?: string | null;
              mailbox?: string | null;
              language?: string | null;
            }
          | null = null;
        try {
          sq = await withTimeout(
            invoke<{
              text?: string | null;
              sender?: string | null;
              senders?: string[];
              tags?: Tag[];
              mode?: string | null;
              accountId?: string | null;
              mailbox?: string | null;
              language?: string | null;
            }>("llm_search_nl", { accountId, phrase }),
            LLM_INVOKE_TIMEOUT_MS
          );
        } catch (err) {
          console.error("llm_search_nl from search bar", err);
        }
        if (signal.aborted) return;
        if (sq) {
          applySearchQueryFromNl(sq);
          if (!state.search.trim() && !state.searchSenders.length && !state.searchTags.length && phrase) {
            const fb = extractNlSearchFallbackText(phrase);
            if (fb) {
              state.search = fb;
              state.searchDraft = fb;
              state.searchNlMode = "lexical";
            }
          }
        } else {
          const fb = extractNlSearchFallbackText(phrase);
          if (fb) {
            state.search = fb;
            state.searchDraft = fb;
            state.searchNlMode = "lexical";
          } else {
            state.search = phrase;
            state.searchDraft = phrase;
            state.searchNlMode = null;
          }
        }
        if (
          !state.search.trim() &&
          !state.searchSenders.length &&
          !state.searchTags.length &&
          !state.searchLanguageFilter?.trim()
        ) {
          toast(
            "Recherche NL : aucun critère exploitable. Reformulez avec des mots-clés (ex. facture, Amazon) ou un expéditeur."
          );
          return;
        }
        await searchThreads();
        const n = threadsVisibleInList().length;
        const bits = [
          n === 0 ? "aucun résultat" : `${n} fil${n === 1 ? "" : "s"}`,
          state.searchNlMode ? `mode ${state.searchNlMode}` : null,
          state.searchLanguageFilter ? `langue ${state.searchLanguageFilter.toUpperCase()}` : null,
        ].filter(Boolean);
        const scope =
          state.searchScope === "account"
            ? " (compte entier)"
            : effectiveSearchMailboxPath()
              ? " (dossier précis)"
              : "";
        toast(`Recherche NL : ${bits.join(" · ")}${scope}.`);
        recordSearchCommittedActivity();
      });
      if (!ran) return;
      if (closeModal) state.searchModalOpen = false;
      if (state.view === "thread") clearThreadAiSummaryState();
      if (state.view !== "list") state.view = "list";
      render();
    })();
  } else {
    void applySearchBarQuery().then(() => {
      toastSearchBarResult();
      recordSearchCommittedActivity();
      if (closeModal) state.searchModalOpen = false;
      if (state.view === "thread") clearThreadAiSummaryState();
      if (state.view !== "list") state.view = "list";
      render();
    });
  }
}

function applySearchQueryFromNl(sq: {
  text?: string | null;
  sender?: string | null;
  senders?: string[];
  tags?: Tag[];
  mode?: string | null;
  language?: string | null;
  mailbox?: string | null;
  accountId?: string | null;
}): void {
  const applied: SearchStructuralState = {
    search: "",
    searchSenders: [],
    searchTags: [],
    searchMailboxPath: null,
    searchAccountOverrideId: null,
    searchNewsletterRule: null,
    searchScope: "account",
    listFilter: "all",
    searchNlMode: null,
    searchLanguageFilter: null,
  };
  applyNlSearchQueryToState(
    applied,
    sq,
    (raw) => canonicalEmailForNlMatch(raw) ?? (raw.trim().toLowerCase() || null),
    (id) => state.accounts.some((a) => a.id === id)
  );
  state.search = applied.search;
  state.searchDraft = applied.search;
  state.searchSenders = applied.searchSenders;
  state.searchMailboxPath = applied.searchMailboxPath;
  state.searchAccountOverrideId = applied.searchAccountOverrideId;
  state.searchNewsletterRule = applied.searchNewsletterRule as typeof state.searchNewsletterRule;
  state.searchScope = applied.searchScope;
  state.listFilter = applied.listFilter;
  state.searchNlMode = applied.searchNlMode;
  state.searchLanguageFilter = applied.searchLanguageFilter;
  state.searchTags = [];
  for (const t of applied.searchTags) mergeSearchBarTag(t);
  const aid = sq.accountId?.trim();
  if (aid && state.accounts.some((a) => a.id === aid)) {
    state.selectedAccountId = aid;
  }
  state.searchModifiersTouched = true;
}

function scrollToThreadMessage(messageId: string): void {
  const thread = state.selectedThread;
  if (!thread) return;
  const msgs = sortMessagesByReceivedDescending(thread.messages);
  const idx = msgs.findIndex((m) => m.messageId === messageId.trim());
  if (idx < 0) {
    toast("Message introuvable dans ce fil.");
    return;
  }
  const anchorId = threadMessageAnchorId(messageId, idx);
  const el = document.getElementById(anchorId);
  if (el) {
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    el.classList.add("thread-msg--evidence-flash");
    window.setTimeout(() => el.classList.remove("thread-msg--evidence-flash"), 2400);
  } else {
    toast("Message introuvable dans la vue.");
  }
}

function renderThreadParticipantFirstBadge(message: CleanedMessageView, firstIds: Set<string>): string {
  if (!firstIds.has(message.messageId)) return "";
  const acc = currentAccount();
  const ownEmailLower = acc?.email?.trim().toLowerCase() ?? "";
  const senderEmailLower = (message.senderEmail ?? "").trim().toLowerCase();
  if (ownEmailLower && senderEmailLower && ownEmailLower === senderEmailLower) return "";
  if (isOwnSender(message.sender)) return "";
  const canon = canonicalEmailForNlMatch(message.senderEmail ?? "");
  const sender = escapeHtml(message.sender);
  const emailBit = canon ? ` <span class="dim thread-timeline-note__addr">(${escapeHtml(canon)})</span>` : "";
  return `<div class="thread-timeline-note" role="note">
    <span class="thread-timeline-note__glyph" aria-hidden="true">${iconSvg("thread")}</span>
    <span class="thread-timeline-note__text-wrap">
      <span class="dim thread-timeline-note__kicker">Première apparition dans le fil</span>
      <span class="thread-timeline-note__who"><strong>${sender}</strong>${emailBit}</span>
    </span>
  </div>`;
}

function normalizeRecipientEmailForDiff(email: string): string {
  return email.trim().toLowerCase();
}

/** Carte To/Cc par email (insensible à la casse). */
function recipientMapForDiff(msg: CleanedMessageView): Map<string, { name?: string | null; email: string }> {
  const m = new Map<string, { name?: string | null; email: string }>();
  for (const r of msg.recipients ?? []) {
    const k = normalizeRecipientEmailForDiff(r.email ?? "");
    if (!k) continue;
    if (!m.has(k)) m.set(k, r);
  }
  return m;
}

type ThreadRecipientPresenceEvents = {
  added: Array<{ name?: string | null; email: string }>;
  removed: Array<{ name?: string | null; email: string }>;
};

/**
 * Événements To/Cc "dans la durée" :
 * - ajouté : 1ère apparition dans le fil (enveloppe)
 * - retiré : dernière apparition (ne revient plus ensuite)
 *
 * Objectif UX : éviter le clignotement +/− sur chaque reply-all.
 */
function threadRecipientPresenceEventsByMessageId(
  messages: CleanedMessageView[],
): Map<string, ThreadRecipientPresenceEvents> {
  const asc = sortMessagesByReceivedAscending(messages);
  const firstIndex = new Map<string, number>();
  const lastIndex = new Map<string, number>();
  const firstInfo = new Map<string, { name?: string | null; email: string }>();
  const lastInfo = new Map<string, { name?: string | null; email: string }>();

  const acc = currentAccount();
  const ownEmailLower = acc?.email?.trim().toLowerCase() ?? "";
  const ownCanon = canonicalEmailForNlMatch(acc?.email ?? "") ?? "";
  const isOwnRecipientKey = (k: string): boolean => {
    if (!k) return false;
    if (ownEmailLower && k === ownEmailLower) return true;
    if (ownCanon) {
      const kCanon = canonicalEmailForNlMatch(k);
      if (kCanon) return kCanon === ownCanon;
    }
    return false;
  };

  // Certains messages n’ont pas d’enveloppe To/Cc remontée (recipients absent/vides).
  // On évite de générer de faux "+ To/Cc" en prenant le 1er message avec enveloppe connue comme baseline.
  let firstKnownIdx = -1;
  let lastKnownIdx = -1;
  let maxEnvelopeSize = 0;

  for (let i = 0; i < asc.length; i++) {
    const msg = asc[i]!;
    const env = recipientMapForDiff(msg);
    if (env.size > maxEnvelopeSize) maxEnvelopeSize = env.size;
    if (env.size === 0) continue;
    if (firstKnownIdx < 0) firstKnownIdx = i;
    lastKnownIdx = i;
    for (const [k, r] of env) {
      if (isOwnRecipientKey(k)) continue;
      if (!firstIndex.has(k)) {
        firstIndex.set(k, i);
        firstInfo.set(k, r);
      }
      lastIndex.set(k, i);
      lastInfo.set(k, r);
    }
  }

  // En 1-to-1, l’enveloppe To/Cc dépend du sens (entrant vs sortant) et produit des faux “ajouts”.
  // On n’affiche ces événements que si l’enveloppe est réellement "groupe" (≥2 destinataires).
  if (maxEnvelopeSize <= 1) return new Map();

  const out = new Map<string, ThreadRecipientPresenceEvents>();
  const get = (id: string): ThreadRecipientPresenceEvents => {
    const hit = out.get(id);
    if (hit) return hit;
    const created: ThreadRecipientPresenceEvents = { added: [], removed: [] };
    out.set(id, created);
    return created;
  };

  for (const [k, idx] of firstIndex) {
    // Baseline : 1ère enveloppe connue — on ne sait pas ce qui était avant, donc pas d’“ajout”.
    if (idx === firstKnownIdx) continue;
    const msg = asc[idx];
    if (!msg) continue;
    const info = firstInfo.get(k);
    if (!info) continue;
    get(msg.messageId).added.push(info);
  }

  for (const [k, idx] of lastIndex) {
    // Dernière enveloppe connue (ou fin du fil) : ne pas afficher un “retiré” sans preuve.
    if (idx === lastKnownIdx || idx >= asc.length - 1) continue;
    const msg = asc[idx];
    if (!msg) continue;
    const info = lastInfo.get(k);
    if (!info) continue;
    get(msg.messageId).removed.push(info);
  }

  return out;
}

function renderThreadRecipientPresenceNote(events: ThreadRecipientPresenceEvents | undefined): string {
  if (!events || (!events.added.length && !events.removed.length)) return "";
  const line = (r: { name?: string | null; email: string }) => {
    const em = escapeHtml(r.email.trim());
    const nm = r.name?.trim();
    return nm ? `<strong>${escapeHtml(nm)}</strong> <span class="dim">&lt;${em}&gt;</span>` : `<strong>${em}</strong>`;
  };
  const added = events.added.length
    ? `<div class="thread-recipient-diff__col thread-recipient-diff__col--add"><span class="dim thread-recipient-diff__tag">+ To/Cc</span><span class="thread-recipient-diff__list">${events.added
        .map(line)
        .join(", ")}</span></div>`
    : "";
  const removed = events.removed.length
    ? `<div class="thread-recipient-diff__col thread-recipient-diff__col--rem"><span class="dim thread-recipient-diff__tag">− To/Cc</span><span class="thread-recipient-diff__list">${events.removed
        .map(line)
        .join(", ")}</span></div>`
    : "";
  return `<div class="thread-recipient-diff surface-sm" role="note" aria-label="Évolution des destinataires dans le fil">${removed}${added}</div>`;
}

/**
 * Diff d’enveloppe (To/Cc agrégés) par rapport au message **plus ancien** dans le fil.
 * Le **premier** message chronologique n’a pas de prédécesseur : l’appelant ne doit pas invoquer cette fonction.
 */
function renderThreadRecipientDiffStrip(older: CleanedMessageView, newer: CleanedMessageView): string {
  const prevM = recipientMapForDiff(older);
  const curM = recipientMapForDiff(newer);
  const added: Array<{ name?: string | null; email: string }> = [];
  const removed: Array<{ name?: string | null; email: string }> = [];
  for (const [k, r] of curM) {
    if (!prevM.has(k)) added.push(r);
  }
  for (const [k, r] of prevM) {
    if (!curM.has(k)) removed.push(r);
  }
  if (!added.length && !removed.length) return "";
  const line = (r: { name?: string | null; email: string }) => {
    const em = escapeHtml(r.email.trim());
    const nm = r.name?.trim();
    return nm ? `<strong>${escapeHtml(nm)}</strong> <span class="dim">&lt;${em}&gt;</span>` : `<strong>${em}</strong>`;
  };
  const addedBlock =
    added.length ?
      `<div class="thread-recipient-diff__col thread-recipient-diff__col--add"><span class="dim thread-recipient-diff__tag">+ To/Cc</span><span class="thread-recipient-diff__list">${added.map(line).join(", ")}</span></div>`
    : "";
  const remBlock =
    removed.length ?
      `<div class="thread-recipient-diff__col thread-recipient-diff__col--rem"><span class="dim thread-recipient-diff__tag">− To/Cc</span><span class="thread-recipient-diff__list">${removed.map(line).join(", ")}</span></div>`
    : "";
  return `<div class="thread-recipient-diff surface-sm" role="note" aria-label="Changements de destinataires par rapport au message précédent">${remBlock}${addedBlock}</div>`;
}

/** Bloc de traduction LLM sous le corps du message (cache hydraté ou après action). */
function renderMessageInlineTranslation(message: CleanedMessageView, targetLang: string, offerTranslationUi: boolean): string {
  if (!isTauriRuntime()) return "";
  if (!offerTranslationUi) {
    const busy = Boolean(state.messageTranslationBusy[message.messageId]);
    if (!busy) return "";
  }
  const key = `${message.messageId}|${targetLang}`;
  const tText = state.messageTranslations[key];
  const busy = Boolean(state.messageTranslationBusy[message.messageId]);
  if (!offerTranslationUi && !busy && tText?.trim()) return "";
  const langLabel = escapeHtml(targetLang.toUpperCase());
  if (!tText?.trim()) {
    if (!busy) return "";
    return `<div class="message-inline-translation message-inline-translation--busy" aria-live="polite">
      <span class="dim message-inline-translation__wait">Traduction en cours…</span>
    </div>`;
  }
  const body = escapeHtml(tText);
  const busyLine = busy ? `<p class="dim message-inline-translation__wait" style="margin:0 0 6px">Actualisation…</p>` : "";
  return `<div class="message-inline-translation" lang="${escapeAttr(targetLang)}" dir="auto">
    <div class="message-inline-translation__badge">Traduction · ${langLabel}</div>
    ${busyLine}
    <div class="message-inline-translation__body">${body}</div>
    <div class="message-inline-translation__meta">
      <button type="button" class="ghost-button ghost-button-sm" data-action="llm-translate-message" data-msg-id="${escapeAttr(message.messageId)}" data-llm-translate-refresh="1">Actualiser</button>
    </div>
  </div>`;
}

/**
 * Voies "arbre" :
 * - le plus ancien (racine) est centré
 * - ensuite, chaque expéditeur garde son côté
 * - un nouvel expéditeur reçoit gauche/droite en alternance (ordre chronologique d’apparition)
 * - « moi » reste à droite
 */
function threadTreeLaneRight(thread: { messages: CleanedMessageView[] }, message: CleanedMessageView): { isRoot: boolean; laneRight: boolean } {
  const ascending = sortMessagesByReceivedAscending(thread.messages);
  const rootId = ascending[0]?.messageId ?? "";
  const isRoot = Boolean(rootId) && message.messageId === rootId;
  if (isRoot) return { isRoot: true, laneRight: false };
  if (isOwnSender(message.sender)) return { isRoot: false, laneRight: true };

  const lanes = new Map<string, boolean>();
  let nextRight = false; // 1er expéditeur rencontré (hors root, hors moi) => gauche
  for (const m of ascending.slice(1)) {
    if (m.messageId === rootId) continue;
    const key = normalizeThreadSenderLabel(m.sender);
    if (!key) continue;
    if (isOwnSender(m.sender)) {
      lanes.set(key, true);
      continue;
    }
    if (lanes.has(key)) continue;
    lanes.set(key, nextRight);
    nextRight = !nextRight;
  }
  const k = normalizeThreadSenderLabel(message.sender);
  return { isRoot: false, laneRight: lanes.get(k) ?? false };
}

function renderThreadMessageAttachmentSection(message: CleanedMessageView): string {
  const n = message.attachments.length;
  if (!n) return "";
  const cards = message.attachments
    .map(
      (att) =>
        `<div class="thread-attach-card surface-sm">
          <span class="thread-attach-ico" aria-hidden="true">${iconSvg("attachment")}</span>
          <div class="thread-attach-info">
            <strong class="thread-attach-name">${escapeHtml(att.fileName)}</strong>
            <span class="thread-attach-size dim">${escapeHtml(formatAttachmentSizeKb(att.sizeBytes))}</span>
          </div>
          <button type="button" class="icon-pill icon-pill-sm thread-attach-dl" data-att-download="${escapeAttr(att.id)}" data-msg-id="${escapeAttr(message.messageId)}" title="Télécharger">${iconSvg("download")}</button>
        </div>`
    )
    .join("");
  const framed = `<div class="thread-msg-attachments thread-msg-attachments--framed">${cards}</div>`;
  if (n > 6) {
    return `<details class="thread-attachments-fold"><summary class="thread-attachments-fold__sum">${escapeHtml(`Pièces jointes (${n})`)}</summary>${framed}</details>`;
  }
  return framed;
}

function senderAccentVars(sender: string): string {
  const s = (sender || "").trim().toLowerCase();
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  const hue = h % 360;
  const fg = `hsla(${hue} 56% 70% / 1)`;
  const bg = `hsla(${hue} 56% 70% / 0.18)`;
  return `--sender-accent:${fg};--sender-accent-bg:${bg};`;
}

/** `msgs` est triée du plus récent au plus ancien → on cherche la cible de réponse sur les derniers reçus. */
function threadQuickReplyTargetName(msgs: CleanedMessageView[]): string {
  for (let i = 0; i < msgs.length; i++) {
    if (!isOwnSender(msgs[i].sender)) return msgs[i].sender;
  }
  return msgs[0]?.sender ?? "…";
}

function formatThreadReadingWhen(receivedAt: string): string {
  const d = parseMaybeDate(receivedAt);
  if (!d) return receivedAt;
  const day = d.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" }).replace(/\.$/, "");
  const time = d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  // Heure d’abord pour une lecture chronologique évidente (puis jour).
  return `${time} · ${day}`;
}

function receivedAtIsoDatetime(receivedAt: string): string {
  const d = parseMaybeDate(receivedAt);
  return d ? d.toISOString() : "";
}

function zenSummaryHtmlFragments(text: string): string {
  const lines = repairUtf8Mojibake(text).replace(/\r\n/g, "\n").split("\n");
  const chunks: string[] = [];
  let inList = false;
  const closeList = (): void => {
    if (!inList) return;
    chunks.push("</ul>");
    inList = false;
  };
  for (const line of lines) {
    const t = line.trim();
    if (/^[-•]\s+/.test(t)) {
      if (!inList) {
        chunks.push('<ul class="thread-zen-list">');
        inList = true;
      }
      chunks.push(`<li>${escapeHtml(t.replace(/^[-•]\s+/, ""))}</li>`);
    } else if (t) {
      closeList();
      chunks.push(`<p class="thread-zen-par">${escapeHtml(t)}</p>`);
    }
  }
  closeList();
  return chunks.join("") || `<p class="thread-zen-par">${escapeHtml(text)}</p>`;
}

function briefEvidenceButtons(links: ActionBriefEvidenceLink[]): string {
  if (!links?.length) return "";
  return links
    .map((L) => {
      const tid = String(L.threadId || "").trim();
      if (!tid) return "";
      const lab = L.label?.trim() || "Ouvrir le fil";
      return `<div class="inbox-brief-evidence"><button type="button" class="ghost-button digest-open-thread" data-thread-id="${escapeAttr(tid)}">${escapeHtml(lab)}</button></div>`;
    })
    .join("");
}

/** Enveloppe lecture mail (`thread-zen`) pour le panneau brief — pas de Markdown. */
function renderBriefMailViewShell(bodyHtml: string, opts?: { kicker?: string }): string {
  const kicker = opts?.kicker?.trim();
  const top =
    kicker ?
      `<div class="thread-zen-top">
        <span class="thread-zen-brand" aria-hidden="true">${iconSvg("spark")}</span>
        <span class="thread-kicker thread-kicker-strong">${escapeHtml(kicker)}</span>
      </div>`
    : "";
  return `<aside class="thread-zen surface-sm inbox-brief-mail" aria-label="Brief du dossier">${top}<div class="thread-zen-body">${bodyHtml}</div></aside>`;
}

function renderBriefMailItemCard(inner: string): string {
  return `<div class="thread-msg-card inbox-brief-item-card">${inner}</div>`;
}

/** Rendu HTML du brief d’action structuré (réponse `llm_inbox_digest`). */
function renderActionBriefHtml(b: ActionBriefResult): string {
  const confPct = Math.max(0, Math.min(100, Math.round(Number(b.confidence ?? 0) * 100)));
  const bucket = escapeHtml(String(b.priorityBucket ?? "—"));
  const mode = escapeHtml(String(b.mode ?? ""));
  const verif = b.verificationRecommended
    ? `<p class="thread-zen-par dim" role="status">Vérification recommandée</p>`
    : "";
  const skills =
    b.executedSkills && b.executedSkills.length ?
      `<p class="thread-zen-par dim inbox-brief-skills">Pipeline : ${escapeHtml(b.executedSkills.join(" → "))}</p>`
    : "";

  const sec = (title: string, inner: string) =>
    `<section class="inbox-brief-section"><div class="thread-kicker">${escapeHtml(title)}</div>${inner}</section>`;

  const changesBody =
    (b.changes || [])
      .map((c) => {
        const ev = briefEvidenceButtons(c.evidenceLinks || []);
        return renderBriefMailItemCard(
          `<p class="thread-zen-par">${escapeHtml(c.summary || "")}</p>${ev}`
        );
      })
      .join("") || `<p class="thread-zen-par dim">—</p>`;

  const decisionsBody =
    [...(b.decisions || [])]
      .sort((a, d) => Number(a.rank) - Number(d.rank))
      .map((d) => {
        const opts = (d.optionsHint || [])
          .map((o) => `<li>${escapeHtml(o)}</li>`)
          .join("");
        const optsHtml = opts ? `<ul class="thread-zen-list">${opts}</ul>` : "";
        return renderBriefMailItemCard(
          `<p class="thread-zen-par dim">#${escapeHtml(String(d.rank))}</p>
          <p class="thread-zen-par"><strong>${escapeHtml(d.title)}</strong></p>
          ${d.impact ? `<p class="thread-zen-par dim">${escapeHtml(d.impact)}</p>` : ""}
          ${optsHtml}${briefEvidenceButtons(d.evidenceLinks || [])}`
        );
      })
      .join("") || `<p class="thread-zen-par dim">—</p>`;

  const actionsBody =
    [...(b.recommendedActions || [])]
      .sort((a, x) => Number(a.rank) - Number(x.rank))
      .map((a) => {
        const due = a.suggestedDue ? `<span class="dim"> · ${escapeHtml(a.suggestedDue)}</span>` : "";
        const pr = a.priority ? `<span class="label inbox-brief-prio">${escapeHtml(a.priority)}</span> ` : "";
        return renderBriefMailItemCard(
          `${pr}<p class="thread-zen-par">${escapeHtml(a.action)}</p>
          <p class="thread-zen-par dim">${escapeHtml(a.suggestedOwner || "")}${due}</p>
          ${briefEvidenceButtons(a.evidenceLinks || [])}`
        );
      })
      .join("") || `<p class="thread-zen-par dim">—</p>`;

  const risksBody =
    (b.risks || [])
      .map((r) => {
        const sev = r.severity ? ` <span class="dim">(${escapeHtml(r.severity)})</span>` : "";
        return renderBriefMailItemCard(
          `<p class="thread-zen-par"><strong>${escapeHtml(r.label)}</strong>${sev}</p>
          ${r.detail ? `<p class="thread-zen-par dim">${escapeHtml(r.detail)}</p>` : ""}
          ${briefEvidenceButtons(r.evidenceLinks || [])}`
        );
      })
      .join("") || `<p class="thread-zen-par dim">—</p>`;

  const ambBody =
    (b.ambiguities || [])
      .map((a) => {
        return renderBriefMailItemCard(
          `<p class="thread-zen-par"><strong>${escapeHtml(a.question)}</strong></p>
          ${a.whyItMatters ? `<p class="thread-zen-par dim">${escapeHtml(a.whyItMatters)}</p>` : ""}
          ${briefEvidenceButtons(a.evidenceLinks || [])}`
        );
      })
      .join("") || `<p class="thread-zen-par dim">—</p>`;

  const inner = `
    <p class="thread-zen-par dim inbox-brief-meta">Confiance ${confPct}% · priorité <strong>${bucket}</strong>${mode ? ` · mode ${mode}` : ""}</p>
    ${verif}
    ${sec("Ce qui change", changesBody)}
    ${sec("Décisions", decisionsBody)}
    ${sec("Actions recommandées", actionsBody)}
    ${sec("Risques & engagements", risksBody)}
    ${sec("Ambiguïtés", ambBody)}
    ${skills}`;
  return renderBriefMailViewShell(inner, { kicker: "Brief d’action" });
}

function formatAttachmentSizeKb(sizeBytes: number): string {
  const kb = Math.max(0, Math.round(sizeBytes / 1024));
  return kb >= 1024 ? `${(sizeBytes / (1024 * 1024)).toFixed(1)} Mo` : `${kb} Ko`;
}

/** Comparaison tolérante pour détecter un HTML / texte réellement modifié par le pipeline Rust. */
function normalizeForCleanCompare(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

/** Digest structuré enregistré (registry) — pas le seul sanitise générique. */
function hasStructuredHtmlCleaningProvider(message: CleanedMessageView): boolean {
  const p = message.htmlCleaningProvider;
  if (p && p !== "generic") return true;
  const ch = message.cleanedHtmlBody ?? "";
  return ch.includes("rustymail:amazon-digest") || ch.includes("rustymail:deblock-digest");
}

/**
 * Préfère la vue nettoyée quand :
 * - un **provider lisible** a produit le HTML (digest Amazon/Deblock), ou
 * - le HTML nettoyé diffère du brut (prune Outlook, strip style/class, etc.), ou
 * - mail sans HTML MIME : corps texte nettoyé (citations/signatures) distinct du brut.
 */
function messagePrefersCleanByDefault(message: CleanedMessageView): boolean {
  if (hasStructuredHtmlCleaningProvider(message)) return true;

  const ch = message.cleanedHtmlBody?.trim();
  const hb = message.htmlBody?.trim();
  if (hb && ch) {
    return normalizeForCleanCompare(ch) !== normalizeForCleanCompare(hb);
  }

  const st = message.sourceText.trim();
  const ct = (message.cleanedText ?? "").trim();
  if (!ct) return false;
  return normalizeForCleanCompare(ct) !== normalizeForCleanCompare(st);
}

function effectiveMessageViewMode(message: CleanedMessageView, userMode: MessageViewMode): MessageViewMode {
  if (!ENABLE_CLEAN_MESSAGE_VIEW) return "original";
  if (userMode === "original") return "original";
  return messagePrefersCleanByDefault(message) ? "clean" : "original";
}

/** Fil classé « auto » (newsletter, notification, noreply…) — pas de réponse attendue. */
function threadIsAutoMail(thread?: { isNewsletterThread?: boolean } | null, threadId?: string | null): boolean {
  if (thread?.isNewsletterThread) return true;
  const tid = threadId ?? state.selectedThreadId;
  if (!tid) return false;
  const row = state.threads.find((t) => String(t.id) === String(tid));
  return Boolean(row?.isNewsletterThread);
}

/** Fil marketing / expéditeur auto : masquer bandeau « première apparition » et diff To/Cc (peu utiles). */
function threadSuppressAutoEnvelopeMeta(
  thread: { isNewsletterThread?: boolean },
  message: CleanedMessageView,
  nlListedHere: boolean
): boolean {
  return threadIsAutoMail(thread) || Boolean(message.isNewsletter) || nlListedHere;
}

function renderThread() {
  const thread = state.selectedThread;
  if (!thread) {
    return `<section class="thread-view" aria-label="Fil"><div class="pane-header thread-load-empty">Fil indisponible — utilisez « ← Boîte de réception » ou relancez la synchronisation.</div></section>`;
  }
  const userMode = state.messageViewMode;
  /** Derniers reçus en premier ; regroupement visuel si le même expéditeur envoie plusieurs mails d’affilée dans cet ordre. */
  const msgs = sortMessagesByReceivedDescending(thread.messages);
  const attachmentCount = msgs.reduce((total, message) => total + message.attachments.length, 0);
  const participantLinks = threadParticipantsWithEmails(thread.messages);
  const avCap = 5;
  const avExtra = participantLinks.length > avCap ? participantLinks.length - avCap : 0;
  const threadTagsCount = threadTagsForModal(thread.tags ?? []).length;
  const threadTagsBtnTitle =
    threadTagsCount > 0 ?
      `Tags du fil (${threadTagsCount}) — kind, source, domaine…`
    : "Tags du fil — kind, source, domaine…";
  const replyTarget = escapeHtml(threadQuickReplyTargetName(msgs));
  const translationTargetLang = state.appPrefs.general.motherLanguage?.trim() || "fr";
  const firstParticipantIds = threadParticipantFirstMessageIds(thread.messages);
  const recipientEventsById = threadRecipientPresenceEventsByMessageId(thread.messages);
  const zenOut = threadAiSummaryShownInZen() ? (state.aiOutput?.trim() ?? "") : "";
  const blockReply = threadIsAutoMail(thread);
  const listRow =
    state.selectedThreadId ?
      state.threads.find((t) => String(t.id) === String(state.selectedThreadId))
    : undefined;
  const toolbarFollowed = listRow ? threadListFollowed(listRow) : false;
  const threadUnreadNav = Boolean(listRow?.unread ?? thread?.unread);
  const curSeenToggleTitle = threadUnreadNav ? "Marquer comme lu" : "Marquer comme non lu";
  const curSeenToggleIcon = threadUnreadNav ? "read" : "unread";
  const readingSimple = true;
  const threadReadingLayoutClass = " thread-reading--reading-layout";

  return `
    <section class="thread-view thread-reading${threadReadingLayoutClass}" aria-label="Fil de discussion">
      <header class="thread-reading-head">
        ${renderViewNavTrail(`<div class="action-bar action-bar--ai" role="toolbar" aria-label="Actions IA">
              <button type="button" class="icon-pill thread-nav-icon" data-action="summarize" title="Résumer" aria-label="Résumer">${iconSvg("spark")}</button>
              ${
                msgs.some((m) => shouldOfferPerMessageTranslate(m, translationTargetLang, thread.tags))
                  ? `<button type="button" class="icon-pill thread-nav-icon" data-action="llm-translate-thread" title="Traduire tout le fil en un bloc (LLM)" aria-label="Traduire tout le fil">${iconSvg("globe")}</button>`
                  : ""
              }
              <button type="button" class="icon-pill thread-nav-icon${state.aiOpen ? " icon-pill--active" : ""}" data-action="toggle-ai" aria-expanded="${state.aiOpen}" title="${state.aiOpen ? "Masquer le panneau Détails" : "Panneau Détails"}" aria-label="${state.aiOpen ? "Masquer le panneau Détails" : "Panneau Détails"}">${iconSvg("panel")}</button>
            </div>
            <div class="action-bar action-bar--util" role="toolbar" aria-label="Actions utilitaires">
              <button type="button" class="icon-pill thread-nav-sync${state.syncInProgress ? " is-loading" : ""}" data-action="sync-inbox" title="Synchroniser (Ctrl+F5)" aria-label="Synchroniser" ${state.syncInProgress ? "disabled" : ""}>${state.syncInProgress ? `<span class="mini-sync"><span class="spinner" aria-hidden="true"></span></span>` : iconSvg("sync")}</button>
            </div>`)}

        <div class="thread-reading-hero">
          <h1 class="thread-reading-title">${escapeHtml(thread.subject)}</h1>
          <p class="thread-reading-stats dim">
            ${msgs.length} message${msgs.length === 1 ? "" : "s"}${attachmentCount > 0 ? ` · ${attachmentCount} pièce${attachmentCount === 1 ? "" : "s"} jointe${attachmentCount === 1 ? "" : "s"}` : ""}
          </p>

          ${participantLinks.length ? `<div class="thread-participants-block">
              <span class="thread-kicker">Participants</span>
              <div class="thread-participants-chips">
                ${participantLinks
                  .slice(0, avCap)
                  .map((p) => renderThreadParticipantLink(p, "thread-participant-chip"))
                  .join("")}
                ${avExtra ? `<span class="dim thread-participant-more">+${avExtra}</span>` : ""}
              </div>
            </div>` : ""}

          <div class="thread-action-bar">
            <div class="thread-more-actions">
              <div class="action-bar action-bar--util" role="toolbar" aria-label="Actions utilitaires">
                <button type="button" class="icon-pill${state.threadTagsModalOpen ? " icon-pill--active" : ""}" data-action="open-thread-tags" title="${escapeAttr(threadTagsBtnTitle)}" aria-label="${escapeAttr(threadTagsBtnTitle)}" aria-expanded="${state.threadTagsModalOpen}">${iconSvg("tags")}</button>
                <button type="button" class="icon-pill" data-action="retag-thread" data-thread-id="${escapeAttr(state.selectedThreadId ?? "")}" title="Recalculer les tags" aria-label="Recalculer les tags">${iconSvg("sync")}</button>
                <button type="button" class="icon-pill inbox-thread-follow-toggle ${toolbarFollowed ? "inbox-thread-follow-toggle--on" : ""}" data-action="toggle-thread-follow" data-thread-id="${escapeAttr(state.selectedThreadId ?? "")}" title="${escapeAttr(toolbarFollowed ? "Retirer du suivi" : "Suivre ce fil")}" aria-label="${escapeAttr(toolbarFollowed ? "Retirer du suivi" : "Suivre ce fil")}" aria-pressed="${toolbarFollowed}">${iconSvg(toolbarFollowed ? "starFilled" : "starOutline")}</button>
                ${
                  ENABLE_CLEAN_MESSAGE_VIEW ?
                    `${iconThreadMessageViewToggle(userMode)}`
                  : ""
                }
              </div>
              <div class="action-bar action-bar--ops" role="toolbar" aria-label="Actions opérationnelles">
                <button type="button" class="icon-pill" data-action="thread-archive-cur" title="Archiver" aria-label="Archiver">${iconSvg("archive")}</button>
                ${
                  blockReply
                    ? ""
                    : `<button type="button" class="icon-pill" data-action="reply" title="Répondre" aria-label="Répondre">${iconSvg("reply")}</button>`
                }
                <button type="button" class="icon-pill inbox-seen-toggle ${threadUnreadNav ? "inbox-seen-toggle--is-unread" : ""}" data-action="toggle-thread-seen-cur" title="${escapeAttr(curSeenToggleTitle)}" aria-label="${escapeAttr(curSeenToggleTitle)}">${iconSvg(curSeenToggleIcon)}</button>
                <button type="button" class="icon-pill danger" data-action="thread-trash-cur" title="Corbeille" aria-label="Corbeille">${iconSvg("trash")}</button>
                <button type="button" class="icon-pill" data-action="thread-move-cur" title="Déplacer" aria-label="Déplacer">${iconSvg("move")}</button>
                ${
                  blockReply
                    ? ""
                    : `<button type="button" class="icon-pill" data-action="reply-all" title="Répondre à tous" aria-label="Répondre à tous">${iconSvg("replyAll")}</button>`
                }
                <button type="button" class="icon-pill" data-action="forward" title="Transférer" aria-label="Transférer">${iconSvg("forward")}</button>
              </div>
            </div>
          </div>
        </div>
      </header>

      ${zenOut ? `<aside class="thread-zen surface-sm" aria-label="Résumé">
          <div class="thread-zen-top">
            <span class="thread-zen-brand" aria-hidden="true">${iconSvg("spark")}</span>
            <span class="thread-kicker thread-kicker-strong">Résumé</span>
          </div>
          <div class="thread-zen-body">${zenSummaryHtmlFragments(zenOut)}</div>
        </aside>` : ""}

      <div class="thread-messages thread-messages-reading">
        ${msgs
          .map((message, i) => {
            const prev = msgs[i - 1];
            const sameSenderAsPrev =
              Boolean(prev) && normalizeThreadSenderLabel(prev!.sender) === normalizeThreadSenderLabel(message.sender);
            const showMeta = !sameSenderAsPrev;
            const showAvatar = !sameSenderAsPrev;
            const daySeparator = renderDaySeparator(prev?.receivedAt, message.receivedAt);
            const laneTree = threadTreeLaneRight(thread, message);
            const isMine = isOwnSender(message.sender);
            const isRoot = laneTree.isRoot;
            const isSolo = msgs.length === 1;
            const laneRight = laneTree.laneRight;
            const accentVars = senderAccentVars(message.sender);
            const isoWhen = receivedAtIsoDatetime(message.receivedAt);
            const eff = effectiveMessageViewMode(message, userMode);
            const showsHtmlBubble =
              eff === "original"
                ? Boolean(message.htmlBody)
                : Boolean(message.cleanedHtmlBody?.trim());
            const seSenderRaw = message.senderEmail?.trim() ?? "";
            /** Liste côté client + drapeaux renvoyés par open_thread après enrichissement SQLite. */
            const nlListedHere =
              Boolean(message.isNewsletter) || newsletterEmailListed(seSenderRaw);
            const suppressAutoEnvelope = threadSuppressAutoEnvelopeMeta(thread, message, nlListedHere);
            const nlRuleRow = renderThreadNlRuleButton(seSenderRaw, nlListedHere);
            const participantFirst =
              suppressAutoEnvelope ? "" : renderThreadParticipantFirstBadge(message, firstParticipantIds);
            const recipientPresenceHtml = suppressAutoEnvelope
              ? ""
              : renderThreadRecipientPresenceNote(recipientEventsById.get(message.messageId));
            const offerMsgTranslate = shouldOfferPerMessageTranslate(message, translationTargetLang, thread.tags);
            const inlineTr = renderMessageInlineTranslation(message, translationTargetLang, offerMsgTranslate);
            const htmlForDisplay = showsHtmlBubble ? messageHtmlForDisplay(message, eff) : null;
            const unsubLinks = htmlForDisplay ? extractUnsubscribeLinksFromHtml(htmlForDisplay) : [];
            const headActionsHtml = renderThreadMsgHeadActions(message, nlRuleRow, thread.tags);
            const headMainHtml =
              showMeta ?
                readingSimple
                  ? `${renderMessageSenderLink(message)}
                        <span class="thread-msg-head-sep" aria-hidden="true">·</span>
                        <time class="thread-msg-time"${isoWhen ? ` datetime="${escapeAttr(isoWhen)}"` : ""}>${escapeHtml(formatThreadReadingWhen(message.receivedAt))}</time>`
                  : `<time class="thread-msg-time"${isoWhen ? ` datetime="${escapeAttr(isoWhen)}"` : ""}>${escapeHtml(formatThreadReadingWhen(message.receivedAt))}</time>
                        <span class="thread-msg-head-sep" aria-hidden="true">·</span>
                        ${renderMessageSenderLink(message)}`
              : `<time class="thread-msg-time thread-msg-time--inline"${isoWhen ? ` datetime="${escapeAttr(isoWhen)}"` : ""}>${escapeHtml(formatThreadReadingWhen(message.receivedAt))}</time>`;
            const anchorId = threadMessageAnchorId(message.messageId, i);
            const anchorName = message.messageId.trim() || anchorId;
            return `
              ${daySeparator}
              ${participantFirst}
              ${recipientPresenceHtml}
              <a class="thread-msg-anchor" name="${escapeAttr(anchorName)}" id="${escapeAttr(anchorId)}" aria-hidden="true"></a>
              <article class="message thread-msg ${isMine ? "mine" : ""} ${laneRight ? "thread-msg--lane-right" : ""} ${isRoot ? "thread-msg--root" : ""} ${isSolo ? "thread-msg--solo" : ""} ${showsHtmlBubble ? "has-html" : ""} ${showMeta ? "thread-msg--head" : "compact"}" style="${accentVars}">
                ${showAvatar ? `<span class="avatar thread-msg-avatar">${initials(message.sender)}</span>` : `<span class="avatar avatar-spacer" aria-hidden="true"></span>`}
                <div class="message-stack">
                  <header class="message-head-row${showMeta ? "" : " message-head-row--compact"}">
                    <div class="thread-msg-head-main">${headMainHtml}</div>
                    ${headActionsHtml}
                  </header>
                  <div class="thread-msg-card mail-security-tier ${mailSecurityTierClass(normalizedMailSecurity(message))}">
                    ${renderMessageBody(message, eff, unsubLinks)}
                    ${inlineTr}
                    ${
                      message.attachments.length > 1
                        ? `<div class="thread-attach-bulk-row">
                        <button type="button" class="ghost-button thread-attach-bulk-btn" data-action="download-all-attachments" data-msg-id="${escapeAttr(message.messageId)}" title="Enregistrer toutes les pièces jointes de ce message dans Téléchargements">
                          ${iconSvg("download")}<span>Tout télécharger (${message.attachments.length})</span>
                        </button>
                      </div>`
                        : ""
                    }
                    ${renderThreadMessageAttachmentSection(message)}
                    ${""}
                  </div>
                </div>
              </article>
            `;
          })
          .join("")}
      </div>

      ${
        blockReply
          ? ""
          : `<div class="thread-quick-zone">
        <div class="thread-quick-reveal-bar">
          <button
            type="button"
            class="thread-quick-reveal surface-sm${state.threadQuickReplyOpen ? " is-open" : ""}"
            data-action="toggle-thread-quick-reply"
            aria-expanded="${state.threadQuickReplyOpen ? "true" : "false"}"
            aria-controls="thread-quick-panel"
            title="${state.threadQuickReplyOpen ? "Masquer la réponse rapide" : "Afficher la réponse rapide"}"
          >
            ${iconSvg("reply")}
            <span class="thread-quick-reveal-label">Répondre à <strong>${replyTarget}</strong></span>
            <span class="thread-quick-reveal-chevron" aria-hidden="true"></span>
          </button>
        </div>
        <div id="thread-quick-panel" class="thread-quick-panel${state.threadQuickReplyOpen ? " is-open" : ""}">
          <div class="thread-quick-panel-inner">
            <footer class="quick-reply thread-quick-footer">
              <div class="thread-quick-sheet surface-sm">
                <p class="thread-quick-kicker"><span>Répondre à</span> <strong>${replyTarget}</strong></p>
                <input
                  type="text"
                  class="thread-quick-field"
                  placeholder="Écrivez votre réponse…"
                  data-quick-reply
                  autocomplete="off"
                  ${state.threadQuickReplyOpen ? "" : " tabindex=\"-1\""}
                />
                <div class="thread-quick-bottom">
                  <div class="thread-quick-links">
                    <button type="button" class="thread-linkish" data-action="quick-reply-compose" title="Composer">Composer</button>
                    <span class="thread-quick-div" aria-hidden="true"></span>
                    <button type="button" class="thread-linkish" data-action="forward" title="Transférer">Transférer</button>
                  </div>
                  <div class="thread-quick-send">
                    <button type="button" class="ghost-button thread-quick-secondary" data-action="quick-reply-send-all">Tous</button>
                    <button type="button" class="primary-button thread-quick-primary" data-action="quick-reply-send">Envoyer la réponse</button>
                  </div>
                </div>
              </div>
            </footer>
          </div>
        </div>
      </div>`
      }
    </section>
  `;
}

function defaultMailSecuritySignals(): MailSecuritySignals {
  return {
    severity: "ok",
    summaryFr: "Rien d’inhabituel détecté selon les règles locales.",
    findings: []
  };
}

function normalizedMailSecurity(message: CleanedMessageView): MailSecuritySignals {
  const mid = message.messageId?.trim();
  const cached = mid ? securityLlmAugmentCache[mid] : undefined;
  if (cached) return cached;
  return message.mailSecurity ?? defaultMailSecuritySignals();
}

/** Détail affiché : sans doublon heuristique quand l’IA sécurité est active. */
function mailSecurityFindingsForDisplay(
  message: CleanedMessageView,
  ms: MailSecuritySignals
): MailSecuritySignals["findings"] {
  const mid = message.messageId?.trim();
  if (!isAiFeatureEnabled(state.appPrefs.ai, "featureSecurityLlmEnabled")) {
    return ms.findings ?? [];
  }
  if (mid && securityLlmAugmentCache[mid]) {
    return ms.findings ?? [];
  }
  if (mid && securityLlmAugmentFailed[mid]) {
    return ms.findings ?? [];
  }
  if (mid && securityLlmAugmentBusy[mid]) {
    return [];
  }
  if (mid) {
    return [];
  }
  return ms.findings ?? [];
}

function scheduleSecurityLlmAugment(message: CleanedMessageView): void {
  const mid = message.messageId?.trim();
  if (!mid || !isTauriRuntime()) return;
  if (!isAiFeatureEnabled(state.appPrefs.ai, "featureSecurityLlmEnabled")) return;
  const base = message.mailSecurity ?? defaultMailSecuritySignals();
  if (base.severity === "ok") return;
  if (securityLlmAugmentCache[mid] || securityLlmAugmentBusy[mid]) return;
  delete securityLlmAugmentFailed[mid];
  securityLlmAugmentBusy[mid] = true;
  void (async () => {
    try {
      const augmented = await invoke<MailSecuritySignals>("llm_security_signals_augment", {
        payload: base,
      });
      securityLlmAugmentCache[mid] = augmented;
      if (state.view === "thread" && state.selectedThread?.messages?.some((m) => m.messageId === mid)) {
        render();
      }
    } catch {
      securityLlmAugmentFailed[mid] = true;
    } finally {
      delete securityLlmAugmentBusy[mid];
      if (state.view === "thread" && state.selectedThread?.messages?.some((m) => m.messageId === mid)) {
        render();
      }
    }
  })();
}

function mailSecurityTierClass(ms: MailSecuritySignals): string {
  return ms.severity === "ok"
    ? "mail-security-tier--ok"
    : ms.severity === "attention"
      ? "mail-security-tier--attention"
      : "mail-security-tier--suspicion";
}

/** Contrôle compact (icône + libellé court) ; le détail s’ouvre au clic — heuristiques locales, pas verdict. */
function renderMailSecurityPop(message: CleanedMessageView, opts?: { compact?: boolean }): string {
  const ms = normalizedMailSecurity(message);
  // UX: ne pas afficher de badge quand tout va bien (évite "RAS" omniprésent et inutile).
  if (ms.severity === "ok") return "";
  const label = ms.severity === "attention" ? "À vérifier" : "Suspicion";
  const chipClass =
    ms.severity === "attention" ? "mail-security-hit--attention" : "mail-security-hit--suspicion";
  const hasLlmHint =
    Boolean(ms.llmBudget) || (ms.findings?.some((f) => f.kind === "llmIntent") ?? false);
  const iaPill = hasLlmHint
    ? `<span class="mail-security-ia-pill" title="Signal ou budget lié à une analyse IA">IA</span>`
    : "";
  const mid = message.messageId?.trim();
  const iaSecurityOn = isAiFeatureEnabled(state.appPrefs.ai, "featureSecurityLlmEnabled");
  const iaPending = Boolean(
    mid &&
      iaSecurityOn &&
      securityLlmAugmentBusy[mid] &&
      !securityLlmAugmentCache[mid] &&
      !securityLlmAugmentFailed[mid]
  );
  const displayFindings = mailSecurityFindingsForDisplay(message, ms);
  const findings =
    displayFindings.map(
      (f) =>
        `<li class="mail-security-finding mail-security-finding--${escapeAttr(String(f.severity))}">${escapeHtml(f.messageFr)}${
          f.kind === "llmIntent" ?
            ` <span class="dim mail-security-kind-ia" title="Contribution IA">(IA)</span>`
          : ""
        }</li>`
    ) ?? [];
  const findingsBlock = findings.length
    ? `<ul class="mail-security-findings" role="list">${findings.join("")}</ul>`
    : iaPending
      ? `<p class="mail-security-panel__pending dim">Analyse IA en cours…</p>`
      : "";
  const wrap = opts?.compact ? "mail-security-pop mail-security-pop--compact" : "mail-security-pop";
  return `<details class="${wrap}">
  <summary class="mail-security-hit ${chipClass}" title="${escapeAttr(`Sécurité : ${label} (cliquer pour le détail)`) }" aria-label="${escapeAttr(`Sécurité : ${label}`)}">
    <span class="mail-security-hit__ico" aria-hidden="true">${iconSvg("shield")}</span>
    ${iaPill}
  </summary>
  <div class="mail-security-panel">
    <p class="mail-security-panel__lead">${escapeHtml(ms.summaryFr)}</p>
    ${findingsBlock ? `<p class="mail-security-panel__kicker">Détail</p>${findingsBlock}` : ""}
  </div>
</details>`;
}

function renderMessageBody(message: CleanedMessageView, mode: MessageViewMode, unsubLinks?: MailUnsubscribeLink[]) {
  const unsubBar =
    unsubLinks === undefined
      ? ""
      : renderMailUnsubscribeBar(unsubLinks);
  if (mode === "original") {
    if (message.htmlBody)
      return `${unsubBar}<div class="message-html" ${mailHtmlMountAttrs(message.messageId, message.htmlBody)}></div>`;
    return `<div class="message-text">${escapeHtml(message.sourceText)}</div>`;
  }
  // clean: HTML nettoyé côté Rust quand disponible, sinon texte (signatures / citations)
  const cleanHtml = message.cleanedHtmlBody?.trim();
  if (cleanHtml) {
    return `${unsubBar}<div class="message-html message-html--clean" ${mailHtmlMountAttrs(message.messageId, cleanHtml)}></div>`;
  }
  return `<div class="message-text">${escapeHtml(message.cleanedText || message.sourceText)}</div>`;
}

function parseMaybeDate(value: string): Date | null {
  const raw = String(value).trim();
  if (!raw || raw === "—" || raw === "-" || raw === "–") return null;
  const t = Date.parse(raw);
  if (!Number.isFinite(t)) return null;
  return new Date(t);
}

function formatThreadCompactClock(receivedAt: string): string {
  const d = parseMaybeDate(receivedAt);
  if (!d) return receivedAt.trim() || "";
  return d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

function dayKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function renderDaySeparator(prevReceivedAt: string | undefined, curReceivedAt: string) {
  const cur = parseMaybeDate(curReceivedAt);
  if (!cur) return "";
  const prev = prevReceivedAt ? parseMaybeDate(prevReceivedAt) : null;
  if (prev && dayKey(prev) === dayKey(cur)) return "";

  const today = new Date();
  const label =
    dayKey(cur) === dayKey(today)
      ? "Aujourd’hui"
      : dayKey(cur) === dayKey(new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1))
        ? "Hier"
        : cur.toLocaleDateString(undefined, { weekday: "long", day: "2-digit", month: "short" });

  return `<div class="day-separator"><span>${escapeHtml(label)}</span></div>`;
}

function isOwnSender(sender: string) {
  const account = currentAccount();
  const s = sender.trim().toLowerCase();
  if (!s) return false;
  const byEmail = account?.email?.trim().toLowerCase();
  const byName = account?.displayName?.trim().toLowerCase();
  return Boolean((byEmail && s === byEmail) || (byName && s === byName) || s === "sarah chen");
}

function draftHasRecipientsExtra(draft?: Draft): boolean {
  if (!draft) return false;
  const hasEmails = (list: Draft["to"]) => list.some((x) => Boolean(x.email?.trim()));
  return hasEmails(draft.cc) || hasEmails(draft.bcc);
}

function composeKindTitle(kind?: Draft["kind"]): string {
  switch (kind) {
    case "Reply":
      return "Réponse";
    case "Forward":
      return "Transfert";
    default:
      return "Nouveau message";
  }
}

function formatDraftRevisionStamp(iso: string): string {
  const raw = iso.trim();
  const t = Date.parse(raw);
  if (!Number.isFinite(t)) return raw;
  return new Date(t).toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" });
}

/** Panneau droit « Historique » : liste des versions + aperçu / diff de la sélection (comme Split). */
function renderComposerHistoriquePane(): string {
  if (!isTauriRuntime()) {
    return `<aside class="composer-history-pane composer-history-pane--disabled" aria-label="Historique du brouillon">
      <p class="composer-history-pane__hint dim">L’historique local des versions est disponible dans l’app bureau (Tauri).</p>
    </aside>`;
  }
  const revs = state.draftRevisions;
  const expanded = state.draftVersionsListExpanded;
  const n = revs.length;
  const summaryLabel =
    n === 0 ? "Aucune version" : n === 1 ? "1 version" : `${n} versions`;

  const rows =
    revs.length ?
      revs
        .map(
          (rev) => `<li class="composer-history-pane__rev">
              <button type="button" class="composer-history-pane__icon-action" data-action="compare-draft-revision" data-revision-id="${escapeAttr(rev.id)}" title="Comparer avec le brouillon actuel">
                ⇄
              </button>
              <button type="button" class="composer-history-pane__icon-action" data-action="restore-draft-revision" data-revision-id="${escapeAttr(rev.id)}" title="Restaurer cette version">
                ↩
              </button>
              <span class="composer-history-pane__stamp dim">${escapeHtml(formatDraftRevisionStamp(rev.createdAt))}</span>
            </li>`
        )
        .join("")
    : "";

  const listBlock =
    expanded || n === 0
      ? `<ul class="composer-history-pane__list" role="list">${
          n ? rows : `<li class="composer-history-pane__empty dim">Pas encore de snapshot (éditez quelques secondes puis revenez).</li>`
        }</ul>`
      : "";

  const comparisonBlock =
    state.draftDiffRevisionId
      ? `
        <div class="composer-history-pane__detail" role="region" aria-label="Comparaison">
          <div class="composer-history-pane__detail-head">
            <span class="composer-history-pane__detail-label dim">Comparaison</span>
            <button type="button" class="ghost-button composer-history-pane__mode-toggle" data-action="toggle-draft-compare-view" ${
              state.draftDiffLoading ? "disabled" : ""
            } title="Basculer aperçu HTML / diff +/−">
              ${state.draftDiffView === "preview" ? "Diff" : "Aperçu"}
            </button>
          </div>
          ${
            state.draftDiffLoading
              ? `<p class="composer-history-pane__microhint dim">Chargement…</p>`
              : state.draftDiffView === "preview"
                ? `<div class="preview preview--revision">${sanitizeEmailHtml(state.draftRevisionPreview?.html ?? "").html}</div>`
                : state.draftDiffLines.length
                  ? `<pre class="draft-diff__pre draft-diff__pre--composer">${state.draftDiffLines
                      .map((l) => {
                        const cls =
                          l.kind === "add"
                            ? "draft-diff__line draft-diff__line--add"
                            : l.kind === "del"
                              ? "draft-diff__line draft-diff__line--del"
                              : "draft-diff__line";
                        const prefix = l.kind === "add" ? "+" : l.kind === "del" ? "-" : " ";
                        return `<span class="${cls}">${escapeHtml(prefix)} ${escapeHtml(l.text)}</span>`;
                      })
                      .join("\n")}</pre>`
                  : `<p class="composer-history-pane__microhint dim">Aucune différence.</p>`
          }
        </div>`
      : !state.draftDiffRevisionId && n > 0 && !expanded
        ? `<p class="composer-history-pane__microhint dim">Liste repliée — ouvrir pour choisir une version (⇄ comparer).</p>`
        : n > 0 && !state.draftDiffRevisionId && expanded
          ? `<p class="composer-history-pane__microhint dim">⇄ comparer · ↩ restaurer</p>`
          : "";

  return `<aside class="composer-history-pane" aria-label="Historique du brouillon">
      <div class="composer-history-pane__bar">
        <button
          type="button"
          class="composer-history-pane__summary"
          data-action="toggle-draft-versions-expanded"
          aria-expanded="${expanded}"
          title="Afficher ou masquer la liste des versions"
          ${state.draftRevisionsLoading ? "disabled" : ""}
        >
          <span class="composer-history-pane__chev" aria-hidden="true">${expanded ? "▾" : "▸"}</span>
          <span class="composer-history-pane__summary-text">${escapeHtml(summaryLabel)}</span>
          ${state.draftRevisionsLoading ? `<span class="composer-history-pane__spinner dim" aria-hidden="true"> …</span>` : ""}
        </button>
        <button type="button" class="composer-history-pane__mini-refresh" data-action="refresh-draft-history" title="Rafraîchir la liste" aria-label="Rafraîchir la liste" ${
          state.draftRevisionsLoading ? "disabled" : ""
        }>↻</button>
      </div>
      ${listBlock}
      ${comparisonBlock}
    </aside>`;
}

function renderComposer() {
  const draft = state.draft;
  const attachments = draft?.attachmentPaths ?? [];
  const layout = state.composeLayout;
  const isHistorique = layout === "historique";
  const showPreviewPane = layout !== "write" && !isHistorique;
  const textareaOffscreen = layout === "preview";
  const forcedCcBcc = draftHasRecipientsExtra(draft);
  const showCcBccRows = Boolean(state.composeCcBccOpen || forcedCcBcc);
  const ccBccToggle =
    forcedCcBcc ?
      ""
    : `<button type="button" class="compose-link" data-action="toggle-compose-cc-bcc">${
        state.composeCcBccOpen ? "Réduire" : "Cc · Cci"
      }</button>`;

  const ccRows = showCcBccRows ?
    `<div class="field-row"><label class="compose-field-label">Cc</label><div id="compose-cc-host" class="compose-recipients-host compose-to-cell"></div></div>
     <div class="field-row"><label class="compose-field-label">Cci</label><div id="compose-bcc-host" class="compose-recipients-host compose-to-cell"></div></div>`
    : "";

  const correctionPanelHtml =
    state.composeGrammarSuggestions?.length ?
      `<aside class="compose-correction-panel surface-sm" role="complementary" aria-label="Correction de texte">
        <div class="compose-correction-panel__head">
          <strong>Correction de texte</strong>
          <button type="button" class="ghost-button compose-correction-dismiss" data-action="compose-grammar-dismiss">Fermer</button>
        </div>
        <ul class="compose-correction-list" role="list">
          ${state.composeGrammarSuggestions
            .map(
              (g, i) => `
            <li class="compose-correction-item" role="listitem">
              <div class="compose-correction-item__main">
                <p class="compose-correction-reason dim">${escapeHtml(g.reason)}</p>
                <p class="compose-correction-diff"><span class="compose-correction-del">${escapeHtml(g.original)}</span> → <strong>${escapeHtml(g.replacement)}</strong></p>
              </div>
              <button type="button" class="ghost-button compose-correction-apply" data-action="compose-grammar-apply" data-grammar-i="${i}">Appliquer</button>
            </li>`
            )
            .join("")}
        </ul>
      </aside>`
    : "";

  return `
    <section class="compose-view composer-mail-shell composer-fullscreen-shell" aria-label="Composer">
      <header class="compose-fs-header">
        <div class="compose-fs-hintbar">
          <p class="compose-fs-layout-hint dim" aria-hidden="true">
            Markdown · <span class="kbd">M</span> basculer la vue du compositeur
          </p>
        </div>
        <div class="compose-fs-header-row">
          <button type="button" class="icon-button compose-fs-close" data-action="close-compose" aria-label="Fermer le composer">×</button>
          <div class="compose-fs-title-block">
            <span class="compose-fs-kicker">Composer</span>
            <span class="compose-fs-subtitle dim">${escapeHtml(composeKindTitle(draft?.kind))}</span>
          </div>
          <div class="compose-fs-tabs-stack">
            <nav class="compose-fs-tabs" role="tablist" aria-label="Mode d’affichage du composer">
              <button type="button" role="tab" aria-selected="${layout === "split"}" class="compose-fs-tab ${layout === "split" ? "is-active" : ""}" data-action="set-compose-layout" data-compose-layout="split">Split</button>
              <button type="button" role="tab" aria-selected="${layout === "write"}" class="compose-fs-tab ${layout === "write" ? "is-active" : ""}" data-action="set-compose-layout" data-compose-layout="write">Écrire</button>
              <button type="button" role="tab" aria-selected="${layout === "preview"}" class="compose-fs-tab ${layout === "preview" ? "is-active" : ""}" data-action="set-compose-layout" data-compose-layout="preview">Aperçu</button>
              <button type="button" role="tab" aria-selected="${layout === "historique"}" class="compose-fs-tab ${layout === "historique" ? "is-active" : ""}" data-action="set-compose-layout" data-compose-layout="historique"${
                isTauriRuntime() ? "" : " disabled"
              } title="Comparer les versions locales du brouillon (app bureau)">Historique</button>
            </nav>
          </div>
          ${
            isTauriRuntime()
              ? `<button type="button" class="ghost-button compose-fs-save-saved-draft" data-action="save-saved-draft" title="Enregistrer dans la liste Brouillons sauvegardés (barre latérale)">Enregistrer</button>`
              : ""
          }
          <button type="button" class="primary-button compose-fs-send compose-send" data-action="send">Envoyer</button>
        </div>
      </header>
      <div class="compose-workspace">
        <div class="compose-meta-card surface-sm">
          <div class="field-row compose-to-row">
            <label for="compose-to" class="compose-field-label">À</label>
            <div class="compose-to-cell">
              <div id="compose-to-host" class="compose-recipients-host"></div>
              ${ccBccToggle ? `<span class="compose-recipient-extra">${ccBccToggle}</span>` : ""}
            </div>
          </div>
          ${ccRows}
          <div class="field-row compose-subject-row"><label for="compose-subject" class="compose-field-label">Objet</label><input id="compose-subject" class="compose-subject-input" placeholder="Objet du message" value="${escapeAttr(draft?.subject ?? "")}" /></div>
          <div class="field-row compose-files-row">
            <label class="compose-field-label">Fichiers</label>
            <div class="attachments-row attachments-row--unified">
              <div class="compose-attachments-chips-scroll" aria-label="Liste des pièces jointes">
                <div class="attachments-chips compose-attachments-chips" aria-label="Pièces jointes">
                ${
                  attachments.length ?
                    attachments
                      .map((p) => {
                        const base = fileBaseName(p);
                        return `<span class="attachment-chip surface-sm" title="${escapeAttr(p)}">
              <span class="chip-icon" aria-hidden="true">${iconSvg("attachment")}</span>
              <span class="chip-name">${escapeHtml(base)}</span>
              <button class="chip-remove" data-action="remove-attachment" data-path="${escapeAttr(p)}" aria-label="Retirer ${escapeAttr(base)}" title="Retirer">×</button>
            </span>`;
                      })
                      .join("")
                  : `<span class="dim compose-attachments-empty">Aucune pièce jointe</span>`
                }
                </div>
              </div>
              <div class="attachments-actions">
                <button class="ghost-button composer-accent-outline" type="button" data-action="pick-attachments" title="Ajouter des pièces jointes">Ajouter…</button>
                <button class="ghost-button" type="button" data-action="clear-attachments" title="Vider la liste" ${attachments.length ? "" : "disabled"}>Effacer</button>
              </div>
            </div>
            <input id="compose-attachments" value="${escapeAttr(attachmentPathsJoinedForHiddenField(attachments))}" style="display:none" />
          </div>
          <div class="composer-advanced composer-advanced--footnote">
            <button
              type="button"
              class="composer-advanced-micro"
              data-action="toggle-compose-advanced"
              aria-expanded="${state.composeAdvancedOpen}"
            >
              <span class="composer-advanced-chevron" aria-hidden="true">${state.composeAdvancedOpen ? "▾" : "▸"}</span>
              <span>${state.composeAdvancedOpen ? "Masquer les options techniques" : "Options techniques"}</span>
              <span class="composer-advanced-micro-hint dim">multipart HTML</span>
            </button>
            ${
              state.composeAdvancedOpen
                ? `<div class="composer-advanced-body composer-advanced-body--footnote">
                    <div class="field-row field-row--tight-top field-row--advanced">
                      <label for="compose-send-html" class="dim">HTML</label>
                      <label class="composer-checkbox-inline">
                        <input id="compose-send-html" type="checkbox" ${draft?.sendHtml ? "checked" : ""} />
                        <span class="dim composer-checkbox-help">Envoyer en multipart (texte brut + HTML)</span>
                      </label>
                    </div>
                  </div>`
                : ""
            }
          </div>
        </div>
      <div class="compose-editor-sheet">
        <div class="compose-secondary-toolbar">
          <div
            class="compose-toolbar-voice"
            title="Dictée : Whisper transcrit l’audio. Les boutons Style déterminent le ton si « Réécrire avec le style » est activé dans IA → Dictée (réécriture LLM après dictée)."
          >
            <span class="composer-toolbar-caption dim">Dictée</span>
            <div class="tone-inline tone-inline--voice">
              <span class="composer-toolbar-caption dim composer-toolbar-caption--sub">Style</span>
              ${tones
                .map(
                  (tone) =>
                    `<button type="button" class="tone-button ${tone === state.tone ? "active" : ""}" data-tone="${tone}" title="Style par défaut pour Réécriture IA (${toneLabelsFr[tone]})">${escapeHtml(toneLabelsFr[tone])}</button>`
                )
                .join("")}
            </div>
            <div class="compose-mic-cluster">
              <button
                class="mic-button ${state.micState}"
                type="button"
                data-action="mic"
                title="${escapeAttr(composeMicButtonTitle())}"
                aria-label="${escapeAttr(micAriaLabel("compose"))}"
                aria-pressed="${state.micState === "recording"}"
              >
                <span class="mic-button__ico" aria-hidden="true">${iconSvg("mic")}</span>
              </button>
            </div>
          </div>
          <div class="md-toolbar md-toolbar-rich" role="toolbar" aria-label="Mise en forme Markdown">
            <button type="button" class="ghost-button md-button" data-md="bold" title="Gras (Ctrl+B)">Gras</button>
            <button type="button" class="ghost-button md-button" data-md="italic" title="Italique (Ctrl+I)">Italique</button>
            <button type="button" class="ghost-button md-button md-button-underline" data-md="underline" title="Souligné (Ctrl+U)">Soul.</button>
            <span class="md-toolbar-sep" aria-hidden="true"></span>
            <button type="button" class="ghost-button md-button" data-md="h1" title="Titre 1 (#)">Titre 1</button>
            <button type="button" class="ghost-button md-button" data-md="h2" title="Titre 2 (##)">Titre 2</button>
            <button type="button" class="ghost-button md-button" data-md="h3" title="Titre 3 (###)">Titre 3</button>
            <span class="md-toolbar-sep" aria-hidden="true"></span>
            <button type="button" class="ghost-button md-button" data-md="ul" title="Liste à puces">Puces</button>
            <button type="button" class="ghost-button md-button" data-md="ol" title="Liste numérotée">Num.</button>
            <button type="button" class="ghost-button md-button" data-md="link" title="Lien (Ctrl+K)">Lien</button>
            <button type="button" class="ghost-button md-button" data-md="image" title="Image (URL Markdown)">Image</button>
            <button type="button" class="ghost-button md-button" data-md="table" title="Tableau Markdown">Tableau</button>
            <span class="md-toolbar-sep" aria-hidden="true"></span>
            <button type="button" class="ghost-button md-button" data-md="code" title="Code">&lt;&gt;</button>
            <button type="button" class="ghost-button md-button" data-md="quote" title="Citation">Citation</button>
            <span class="md-toolbar-sep" aria-hidden="true"></span>
            <button type="button" class="ghost-button md-button" data-md="undo" title="Annuler">Annuler</button>
            <button type="button" class="ghost-button md-button" data-md="redo" title="Refaire">Refaire</button>
          </div>
          <div class="compose-llm-strip dim" role="group" aria-label="Brouillon · réécriture IA" style="display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin-top:8px;font-size:11px">
            <span>Réécriture ·</span>
            <button
              type="button"
              class="ghost-button md-button"
              data-action="compose-ai-rewrite-selected-tone"
              title="Réécrire tout le texte avec le style choisi à gauche (Dictée · Réécriture)"
            >
              Style sélectionné
            </button>
            <button type="button" class="ghost-button md-button" data-action="compose-ai-rewrite" data-rewrite-style="Formal" title="Ton formel (LLM)">Formel</button>
            <button type="button" class="ghost-button md-button" data-action="compose-ai-rewrite" data-rewrite-style="Casual" title="Ton décontracté">Décontracté</button>
            <button type="button" class="ghost-button md-button" data-action="compose-ai-rewrite" data-rewrite-style="Concise" title="Concis">Concis</button>
            <span class="md-toolbar-sep" aria-hidden="true"></span>
            <button type="button" class="ghost-button md-button" data-action="compose-ai-grammar" title="Orthographe & formulation (LLM)">Correction</button>
            ${
              isAiFeatureEnabled(state.appPrefs.ai, "featureQuickReplyComposeEnabled")
                ? `<span class="md-toolbar-sep" aria-hidden="true"></span>
            <button type="button" class="ghost-button md-button" data-action="llm-quick-replies-compose" title="Suggestions de réponses (sans fil ouvert)">Réponses rapides</button>`
                : ""
            }
          </div>
        </div>
        ${correctionPanelHtml}
        <div class="composer-body composer-body--${isHistorique ? "historique" : layout}">
          <textarea
            id="compose-body"
            class="${textareaOffscreen ? "composer-source-offscreen" : ""}"
            placeholder="Rédiger en Markdown…"
            ${textareaOffscreen ? 'tabindex="-1" aria-hidden="true"' : ""}
          >${escapeHtml(state.composeBody)}</textarea>
          ${isHistorique ? renderComposerHistoriquePane() : showPreviewPane ? `<div class="preview">${state.preview?.html ?? ""}</div>` : ""}
          <div class="drop-hint" aria-hidden="true">
            <strong>Déposez des fichiers dans cette fenêtre</strong>
            <span>Pièces jointes : glisser-déposer depuis l’explorateur (chemins locaux, app bureau).</span>
          </div>
        </div>
      </div>
      </div>
    </section>
  `;
}

function settingsDraftProfile(): Account | undefined {
  if (state.settingsSelectedAccountId === "new") return undefined;
  return state.accounts.find((a) => a.id === state.settingsSelectedAccountId);
}

/** Combine le compte SQLite (si édition) avec la détection / préréglage courant avant re-render du formulaire. */
function mergedProfileForAccountsForm(): Account | undefined {
  const base = settingsDraftProfile();
  const scratch = state.accountFormOAuthPrefill ?? accountsFormIdentityScratch;
  if (!discoveredServersFormSnap || accountFieldTouched.serverFields) {
    return base;
  }

  const displayName = scratch?.displayName?.trim() ?? base?.displayName ?? "";
  const email = scratch?.email?.trim() ?? base?.email ?? "";
  const snapImap = discoveredServersFormSnap!.imap;
  const snapSmtp = discoveredServersFormSnap!.smtp;
  if (base) {
    return { ...base, imap: snapImap, smtp: snapSmtp };
  }
  return {
    id: "__draft__",
    displayName,
    email,
    imap: snapImap,
    smtp: snapSmtp,
    authKind: state.accountFormAuthKind,
  };
}

function renderSettingsGeneralPanel(): string {
  const ml = state.appPrefs.general.motherLanguage;
  const globalBook = Boolean(state.appPrefs.general.addressBookGlobalScope);
  const activitySuggestions = state.appPrefs.general.activitySuggestionsEnabled !== false;
  const defaultLf = defaultListFilterFromPrefs();
  const prefAccId = defaultAccountIdFromPrefs() ?? "";
  const accountOptions =
    state.accounts.length ?
      `<option value="" ${!prefAccId ? "selected" : ""}>Premier compte de la liste</option>${state.accounts
        .map((a) => {
          const label = (a.displayName || a.email || a.id).trim();
          return `<option value="${escapeAttr(a.id)}" ${prefAccId === a.id ? "selected" : ""}>${escapeHtml(label)}</option>`;
        })
        .join("")}`
    : `<option value="" selected>— Aucun compte configuré —</option>`;
  return wrapSettingsPage(`
    <div class="settings-card settings-general surface-sm">
      <section class="settings-general-section" aria-labelledby="settings-general-lang-heading">
        <h3 id="settings-general-lang-heading" class="thread-kicker settings-form-kicker">${escapeHtml(t("settings.general.languageHeading"))}</h3>
        ${settingsExplainHtml(t("settings.general.languageExplain"))}
        <div class="settings-form-row">
          <label class="compose-field-label" for="prefs-mother-language">${escapeHtml(t("settings.general.motherLanguage"))}</label>
          <select class="settings-ctl settings-ctl-select" id="prefs-mother-language">
            <option value="fr" ${ml === "fr" ? "selected" : ""}>${escapeHtml(t("settings.general.langFr"))}</option>
            <option value="fr-FR" ${ml === "fr-FR" ? "selected" : ""}>${escapeHtml(t("settings.general.langFrFR"))}</option>
            <option value="en" ${ml === "en" ? "selected" : ""}>${escapeHtml(t("settings.general.langEn"))}</option>
            <option value="en-US" ${ml === "en-US" ? "selected" : ""}>${escapeHtml(t("settings.general.langEnUS"))}</option>
            <option value="pt" ${ml === "pt" ? "selected" : ""}>${escapeHtml(t("settings.general.langPt"))}</option>
            <option value="pt-BR" ${ml === "pt-BR" ? "selected" : ""}>${escapeHtml(t("settings.general.langPtBR"))}</option>
            <option value="es" ${ml === "es" ? "selected" : ""}>${escapeHtml(t("settings.general.langEs"))}</option>
            <option value="de" ${ml === "de" ? "selected" : ""}>${escapeHtml(t("settings.general.langDe"))}</option>
            <option value="it" ${ml === "it" ? "selected" : ""}>${escapeHtml(t("settings.general.langIt"))}</option>
          </select>
        </div>
        <div class="settings-general-option">
          <label class="settings-checkbox settings-general-option__label">
            <input type="checkbox" id="prefs-address-book-global" ${globalBook ? "checked" : ""} />
            <span>${escapeHtml(t("settings.general.globalAddressBook"))}</span>
          </label>
          ${settingsExplainHtml(t("settings.general.globalAddressBookExplain"))}
        </div>
        <div class="settings-general-option">
          <label class="settings-checkbox settings-general-option__label">
            <input type="checkbox" id="prefs-activity-suggestions" ${activitySuggestions ? "checked" : ""} />
            <span>${escapeHtml(t("settings.general.activitySuggestions"))}</span>
          </label>
          ${settingsExplainHtml(t("settings.general.activitySuggestionsExplain"))}
        </div>
      </section>

      <hr class="settings-section-divider" />

      <section class="settings-general-section" aria-labelledby="settings-general-archive-heading">
        <h3 id="settings-general-archive-heading" class="thread-kicker settings-form-kicker">Archivage</h3>
        ${settingsExplainHtml("Hiérarchique : Archive/AAAA/MM-mois (locale app). Plat : dossier serveur (Gmail All Mail, Archive…).")}
        <div class="settings-form-row">
          <label class="compose-field-label" for="prefs-archive-layout">Mode</label>
          <select class="settings-ctl settings-ctl-select" id="prefs-archive-layout">
            <option value="hierarchical" ${(state.appPrefs.general.archiveLayout ?? "hierarchical") === "hierarchical" ? "selected" : ""}>Hiérarchique</option>
            <option value="flat" ${state.appPrefs.general.archiveLayout === "flat" ? "selected" : ""}>Plat (serveur)</option>
          </select>
        </div>
        <div class="settings-form-row">
          <label class="compose-field-label" for="prefs-archive-root">Racine IMAP</label>
          <input class="settings-ctl" id="prefs-archive-root" type="text" value="${escapeAttr(state.appPrefs.general.archiveRoot ?? "Archive")}" />
        </div>
      </section>

      <hr class="settings-section-divider" />

      <section class="settings-general-section" aria-labelledby="settings-general-startup-heading">
        <h3 id="settings-general-startup-heading" class="thread-kicker settings-form-kicker">Démarrage</h3>
        ${settingsExplainHtml(
          "Compte mail ouvert par défaut au lancement de RustyMail (utile si vous avez plusieurs comptes IMAP). « Premier compte » = le premier de la liste dans Paramètres → Comptes."
        )}
        <div class="settings-form-row">
          <label class="compose-field-label" for="prefs-default-account">Compte au démarrage</label>
          <select class="settings-ctl settings-ctl-select" id="prefs-default-account">${accountOptions}</select>
        </div>
      </section>

      <hr class="settings-section-divider" />

      <section class="settings-general-section" aria-labelledby="settings-general-inbox-heading">
        <h3 id="settings-general-inbox-heading" class="thread-kicker settings-form-kicker">Liste des mails</h3>
        ${settingsExplainHtml(
          "Filtre affiché par défaut à l’ouverture d’un dossier IMAP (puces Tout, Non lus, Suivis, Priorité, Auto)."
        )}
        <div class="settings-form-row">
          <label class="compose-field-label" for="prefs-default-list-filter">Vue principale par défaut</label>
          <select class="settings-ctl settings-ctl-select" id="prefs-default-list-filter">
            <option value="all" ${defaultLf === "all" ? "selected" : ""}>Tout</option>
            <option value="unread" ${defaultLf === "unread" ? "selected" : ""}>Non lus</option>
            <option value="starred" ${defaultLf === "starred" ? "selected" : ""}>Suivis (tous dossiers)</option>
            <option value="focused" ${defaultLf === "focused" ? "selected" : ""}>Priorité (hors expéditeurs auto)</option>
            <option value="auto" ${defaultLf === "auto" ? "selected" : ""}>Auto (newsletters / expéditeurs auto)</option>
          </select>
        </div>
      </section>

      <div class="settings-form-footer settings-general-footer">
        <button type="button" class="primary-button" data-action="save-general-prefs">${escapeHtml(t("common.save"))}</button>
      </div>
    </div>
  `);
}


type AddressBookRow = {
  accountId: string;
  email: string;
  displayName: string;
  messageCount: number;
  isFavorite: boolean;
  notes: string;
  source: string;
};

let addressBookRowsCache: AddressBookRow[] = [];

async function refreshAddressBookList(): Promise<void> {
  const acc = currentAccount();
  if (!acc?.id || !isTauriRuntime()) {
    addressBookRowsCache = [];
    return;
  }
  try {
    const res = await invoke<{ items: AddressBookRow[]; total: number }>("list_address_contacts_cmd", {
      accountId: acc.id,
      query: addressBookListQuery,
      offset: 0,
      limit: 80,
    });
    addressBookRowsCache = res?.items ?? [];
  } catch {
    addressBookRowsCache = [];
  }
}

function renderSettingsAddressBookPanel(): string {
  const acc = currentAccount();
  const rows = addressBookRowsCache;
  const editing = addressBookEditEmail;
  const editRow = editing ? rows.find((r) => r.email === editing) : undefined;
  return wrapSettingsPage(`
    <div class="settings-card settings-card--span settings-address-book surface-sm">
      <h3 class="thread-kicker">Carnet d’adresses</h3>
      ${settingsExplainHtml("Contacts issus des messages et entrées manuelles. Les favoris remontent en tête des suggestions @.")}
      ${
        !acc
          ? `<p class="dim">Sélectionnez un compte dans la barre latérale.</p>`
          : `
        <div class="settings-form-row" style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
          <input type="search" class="settings-ctl" id="address-book-search" placeholder="Rechercher…" value="${escapeAttr(addressBookListQuery)}" />
          <button type="button" class="ghost-button" data-action="address-book-refresh">Actualiser</button>
          <button type="button" class="ghost-button" data-action="reindex-address-book">Réindexer depuis les mails</button>
          <button type="button" class="ghost-button" data-action="address-book-export-vcard">Exporter vCard</button>
          <button type="button" class="ghost-button" data-action="address-book-import-vcard">Importer vCard</button>
        </div>
        <div class="address-book-table-wrap">
          <table class="address-book-table">
            <thead><tr><th></th><th>Nom</th><th>E-mail</th><th>Notes</th><th></th></tr></thead>
            <tbody>
              ${rows
                .map(
                  (r) => `
                <tr>
                  <td><button type="button" class="address-book-star${r.isFavorite ? " is-on" : ""}" data-action="address-book-toggle-fav" data-email="${escapeAttr(r.email)}" title="Favori">${r.isFavorite ? "★" : "☆"}</button></td>
                  <td>${escapeHtml(r.displayName || "—")}</td>
                  <td class="mono">${escapeHtml(r.email)}</td>
                  <td class="dim">${escapeHtml(r.notes || "")}</td>
                  <td>
                    <button type="button" class="ghost-button" data-action="address-book-edit" data-email="${escapeAttr(r.email)}">Modifier</button>
                    ${r.source === "manual" ? `<button type="button" class="ghost-button" data-action="address-book-delete" data-email="${escapeAttr(r.email)}">Supprimer</button>` : ""}
                  </td>
                </tr>`
                )
                .join("")}
            </tbody>
          </table>
        </div>
        <div class="settings-form-panel">
          <h4>${editing ? "Modifier le contact" : "Nouveau contact manuel"}</h4>
          <div class="settings-form-row"><label>E-mail</label><input class="settings-ctl" id="ab-edit-email" value="${escapeAttr(editRow?.email ?? "")}" ${editing ? "readonly" : ""} /></div>
          <div class="settings-form-row"><label>Nom affiché</label><input class="settings-ctl" id="ab-edit-name" value="${escapeAttr(editRow?.displayName ?? "")}" /></div>
          <div class="settings-form-row"><label>Notes</label><textarea class="settings-ctl" id="ab-edit-notes" rows="2">${escapeHtml(editRow?.notes ?? "")}</textarea></div>
          <label class="settings-checkbox"><input type="checkbox" id="ab-edit-fav" ${editRow?.isFavorite ? "checked" : ""} /> Favori</label>
          <div class="settings-form-footer">
            <button type="button" class="primary-button" data-action="address-book-save">${editing ? "Enregistrer" : "Ajouter"}</button>
            ${editing ? `<button type="button" class="ghost-button" data-action="address-book-cancel-edit">Annuler</button>` : ""}
          </div>
        </div>`
      }
    </div>`);
}

function buildSemanticStatsBlockHtml(): string {
  const accForStats = currentAccount();
  const mbNorm = (state.selectedMailbox || "INBOX").toLowerCase();
  const cnt = state.semanticEmbeddingCounts;
  const countsOk = Boolean(
    cnt &&
      accForStats &&
      cnt.accountId === accForStats.id &&
      cnt.mailbox.trim().toLowerCase() === mbNorm
  );
  const mailboxSide = escapeHtml(state.selectedMailbox || "INBOX");
  if (!isTauriRuntime()) {
    return `<p class="settings-explain settings-explain--lead" role="status">
        Compteurs d’embeddings SQLite : disponibles dans l’app desktop (Tauri).
      </p>`;
  }
  if (!accForStats) {
    return `<p class="settings-explain settings-explain--lead" role="status">
          Sélectionne un compte et une boîte dans la barre latérale pour afficher les compteurs d’indexation.
        </p>`;
  }
  if (!countsOk || !cnt) {
    return `<p class="settings-explain settings-explain--lead" role="status">
            Compteurs : chargement ou indisponible pour « ${mailboxSide} » — vérifie le compte actif puis <strong>Actualiser les compteurs</strong>.
          </p>`;
  }
  const c = cnt;
  return `<div class="settings-semantic-stats surface-sm" role="status" style="margin:0 0 14px;padding:12px 14px;border-radius:var(--radius-lg);font-size:13px;line-height:1.55">
            <strong>Index embeddings (${escapeHtml(c.modelId)})</strong>
            <ul style="margin:8px 0 0;padding-left:1.15em">
              <li>Boîte « <strong>${escapeHtml(c.mailbox)}</strong> » : <strong>${c.embeddingsInMailbox}</strong> message(s) avec embedding,
                <strong>${c.messagesInMailboxCached}</strong> message(s) en cache SQLite pour ce dossier.</li>
              <li>Ce compte (toutes boîtes déjà traitées cumulées) : <strong>${c.embeddingsTotalForAccount}</strong> embedding(s) stocké(s).</li>
            </ul>
            <p class="dim" style="margin:10px 0 0;font-size:12px;line-height:1.5">
              Bouton ci-dessous : indexation pour <strong>tout le compte</strong> parmi les messages déjà sync en base locale (INBOX, corbeille, envoyés…).
              Seuls les courriels présents dans SQLite sont traités ; un dossier encore vide après sync peut être complété après une nouvelle synchro.
            </p>
          </div>`;
}

function buildSettingsAiPanelDeps(): SettingsAiPanelDeps {
  return {
    ai: state.appPrefs.ai,
    escapeHtml,
    escapeAttr,
    iconSvg,
    settingsExplainHtml,
    formatWhisperPttKeyLabel,
    isTauri: isTauriRuntime(),
    semanticStatsBlock: buildSemanticStatsBlockHtml(),
    semOk: state.semanticModelAvailable,
    keyHint:
      state.openrouterApiKeySet || state.dictationApiKeySet
        ? "Clé cloud enregistrée dans le trousseau."
        : "Aucune clé cloud.",
    dictationApiKeySet: state.dictationApiKeySet,
    openrouterApiKeySet: state.openrouterApiKeySet,
    llamaServerApiKeySet: state.llamaServerApiKeySet,
    llmRuntimeStatus: state.llmRuntimeStatus,
    llmPrefetchPercent: state.llmPrefetchPercent,
    llmPrefetchInFlight: state.llmPrefetchInFlight,
    llmCachedGgufFilenames: state.llmCachedGgufFilenames,
    bootstrapModelsCompleted: Boolean(state.appPrefs.general.bootstrapModelsCompleted),
    engineSettingsTab: state.aiEngineSettingsTab,
  };
}

function renderSettingsAiPanel(): string {
  return wrapSettingsPage(`
    <div class="settings-card settings-card--span settings-ai">
      ${renderSettingsAiHub(buildSettingsAiPanelDeps())}
    </div>
  `);
}

function renderSettingsAiModal(): string {
  const modalId = state.settingsAiModal;
  if (!modalId) return "";
  const deps = buildSettingsAiPanelDeps();
  const title = settingsAiModalTitle(modalId);
  const mother = state.appPrefs.general.motherLanguage?.trim() || "fr";
  const bodyHtml = renderSettingsAiModalBodyWithPrompts(
    modalId,
    deps,
    state.promptCatalog,
    state.promptCatalogLoadError,
    mother,
  );
  return renderSettingsAiModalShell(modalId, title, bodyHtml, deps);
}

function renderSettingsAppearancePanel(): string {
  const ai = state.appPrefs.ai;
  return wrapSettingsPage(`
    <div class="settings-card settings-appearance surface-sm">
      <h2 class="thread-kicker settings-form-kicker" style="margin:0 0 10px">Apparence</h2>
      ${settingsExplainHtml(
        "Réglages visuels de l’application (indépendants de la configuration LLM). Pour l’instant : largeur du panneau droit <strong>Détails</strong> / <strong>Brief d’action</strong> (variable CSS <code>--ai-width</code>)."
      )}
      <div class="settings-form-row">
        <label class="compose-field-label" for="prefs-ai-panel-width">Largeur panneau droit (px)</label>
        <input class="settings-ctl" type="number" id="prefs-ai-panel-width" min="260" max="640" step="10" value="${escapeAttr(String(ai.aiPanelWidthPx))}" autocomplete="off" />
      </div>
      <div class="settings-form-footer" style="margin-top:16px;padding-top:14px;border-top:1px solid var(--border-weak)">
        <button type="button" class="primary-button" data-action="save-ai-prefs">Enregistrer l’apparence</button>
      </div>
    </div>
  `);
}

function renderSettingsAutoSendersPanel(): string {
  const rows = state.newsletterRules
    .map((r) => {
      const label = formatNewsletterRuleInput(r);
      return `
      <div class="settings-newsletter-row surface-sm">
        <code class="settings-newsletter-domain">${escapeHtml(label)}</code>
        <button type="button" class="ghost-button settings-newsletter-remove" data-action="newsletter-domain-remove" data-rule="${escapeAttr(label)}">Supprimer</button>
      </div>`;
    })
    .join("");
  return wrapSettingsPage(`
    <div class="settings-card settings-card--span settings-newsletters surface-sm">
      <h2 class="thread-kicker settings-form-kicker" style="margin:0 0 10px">Expéditeurs automatiques</h2>
      ${settingsExplainHtml(
        "Messages type <strong>noreply</strong>, confirmations, envois marketing ou ESP (<code>*.mailchimp.com</code>, etc.) : définissez ici qui est traité comme <strong>expéditeur automatique</strong>. Une règle peut être un domaine entier (<code>*.exemple.com</code>), ou une adresse précise (<code>order-update@amazon.fr</code>) pour laisser passer le SAV sur le même domaine. Les actions <strong>Répondre</strong> et <strong>Répondre à tous</strong> sont masquées quand le dernier message entrant correspond à une règle."
      )}
      <div class="settings-form-panel settings-newsletter-add">
        <div class="settings-form-row settings-newsletter-add-row">
          <label class="compose-field-label" for="newsletter-domain-input">Règle</label>
          <input class="settings-ctl" type="text" id="newsletter-domain-input" placeholder="noreply@banque.fr · *.sendgrid.net · substack.com" autocomplete="off" autocapitalize="off" spellcheck="false" />
          <button type="button" class="primary-button" data-action="newsletter-domain-add">Ajouter</button>
        </div>
      </div>
      <div class="settings-newsletter-list" aria-label="Règles expéditeurs automatiques">
        ${rows || `<p class="dim settings-account-list-empty">Aucune règle affichée (exemples par défaut en base au premier lancement Tauri).</p>`}
      </div>
    </div>
  `);
}

function renderSettingsAccountsPanel(): string {
  const persisted = settingsDraftProfile();
  const isNew = state.settingsSelectedAccountId === "new";
  const merged = mergedProfileForAccountsForm();
  const scratch = state.accountFormOAuthPrefill ?? accountsFormIdentityScratch;
  const authKindEffective: MailAuthKind = isNew ? state.accountFormAuthKind : (persisted?.authKind ?? "password");
  const wizardBusy = isNew && state.accountOAuthWizardPhase != null && state.accountOAuthWizardPhase !== "error";
  const showOAuthWizardLanding =
    isNew &&
    !state.accountPasswordSetupExpanded &&
    authKindEffective === "password" &&
    !state.oauthLockedEmail &&
    state.accountOAuthWizardPhase == null;
  const hint =
    wizardBusy ?
      "Configuration automatique du compte en cours…"
    : showOAuthWizardLanding ?
      "Choisissez <strong>Google</strong> ou <strong>Microsoft</strong> — le reste est automatique."
    : isNew && state.accountPasswordSetupExpanded ?
      "Compte IMAP classique : e-mail, mot de passe, puis <strong>Enregistrer</strong>."
    : isNew ?
      ""
    : `Modification du compte <strong>${escapeHtml(persisted?.email ?? "")}</strong> — vous pouvez mettre à jour les serveurs sans changer le mot de passe.`;

  const listRows = state.accounts
    .map(
      (a) => `
        <button type="button" class="settings-account-row ${a.id === state.settingsSelectedAccountId ? "settings-account-row--active" : ""}"
          data-action="settings-select-account" data-account-id="${escapeAttr(a.id)}">
          <span class="settings-account-row-main">${escapeHtml(a.displayName || a.email)}</span>
          <span class="settings-account-row-sub dim">${escapeHtml(a.email)}</span>
        </button>`
    )
    .join("");

  return wrapSettingsPage(`
    <div class="settings-card settings-card--span settings-accounts-grid">
      <aside class="settings-account-list" aria-label="Comptes configurés">
        <div class="settings-account-list-title dim">Mes comptes</div>
        ${listRows || `<p class="dim settings-account-list-empty">Aucun compte — ajoutez-en un.</p>`}
        <button type="button" class="ghost-button settings-add-account" data-action="settings-new-account">+ Ajouter un compte</button>
      </aside>
      <div class="settings-account-editor">
        ${hint ? settingsExplainHtml(hint) : ""}
        ${renderAccountFormMarkup(merged, {
          statusFallbackText:
            "Le mot de passe est conservé dans le trousseau du système uniquement · les serveurs sont enregistrés en local (SQLite).",
          accountMessage: state.accountMessage,
          isNewAccount: isNew,
          serversPanelOpen: !isNew || state.accountServersPanelOpen,
          identityScratch: scratch,
          persistedAccount: persisted,
          authKindEffective,
          showOAuthConnect: false,
          oauthLockedEmail: state.oauthLockedEmail,
          showOAuthWizardLanding: Boolean(isTauriRuntime() && showOAuthWizardLanding),
          oauthWizardPhase: state.accountOAuthWizardPhase,
          oauthWizardMessage: state.accountOAuthWizardMessage,
          oauthWizardError: state.accountOAuthWizardError,
          oauthGoogleConfigured: state.oauthGoogleConfigured,
          oauthMicrosoftConfigured: state.oauthMicrosoftConfigured,
        })}
      </div>
    </div>
  `);
}

type ShortcutRow = {
  keys: string;
  summary: string;
  detail?: string;
  scope?: string;
};

function renderSettingsShortcutsPanel(): string {
  const mod = navigator.platform.toLowerCase().includes("mac") ? "⌘" : "Ctrl";
  const rows: ShortcutRow[] = [
    { keys: `${mod}+T`, summary: "Recherche globale", detail: "Ouvre la modale de recherche (partout dans l’app). Reappuyer pour fermer.", scope: "Global" },
    {
      keys: `${mod}+F5`,
      summary: "Synchroniser IMAP",
      detail: "Relance la synchronisation du dossier courant (ou des dossiers principaux). F5 seul recharge l’application.",
      scope: "Global",
    },
    { keys: "Échap", summary: "Fermer / retour", detail: "Ferme la modale de recherche, les dialogues, le panneau IA, puis navigation arrière.", scope: "Global" },
    { keys: "/", summary: "Focus recherche", detail: "Affiche la liste et focus la barre de recherche ; ouvre la modale si la barre est absente.", scope: "Global" },
    { keys: "n", summary: "Nouveau message", detail: "Ouvre le compositeur (sans Ctrl — ne pas confondre avec Ctrl+C copier).", scope: "Hors champ texte" },
    { keys: "r", summary: "Répondre", detail: "Répondre au fil ouvert.", scope: "Fil" },
    { keys: "s", summary: "Résumer le fil", detail: "Synthèse IA du fil courant.", scope: "Fil" },
    { keys: "t", summary: "Traduire le fil", detail: "Traduction IA (sans Ctrl — ne pas confondre avec Ctrl+T).", scope: "Fil" },
    { keys: "Tab", summary: "Panneau IA", detail: "Affiche ou masque le panneau latéral IA.", scope: "Fil" },
    { keys: "m", summary: "Aperçu compositeur", detail: "Bascule l’aperçu HTML en rédaction.", scope: "Compositeur" },
    { keys: "Entrée", summary: "Valider la recherche", detail: "Applique critères @, #, texte. Depuis la modale : retour à la liste avec résultats.", scope: "Recherche" },
    { keys: "Tab", summary: "Autocomplétion recherche", detail: "Insère la suggestion @contact ou #dossier / #tag (sans lancer la recherche).", scope: "Recherche" },
    { keys: "Boutons 4 / 5", summary: "Navigation souris", detail: "Précédent / suivant (comme le navigateur), si aucune modale ouverte.", scope: "Global" },
  ];
  const tableRows = rows
    .map(
      (r) => `
        <tr>
          <td class="shortcuts-table__keys"><kbd>${escapeHtml(r.keys)}</kbd></td>
          <td><strong>${escapeHtml(r.summary)}</strong>${r.detail ? `<br><span class="dim">${escapeHtml(r.detail)}</span>` : ""}</td>
          <td class="dim shortcuts-table__scope">${escapeHtml(r.scope ?? "")}</td>
        </tr>`
    )
    .join("");
  return wrapSettingsPage(`
    <article class="settings-card settings-card--span surface-sm">
      <h3 class="thread-kicker">Raccourcis clavier</h3>
      ${settingsExplainHtml("Raccourcis actifs dans l’interface principale. Dans un champ de saisie (ou zone éditable), seuls Échap, Ctrl+T (recherche) et Ctrl+F5 (sync IMAP) s’appliquent. Les raccourcis à une touche ignorent Ctrl, Alt et Cmd (copier, coller, etc.). F5 seul recharge l’application.")}
      <div class="shortcuts-table-wrap">
        <table class="shortcuts-table">
          <thead>
            <tr><th scope="col">Raccourci</th><th scope="col">Action</th><th scope="col">Contexte</th></tr>
          </thead>
          <tbody>${tableRows}</tbody>
        </table>
      </div>
    </article>
  `);
}

function renderSettingsStoragePanel(): string {
  if (!isTauriRuntime()) {
    return wrapSettingsPage(
      `<article class="settings-card surface-sm"><p class="dim" style="margin:0">Chemins disque : disponibles dans l’application bureau Tauri.</p></article>`
    );
  }
  if (state.settingsPathsLoadError && !state.lastAppPaths) {
    return wrapSettingsPage(`<article class="settings-card surface-sm">
      <p style="margin:0">${escapeHtml(state.settingsPathsLoadError)}</p>
      <button type="button" class="ghost-button settings-storage-refresh" data-action="settings-reload-paths">Recharger les chemins</button>
    </article>`);
  }
  const p = state.lastAppPaths;
  if (!p) {
    return wrapSettingsPage(`<article class="settings-card surface-sm">
      <p class="dim" style="margin:0">Chargement des chemins…</p>
      <button type="button" class="ghost-button settings-storage-refresh" data-action="settings-reload-paths">Rafraîchir</button>
    </article>`);
  }
  const sections: Array<{ heading: string; hint: string; rows: Array<[string, string]> }> = [
    {
      heading: "Courrier & cache local",
      hint: "Messages synchronisés, fils de discussion, pièces jointes indexées.",
      rows: [["Base SQLite", p.dbPath]],
    },
    {
      heading: "Configuration application",
      hint: "Préférences UI, comptes, options IA (hors trousseau).",
      rows: [["Fichier JSON des préférences", p.prefsPath]],
    },
    {
      heading: "Modèles IA sur disque",
      hint: "Téléchargements locaux pour la recherche sémantique et llama-server.",
      rows: [
        ["Embeddings sémantiques (MiniLM ONNX)", p.modelsDir],
        ["Cache modèles LLM (fichiers GGUF)", p.llmModelsDir],
      ],
    },
  ];
  return wrapSettingsPage(`<article class="settings-card settings-card--span surface-sm settings-storage-panel">
    <header class="settings-storage-head">
      <h3 class="thread-kicker settings-form-kicker settings-card__title">Chemins disque</h3>
      <p class="dim settings-card__lead">Emplacements renvoyés par la commande Tauri <code>app_paths</code> (dossier de données de l’app).</p>
      <button type="button" class="ghost-button settings-storage-refresh" data-action="settings-reload-paths">Rafraîchir</button>
    </header>
    ${sections
      .map(
        (sec) => `
    <section class="settings-storage-section" aria-label="${escapeAttr(sec.heading)}">
      <h4 class="settings-storage-section__title">${escapeHtml(sec.heading)}</h4>
      <p class="dim settings-storage-section__hint">${escapeHtml(sec.hint)}</p>
      <div class="settings-storage-paths">
        ${sec.rows
          .map(
            ([label, path]) => `
        <div class="settings-storage-path">
          <div class="settings-storage-path__label">${escapeHtml(label)}</div>
          <code class="settings-path-code">${escapeHtml(path)}</code>
        </div>`
          )
          .join("")}
      </div>
    </section>`
      )
      .join('<hr class="settings-section-divider settings-storage-section-divider" />')}
  </article>`);
}

function renderSettingsDeveloperPanel(): string {
  return wrapSettingsPage(
    `
    <article class="settings-card surface-sm" aria-labelledby="settings-dev-stack-heading">
      <h3 id="settings-dev-stack-heading" class="thread-kicker settings-form-kicker settings-card__title">Pile technique</h3>
      <p class="dim settings-card__lead">Aperçu pour développeurs du client mail RustyMail.</p>
      <ul class="settings-card__list">
        <li><strong>Shell</strong> — Tauri 2, Rust (<code>crates/rustymail-*</code>, binaire <code>src-tauri</code>)</li>
        <li><strong>UI</strong> — Vite, TypeScript, CSS (<code>dompurify</code> pour HTML mail)</li>
        <li><strong>Données</strong> — SQLite + WAL (<code>rusqlite</code>), JSON prefs, trousseau OS</li>
        <li><strong>Mail</strong> — IMAP (<code>async-imap</code>), SMTP (<code>lettre</code>), pièces jointes</li>
        <li><strong>Recherche</strong> — lexical + mode hybrid / sémantique (<code>rustymail-semantic</code>, ONNX MiniLM)</li>
        <li><strong>IA</strong> — OpenRouter ou serveur compatible OpenAI, llama-server, dictée Whisper</li>
      </ul>
      <p class="dim" style="margin:12px 0 0;font-size:12px;line-height:1.5">Détails : <code>README.md</code> et <code>docs/</code>.</p>
    </article>
    <article class="settings-card surface-sm" aria-labelledby="settings-dev-demo-heading">
      <h3 id="settings-dev-demo-heading" class="thread-kicker settings-form-kicker settings-card__title">Données démo (pro fictif)</h3>
      <p class="dim settings-card__lead">
        <strong>Essayer</strong> — crée ou réinitialise <code>playground@demo.rustymail.app</code> (conversations pro en local, IMAP factice) pour tester le <strong>Brief d’action</strong>.
      </p>
      <p class="dim" style="margin:0 0 4px;font-size:13px;line-height:1.55">
        <strong>Passer à un vrai compte</strong> — supprimez la démo puis ajoutez un compte IMAP dans <strong>Paramètres → Comptes</strong>.
      </p>
      <div class="settings-card__actions">
        <button type="button" class="primary-button" data-action="demo-reset-playground">Réinitialiser la boîte démo pro</button>
        <button type="button" class="ghost-button btn-danger-soft" data-action="demo-remove-playground">Supprimer la boîte démo</button>
      </div>
    </article>
  `,
    2
  );
}

function renderSettings() {
  const tabAccounts = state.settingsTab === "accounts";
  const tabGeneral = state.settingsTab === "general";
  const tabAppearance = state.settingsTab === "appearance";
  const tabAutoSenders = state.settingsTab === "autoSenders";
  const tabAi = state.settingsTab === "ai";
  const tabAddressBook = state.settingsTab === "addressBook";
  const tabStorage = state.settingsTab === "storage";
  const tabShortcuts = state.settingsTab === "shortcuts";
  const tabDeveloper = state.settingsTab === "developer";
  let settingsBody = "";
  switch (state.settingsTab) {
    case "accounts":
      settingsBody = renderSettingsAccountsPanel();
      break;
    case "general":
      settingsBody = renderSettingsGeneralPanel();
      break;
    case "appearance":
      settingsBody = renderSettingsAppearancePanel();
      break;
    case "autoSenders":
      settingsBody = renderSettingsAutoSendersPanel();
      break;
    case "ai":
      settingsBody = renderSettingsAiPanel();
      break;
    case "addressBook":
      settingsBody = renderSettingsAddressBookPanel();
      break;
    case "storage":
      settingsBody = renderSettingsStoragePanel();
      break;
    case "shortcuts":
      settingsBody = renderSettingsShortcutsPanel();
      break;
    case "developer":
      settingsBody = renderSettingsDeveloperPanel();
      break;
    default:
      settingsBody = renderSettingsAccountsPanel();
  }
  return `
    <section class="settings-root compose-view thread-view thread-reading" aria-label="${escapeAttr(t("settings.title"))}">
      <header class="thread-reading-head" aria-label="${escapeAttr(t("settings.title"))}">
        ${renderViewNavTrail()}
        <div class="thread-reading-hero">
          <h1 class="thread-reading-title">${escapeHtml(t("settings.title"))}</h1>
        </div>
      </header>
      <div class="settings-tabbar" role="tablist" aria-label="${escapeAttr(t("settings.sectionsAria"))}">
        <button type="button" role="tab" class="settings-tab ${tabAccounts ? "settings-tab--active" : ""}"
          data-action="settings-tab" data-settings-tab="accounts" aria-selected="${tabAccounts}">${escapeHtml(t("settings.tabs.accounts"))}</button>
        <button type="button" role="tab" class="settings-tab ${tabGeneral ? "settings-tab--active" : ""}"
          data-action="settings-tab" data-settings-tab="general" aria-selected="${tabGeneral}">${escapeHtml(t("settings.tabs.general"))}</button>
        <button type="button" role="tab" class="settings-tab ${tabAppearance ? "settings-tab--active" : ""}"
          data-action="settings-tab" data-settings-tab="appearance" aria-selected="${tabAppearance}">${escapeHtml(t("settings.tabs.appearance"))}</button>
        <button type="button" role="tab" class="settings-tab ${tabAutoSenders ? "settings-tab--active" : ""}"
          data-action="settings-tab" data-settings-tab="autoSenders" aria-selected="${tabAutoSenders}"
          title="noreply, notifications, newsletters, ESP…">${escapeHtml(t("settings.tabs.autoSenders"))}</button>
        <button type="button" role="tab" class="settings-tab ${tabAi ? "settings-tab--active" : ""}"
          data-action="settings-tab" data-settings-tab="ai" aria-selected="${tabAi}">${escapeHtml(t("settings.tabs.ai"))}</button>
        <button type="button" role="tab" class="settings-tab ${tabAddressBook ? "settings-tab--active" : ""}"
          data-action="settings-tab" data-settings-tab="addressBook" aria-selected="${tabAddressBook}">${escapeHtml(t("settings.tabs.addressBook"))}</button>
        <button type="button" role="tab" class="settings-tab ${tabStorage ? "settings-tab--active" : ""}"
          data-action="settings-tab" data-settings-tab="storage" aria-selected="${tabStorage}"
          title="SQLite, JSON, modèles…">${escapeHtml(t("settings.tabs.storage"))}</button>
        <button type="button" role="tab" class="settings-tab ${tabShortcuts ? "settings-tab--active" : ""}"
          data-action="settings-tab" data-settings-tab="shortcuts" aria-selected="${tabShortcuts}"
          title="Raccourcis clavier">${escapeHtml(t("settings.tabs.shortcuts"))}</button>
        <button type="button" role="tab" class="settings-tab ${tabDeveloper ? "settings-tab--active" : ""}"
          data-action="settings-tab" data-settings-tab="developer" aria-selected="${tabDeveloper}"
          title="Dépôt, crates, libs">${escapeHtml(t("settings.tabs.developer"))}</button>
      </div>
      <div class="settings-body">
        ${settingsBody}
      </div>
    </section>
  `;
}

function threadIdsMatch(a: string | null | undefined, b: string | null | undefined): boolean {
  const x = a == null ? "" : String(a).trim();
  const y = b == null ? "" : String(b).trim();
  return Boolean(x && y && x === y);
}

function clearThreadAiSummaryState(): void {
  state.aiOutput = "";
  state.aiThreadScope = null;
  state.quickReplySuggestions = [];
  state.agentSession = null;
  state.threadQaAnswer = null;
  state.threadQaStreamText = "";
}

/** Résumé / traduction fil encore valides pour ce fil en lecture. */
function threadAiSummaryLiveFor(threadId: string): boolean {
  const tid = String(threadId).trim();
  return (
    state.view === "thread" &&
    Boolean(tid) &&
    threadIdsMatch(state.selectedThreadId, tid) &&
    threadIdsMatch(state.aiThreadScope, tid)
  );
}

function applyThreadAiOutputIfLive(threadId: string, text: string): boolean {
  if (!threadAiSummaryLiveFor(threadId)) return false;
  state.aiOutput = text;
  return true;
}

let aiStreamPaintRaf = 0;
let aiStreamPaintFn: (() => void) | null = null;

/** Met à jour le texte streamé sans `render()` complet (évite le clignotement). */
function scheduleAiStreamDomPaint(paint: () => void): void {
  aiStreamPaintFn = paint;
  if (aiStreamPaintRaf) return;
  aiStreamPaintRaf = window.requestAnimationFrame(() => {
    aiStreamPaintRaf = 0;
    aiStreamPaintFn?.();
    aiStreamPaintFn = null;
  });
}

function paintThreadAiSummaryDom(text: string): void {
  scheduleAiStreamDomPaint(() => {
    const trimmed = text.trim();
    if (!trimmed) return;
    const html = zenSummaryHtmlFragments(trimmed);
    document.querySelectorAll<HTMLElement>(".thread-reading .thread-zen .thread-zen-body").forEach((el) => {
      el.classList.add("is-ai-streaming");
      if (el.innerHTML !== html) el.innerHTML = html;
    });
    document.querySelectorAll<HTMLElement>(".ai-thread-summary__body").forEach((el) => {
      el.classList.add("is-ai-streaming");
      if (el.innerHTML !== html) el.innerHTML = html;
    });
  });
}

function paintThreadQaStreamDom(text: string): void {
  scheduleAiStreamDomPaint(() => {
    const el = document.querySelector<HTMLElement>(".ai-qa-answer--stream .ai-qa-answer__text");
    if (!el) return;
    const html = formatPlainTextWithLinks(text);
    if (el.innerHTML !== html) el.innerHTML = html;
  });
}

function paintAgentDraftDom(text: string): void {
  const ta = document.querySelector<HTMLTextAreaElement>("#agent-draft-text");
  if (!ta) {
    render();
    return;
  }
  scheduleAiStreamDomPaint(() => {
    if (ta.value !== text) ta.value = text;
  });
}

function threadAiSummaryScoped(): boolean {
  return Boolean(state.aiOutput?.trim() && state.aiThreadScope);
}

function threadAiSummaryForCurrentThread(): boolean {
  return threadAiSummaryScoped() && threadAiSummaryLiveFor(String(state.aiThreadScope));
}

/** Résumé fil dans la colonne lecture (pas le panneau Détails). */
function threadAiSummaryShownInZen(): boolean {
  return state.view === "thread" && Boolean(state.selectedThread) && threadAiSummaryForCurrentThread();
}

function renderThreadQaBlockHtml(): string {
  if (!isAiFeatureEnabled(state.appPrefs.ai, "featureThreadQaEnabled")) return "";
  const dictationMic =
    isTauriRuntime() && state.appPrefs.ai.dictationEnabled
      ? `<div class="ai-qa-mic-cluster compose-mic-cluster" title="${escapeAttr(threadQaMicButtonTitle())}">
          <button
            class="mic-button ${state.micState}"
            type="button"
            data-action="mic-thread-qa"
            aria-label="${escapeAttr(micAriaLabel("thread-qa"))}"
            aria-pressed="${state.micState === "recording"}"
          >
            <span class="mic-button__ico" aria-hidden="true">${iconSvg("mic")}</span>
          </button>
        </div>`
      : "";
  return `<div class="ai-qa-block surface-sm">
        <p class="dim ai-qa-block__title">Questions sur le fil</p>
        <label class="dim ai-qa-block__label" for="thread-qa-input">Votre question</label>
        <div class="ai-qa-input-row">
          <textarea id="thread-qa-input" class="settings-ctl ai-qa-input" rows="2" placeholder="Ex. Quelles dates ont été proposées ? (dictée possible)">${escapeHtml(state.threadQaDraft)}</textarea>
          ${dictationMic}
        </div>
        <div class="ai-qa-block__actions">
          <button type="button" class="ghost-button ghost-button-sm" data-action="llm-qa-thread">Poser la question</button>
          ${
            state.threadQaAnswer || state.threadQaStreamText
              ? `<button type="button" class="ghost-button ghost-button-sm" data-action="llm-qa-clear">Effacer</button>`
              : ""
          }
        </div>
        ${
          state.threadQaStreamText.trim()
            ? `<div class="ai-qa-answer ai-qa-answer--stream"><p class="ai-qa-answer__text">${formatPlainTextWithLinks(state.threadQaStreamText)}</p></div>`
            : ""
        }
        ${
          state.threadQaAnswer
            ? `<div class="ai-qa-answer">
          <p class="ai-qa-answer__text">${formatPlainTextWithLinks(state.threadQaAnswer.answer)}</p>
          ${
            state.threadQaAnswer.evidenceMessageIds.length
              ? `<p class="dim ai-qa-block__evidence-label">Messages sources</p>
          <div class="ai-qa-evidence">${state.threadQaAnswer.evidenceMessageIds
            .map(
              (mid) =>
                `<button type="button" class="ghost-button ghost-button-sm ai-qa-evidence__btn" data-action="qa-open-message" data-msg-id="${escapeAttr(mid)}">${escapeHtml(mid.slice(0, 24))}${mid.length > 24 ? "…" : ""}</button>`
            )
            .join("")}</div>`
              : ""
          }
        </div>`
            : ""
        }
      </div>`;
}

function renderThreadSummaryPanelHtml(): string {
  /** Même contenu que `thread-zen` dans la colonne fil — ne pas dupliquer dans Détails. */
  if (threadAiSummaryShownInZen()) return "";
  if (!threadAiSummaryForCurrentThread()) return "";
  const tid = String(state.aiThreadScope);
  const row = state.threads.find((t) => String(t.id) === tid);
  const subject = state.selectedThread?.subject || row?.subject || "Fil";
  return `
    <div class="ai-thread-summary surface-sm" aria-label="Synthèse du fil">
      <div class="ai-thread-summary__head">
        <span class="thread-kicker thread-kicker-strong">Résumé</span>
      </div>
      <p class="dim ai-thread-summary__subject">${escapeHtml(subject)}</p>
      <div class="thread-zen-body ai-thread-summary__body">${zenSummaryHtmlFragments(state.aiOutput!.trim())}</div>
    </div>`;
}

function openSettingsView() {
  beginNavigation("settings", { resetStack: true });
  state.view = "settings";
  state.aiOpen = false;
  clearThreadAiSummaryState();
  state.settingsTab = "accounts";
  clearDiscoveredServerSnap();
  state.settingsSelectedAccountId =
    state.selectedAccountId && state.accounts.some((a) => a.id === state.selectedAccountId)
      ? state.selectedAccountId
      : (state.accounts[0]?.id ?? "new");
  accountFieldTouched.serverFields = false;
  state.accountServersPanelOpen = state.settingsSelectedAccountId !== "new";
  render();
}

function agentOfferSlotsStep(session: NonNullable<typeof state.agentSession>): boolean {
  return session.plan?.offerSlotStep ?? session.offerSlotsStep;
}

function agentPrepareReplyStepCount(session: NonNullable<typeof state.agentSession>): number {
  const planned = session.plan?.steps.length;
  if (planned && planned > 0) {
    return planned + (session.plan?.needsClarification ? 1 : 0);
  }
  if (session.assistMode === "quick") return agentOfferSlotsStep(session) ? 2 : 1;
  return agentOfferSlotsStep(session) ? 5 : 4;
}

function agentStepProgressLabel(session: NonNullable<typeof state.agentSession>): string {
  const n = agentPrepareReplyStepCount(session);
  const order = ["analyzeIntent", "extractFacts", "clarification", "draftReply", "suggestSlots"];
  const idx = Math.max(0, order.indexOf(session.step));
  return `${idx + 1}/${n} · ${assistStepLabel(session.step)}`;
}

function agentAssistBasePayload(): ReturnType<typeof buildAssistPayload> | null {
  const s = state.agentSession;
  const tid = state.selectedThreadId?.trim();
  const accountId = currentAccount()?.id?.trim();
  if (!tid || !accountId) return null;
  const mode = s?.assistMode ?? "deep";
  const skills = s?.enabledSkills?.length ? s.enabledSkills : defaultEnabledSkillIds(mode);
  return buildAssistPayload(tid, accountId, mode, skills);
}

function agentSkillEnabled(skill: AssistSkillId): boolean {
  const s = state.agentSession;
  if (!s) return false;
  const skills = s.enabledSkills.length ? s.enabledSkills : defaultEnabledSkillIds(s.assistMode);
  return skills.includes(skill);
}

function pushAgentTelemetry(step: AssistRunStep): void {
  const s = state.agentSession;
  if (!s) return;
  const idx = s.telemetry.findIndex((t) => t.skill === step.skill && t.status === "running");
  if (idx >= 0) s.telemetry[idx] = step;
  else s.telemetry.push(step);
}

async function stopAgentTelemetry(): Promise<void> {
  const s = state.agentSession;
  if (s?.unlistenTelemetry) {
    s.unlistenTelemetry();
    s.unlistenTelemetry = undefined;
  }
}

function renderAgentTelemetryHtml(session: NonNullable<typeof state.agentSession>): string {
  if (!session.telemetry.length) return "";
  const rows = session.telemetry
    .map((t) => {
      const label = assistSkillLabel(t.skill);
      const lat = t.latencyMs > 0 ? `${t.latencyMs} ms` : "—";
      const status =
        t.status === "ok"
          ? "OK"
          : t.status === "skipped"
            ? "Ignoré"
            : t.status === "blocked"
              ? "Bloqué"
              : t.status === "error"
              ? "Erreur"
              : t.status;
      const detail = t.message ? `<span class="dim"> · ${escapeHtml(t.message)}</span>` : "";
      return `<li><span>${escapeHtml(label)}</span><span class="dim">${escapeHtml(status)} · ${lat}</span>${detail}</li>`;
    })
    .join("");
  return `<details class="agent-panel__telemetry" open><summary>Exécution</summary><ul>${rows}</ul></details>`;
}

function renderAgentPrepareReplyPanelHtml(): string {
  const s = state.agentSession;
  if (!s || !threadIdsMatch(s.threadId, state.selectedThreadId)) return "";
  const stepLabel = agentStepProgressLabel(s);
  const modeSelect = `
    <label class="agent-panel__mode dim">
      Mode
      <select class="settings-ctl" data-action="agent-set-mode" ${s.busy ? "disabled" : ""}>
        <option value="quick" ${s.assistMode === "quick" ? "selected" : ""}>${escapeHtml(assistModeLabel("quick"))}</option>
        <option value="deep" ${s.assistMode === "deep" ? "selected" : ""}>${escapeHtml(assistModeLabel("deep"))}</option>
        <option value="strictSafe" ${s.assistMode === "strictSafe" ? "selected" : ""}>${escapeHtml(assistModeLabel("strictSafe"))}</option>
      </select>
    </label>`;
  const intentBlock = s.intent
    ? `<p class="agent-panel__intent">${escapeHtml(s.intent.intent)}</p><p class="dim">Ton : ${escapeHtml(s.intent.toneHint)}</p>`
    : "";
  const factsBlock =
    s.facts?.facts?.length ?
      `<ul class="agent-panel__facts">${s.facts.facts
        .slice(0, 8)
        .map((f) => `<li><span class="dim">${escapeHtml(f.kind)}</span> ${escapeHtml(f.text)}</li>`)
        .join("")}</ul>`
    : "";
  const clarificationBlock =
    s.step === "clarification" && s.clarificationQuestions.length ?
      `<div class="agent-panel__clarification"><p><strong>Précisions utiles</strong></p><ul>${s.clarificationQuestions
        .map((q) => `<li>${escapeHtml(q)}</li>`)
        .join("")}</ul></div>`
    : "";
  const safetyBlock =
    s.safetyFlags.length || s.consistencyIssues.length ?
      `<div class="agent-panel__warnings">${[
        ...s.consistencyIssues.map((i) => `<p class="agent-warn">⚠ ${escapeHtml(i)}</p>`),
        ...s.safetyFlags.map((f) => `<p class="agent-warn dim">${escapeHtml(assistSafetyFlagLabel(f))}</p>`),
      ].join("")}</div>`
    : "";
  const draftBlock =
    (s.step === "draftReply" || s.draft.trim()) && (s.draft.trim() || s.busy) ?
      `<textarea class="settings-ctl agent-panel__draft" id="agent-draft-text" rows="6" ${s.busy ? 'aria-busy="true"' : ""}>${escapeHtml(s.draft)}</textarea>`
    : "";
  const actionsBlock =
    s.recommendations.filter((r) => r.kind === "action").length ?
      `<div class="agent-panel__actions-list"><p class="dim"><strong>Actions</strong></p><ul>${s.recommendations
        .filter((r) => r.kind === "action")
        .map(
          (r) =>
            `<li>${escapeHtml(r.label)}${r.detail ? `<span class="dim"> · ${escapeHtml(r.detail)}</span>` : ""}</li>`,
        )
        .join("")}</ul></div>`
    : "";
  const slotsBlock =
    s.slots.length ?
      `<ul class="agent-panel__slots">${s.slots.map((sl) => `<li><button type="button" class="ghost-button" data-action="agent-append-slot" data-slot="${escapeAttr(sl)}">${escapeHtml(sl)}</button></li>`).join("")}</ul>`
    : "";
  const skillToggles = getAssistSkillUi().map((sk) => {
    const on = agentSkillEnabled(sk.id);
    const dis = s.busy || sk.id === "analyzeIntent" || sk.id === "draftReply";
    return `<label class="agent-skill-toggle"><input type="checkbox" data-action="agent-toggle-skill" data-skill="${sk.id}" ${on ? "checked" : ""} ${dis ? "disabled" : ""}/> ${escapeHtml(sk.label)}</label>`;
  }).join("");
  const skillsBlock = `<details class="agent-panel__skills"><summary>Skills</summary><div class="agent-skill-toggles">${skillToggles}</div></details>`;
  return `
    <div class="agent-panel surface-sm">
      <div class="agent-panel__head">
        <strong>Assistant réponse</strong>
        <span class="dim">${stepLabel}</span>
        ${modeSelect}
      </div>
      ${s.busy ? `<p class="dim">Génération…</p>` : ""}
      ${s.step === "analyzeIntent" ? intentBlock : ""}
      ${skillsBlock}
      ${factsBlock}
      ${actionsBlock}
      ${clarificationBlock}
      ${safetyBlock}
      ${draftBlock}
      ${s.step === "suggestSlots" ? slotsBlock : ""}
      ${renderAgentTelemetryHtml(s)}
      <div class="agent-panel__actions">
        <button type="button" class="ghost-button" data-action="agent-prepare-cancel">Annuler</button>
        ${
          s.step === "draftReply" && s.draft.trim()
            ? `<button type="button" class="ghost-button" data-action="agent-insert-compose">Insérer dans compose</button>`
            : ""
        }
        ${
          s.step !== "suggestSlots" &&
          !s.busy &&
          (s.step === "clarification" || s.step !== "draftReply" || agentOfferSlotsStep(s))
            ? `<button type="button" class="primary-button" data-action="agent-prepare-continue">${
                s.step === "clarification"
                  ? "Générer le brouillon quand même"
                  : s.step === "draftReply"
                    ? "Créneaux alternatifs"
                    : "Continuer"
              }</button>`
            : ""
        }
        ${
          s.step === "suggestSlots" && s.slots.length
            ? `<button type="button" class="ghost-button" data-action="agent-append-all-slots">Ajouter au message</button>`
            : ""
        }
      </div>
    </div>`;
}

async function agentPrepareReplyStart(): Promise<void> {
  const tid = state.selectedThreadId?.trim();
  const accountId = currentAccount()?.id?.trim();
  if (!tid) {
    toast(t("toast.openThreadForAgent"));
    return;
  }
  if (!accountId) {
    toast(t("toast.selectAccountForAgent"));
    return;
  }
  if (threadIsAutoMail(state.selectedThread, tid)) {
    toast(t("toast.agentAutoMail"));
    return;
  }
  if (!isAiFeatureEnabled(state.appPrefs.ai, "featureAgentPrepareReplyEnabled")) {
    toast(t("toast.enableAgentInSettings"));
    return;
  }
  await stopAgentTelemetry();
  state.aiOpen = true;
  const assistMode: AssistMode = "deep";
  state.agentSession = {
    threadId: tid,
    accountId,
    assistMode,
    enabledSkills: defaultEnabledSkillIds(assistMode),
    step: "analyzeIntent",
    draft: "",
    slots: [],
    recommendations: [],
    busy: true,
    offerSlotsStep: false,
    clarificationQuestions: [],
    consistencyIssues: [],
    safetyFlags: [],
    forceDraft: false,
    telemetry: [],
  };
  const unlisten = await bindAssistTelemetry(tid, pushAgentTelemetry);
  if (state.agentSession) state.agentSession.unlistenTelemetry = unlisten;
  render();
  await withLlmQueue("Assistant réponse (1/3)", async (signal) => {
    try {
      const base = buildAssistPayload(tid, accountId, assistMode);
      const res = await invoke<AssistResult>("llm_assist_thread_phase", {
        payload: {
          ...base,
          phase: "analyzeIntent",
          priorIntent: null,
          draftSoFar: "",
        },
      });
      if (signal.aborted || !state.agentSession) return;
      state.agentSession = {
        ...state.agentSession,
        intent: res.intent,
        plan: res.plan,
        offerSlotsStep: res.plan?.offerSlotStep ?? res.intent?.needsScheduling ?? false,
        busy: false,
      };
    } catch (e) {
      toast(tauriErrorMessage(e));
      await stopAgentTelemetry();
      state.agentSession = null;
    }
    render();
  });
}

function agentAssistPhasePayload(
  s: NonNullable<typeof state.agentSession>,
  extra: Record<string, unknown>,
): { payload: Record<string, unknown> } {
  const base = agentAssistBasePayload() ?? buildAssistPayload(s.threadId, s.accountId, s.assistMode);
  return {
    payload: {
      ...base,
      priorFacts: s.facts ?? null,
      forceDraft: s.forceDraft,
      ...extra,
    },
  };
}

async function agentRunExtractFacts(signal: AbortSignal): Promise<boolean> {
  const s = state.agentSession;
  if (!s) return false;
  const res = await invoke<AssistResult>(
    "llm_assist_thread_phase",
    agentAssistPhasePayload(s, {
      phase: "extractFacts",
      priorIntent: s.intent ?? null,
      draftSoFar: "",
    }),
  );
  if (signal.aborted || !state.agentSession) return false;
  s.facts = res.facts;
  s.clarificationQuestions = res.clarificationQuestions ?? [];
  s.confidence = res.confidence;
  s.plan = res.plan ?? s.plan;
  s.offerSlotsStep = res.plan?.offerSlotStep ?? s.offerSlotsStep;
  if (res.needsClarification && !s.forceDraft) {
    s.step = "clarification";
    return false;
  }
  await agentRunPostExtractSkills(signal);
  return true;
}

function mergeAgentRecommendations(
  s: NonNullable<typeof state.agentSession>,
  res: AssistResult,
): void {
  const recs = res.recommendations ?? [];
  for (const r of recs) {
    if (s.recommendations.some((x) => x.kind === r.kind && x.label === r.label)) continue;
    s.recommendations.push(r);
  }
  if (res.slots?.length) {
    for (const sl of res.slots) {
      if (!s.recommendations.some((x) => x.kind === "slot" && x.label === sl)) {
        s.recommendations.push({ kind: "slot", label: sl });
      }
    }
  }
}

async function agentInvokeSkillPhase(
  skill: AssistSkillId,
  signal: AbortSignal,
  draftSoFar?: string,
): Promise<void> {
  if (!agentSkillEnabled(skill)) return;
  const s = state.agentSession;
  if (!s) return;
  const res = await invoke<AssistResult>(
    "llm_assist_thread_phase",
    agentAssistPhasePayload(s, {
      phase: assistPhaseForSkill(skill),
      priorIntent: s.intent ?? null,
      draftSoFar: draftSoFar ?? s.draft,
    }),
  );
  if (signal.aborted || !state.agentSession) return;
  mergeAgentRecommendations(s, res);
  if (res.safetyFlags?.length) {
    s.safetyFlags = [...new Set([...s.safetyFlags, ...res.safetyFlags])];
  }
  if (res.draftResponse?.trim()) s.draft = res.draftResponse.trim();
  s.plan = res.plan ?? s.plan;
}

async function agentRunPostExtractSkills(signal: AbortSignal): Promise<void> {
  await agentInvokeSkillPhase("actionItems", signal, "");
  await agentInvokeSkillPhase("riskFlagger", signal, "");
}

async function agentRunDraftStream(signal: AbortSignal): Promise<boolean> {
  const s = state.agentSession;
  const tid = state.selectedThreadId?.trim();
  if (!s || !tid) return false;
  s.step = "draftReply";
  const done = await runLlmStreamJob({
    command: "llm_stream_agent_prepare_draft",
    args: {
      threadId: tid,
      accountId: s.accountId,
      assistMode: s.assistMode,
      priorIntent: s.intent ?? null,
      priorFacts: s.facts ?? null,
      forceDraft: s.forceDraft,
    },
    signal,
    onChunk: (acc) => {
      if (signal.aborted || !state.agentSession) return;
      state.agentSession.draft = acc;
      paintAgentDraftDom(acc);
    },
  });
  if (signal.aborted || !state.agentSession) return false;
  if (done === "cancelled") {
    await stopAgentTelemetry();
    state.agentSession = null;
    toast("Assistant réponse annulé.");
    return false;
  }
  const draft =
    done.agentDraft?.draft?.trim() ?? done.displayText?.trim() ?? state.agentSession.draft.trim();
  state.agentSession.draft = draft;
  return true;
}

async function agentRunConsistency(signal: AbortSignal): Promise<void> {
  const s = state.agentSession;
  if (!s || !agentSkillEnabled("consistencyCheck") || !s.draft.trim()) return;
  const res = await invoke<AssistResult>(
    "llm_assist_thread_phase",
    agentAssistPhasePayload(s, {
      phase: "consistencyCheck",
      priorIntent: s.intent ?? null,
      draftSoFar: s.draft,
    }),
  );
  if (signal.aborted || !state.agentSession) return;
  s.consistencyIssues = res.consistencyIssues ?? [];
  if (res.safetyFlags?.length) {
    s.safetyFlags = [...new Set([...s.safetyFlags, ...res.safetyFlags])];
  }
  s.plan = res.plan ?? s.plan;
  await agentInvokeSkillPhase("toneAdapter", signal);
}

async function agentRefreshPlanFromDraft(): Promise<void> {
  const s = state.agentSession;
  const tid = state.selectedThreadId?.trim();
  if (!s || !tid) return;
  try {
    const base = agentAssistBasePayload() ?? buildAssistPayload(tid, s.accountId, s.assistMode);
    const planRes = await invoke<AssistResult>("llm_assist_plan", {
      payload: {
        ...base,
        priorIntent: s.intent ?? null,
        priorFacts: s.facts ?? null,
        draft: s.draft,
      },
    });
    s.plan = planRes.plan;
    s.offerSlotsStep = planRes.plan?.offerSlotStep ?? false;
  } catch {
    /* garde le plan précédent */
  }
}

async function agentPrepareReplyContinue(): Promise<void> {
  const s = state.agentSession;
  const tid = state.selectedThreadId?.trim();
  if (!s || !tid || s.busy || !threadIdsMatch(s.threadId, tid)) return;

  if (s.step === "clarification") {
    s.forceDraft = true;
    s.busy = true;
    render();
    await withLlmQueue("Assistant réponse · brouillon", async (signal) => {
      try {
        if (!(await agentRunDraftStream(signal))) return;
        await agentRunConsistency(signal);
        await agentRefreshPlanFromDraft();
      } catch (e) {
        if (!isLlmCancelledError(e)) toast(tauriErrorMessage(e));
      } finally {
        if (state.agentSession) state.agentSession.busy = false;
        render();
      }
    });
    return;
  }

  if (s.step === "analyzeIntent") {
    s.busy = true;
    render();
    await withLlmQueue("Assistant réponse · suite", async (signal) => {
      try {
        if (s.assistMode !== "quick") {
          const ok = await agentRunExtractFacts(signal);
          if (!ok) return;
        }
        if (!(await agentRunDraftStream(signal))) return;
        await agentRunConsistency(signal);
        await agentRefreshPlanFromDraft();
      } catch (e) {
        if (!isLlmCancelledError(e)) toast(tauriErrorMessage(e));
      } finally {
        if (state.agentSession) state.agentSession.busy = false;
        render();
      }
    });
    return;
  }

  if (s.step === "draftReply") {
    const draftTa = document.querySelector<HTMLTextAreaElement>("#agent-draft-text");
    if (draftTa) s.draft = draftTa.value;
    await agentRefreshPlanFromDraft();
    if (!agentOfferSlotsStep(s)) {
      render();
      return;
    }
    s.busy = true;
    s.step = "suggestSlots";
    render();
    await withLlmQueue("Assistant réponse · créneaux", async (signal) => {
      try {
        const res = await invoke<AssistResult>(
          "llm_assist_thread_phase",
          agentAssistPhasePayload(s, {
            phase: "suggestSlots",
            priorIntent: s.intent ?? null,
            draftSoFar: s.draft,
          }),
        );
        if (signal.aborted || !state.agentSession) return;
        state.agentSession.slots = res.slots ?? res.recommendations?.map((r) => r.label) ?? [];
        state.agentSession.plan = res.plan ?? state.agentSession.plan;
        state.agentSession.busy = false;
      } catch (e) {
        toast(tauriErrorMessage(e));
        if (state.agentSession) state.agentSession.busy = false;
      }
      render();
    });
  }
}

/** Formule les créneaux en une phrase avant la formule de politesse. */
function formatAgentSlotsParagraph(slotsText: string): string {
  const lines = slotsText
    .split(/\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (!lines.length) return "";
  if (lines.length === 1) return `Je vous propose le créneau suivant : ${lines[0]}.`;
  return `Je vous propose les créneaux suivants :\n${lines.map((l) => `· ${l}`).join("\n")}`;
}

/** Insère les créneaux avant « Cordialement », pas après la signature. */
function appendSchedulingSlotsToDraft(draft: string, slotsText: string): string {
  const d = draft.trimEnd();
  const block = formatAgentSlotsParagraph(slotsText);
  if (!block) return d;

  const signOffRe =
    /\n(\s*(?:Bien\s+)?cordialement\s*,?|Bien\s+à\s+vous\s*,?|Salutations\s+(?:distinguées\s+)?,?|Cordialement\s*,?|Regards\s*,?|Cdlt\.?\s*,?|Merci(?:\s+par\s+avance)?\s*,?)\s*$/i;
  const m = d.match(signOffRe);
  if (m?.index !== undefined) {
    const before = d.slice(0, m.index).trimEnd();
    const after = d.slice(m.index + 1).trimStart();
    return `${before}\n\n${block}\n\n${after}`;
  }

  const paras = d.split(/\n\n+/);
  if (paras.length >= 2) {
    const last = paras[paras.length - 1]!.trim();
    if (
      /^(?:bien\s+)?cordialement\s*,?$/i.test(last) ||
      /^salutations/i.test(last) ||
      /^merci\s*$/i.test(last)
    ) {
      return `${paras.slice(0, -1).join("\n\n")}\n\n${block}\n\n${last}`;
    }
  }

  return `${d}\n\n${block}`;
}

async function agentInsertDraftIntoCompose(extra?: string): Promise<void> {
  const s = state.agentSession;
  if (!s?.draft.trim() && !extra?.trim()) return;
  let body = s?.draft?.trim() ?? "";
  if (extra?.trim()) body = appendSchedulingSlotsToDraft(body, extra.trim());

  const threadId = (s?.threadId ?? state.selectedThreadId ?? "").trim();
  if (!threadId) {
    toast("Ouvrez le fil auquel vous répondez, puis réessayez.");
    return;
  }
  if (!isTauriRuntime()) {
    toast("Réponse dans le fil : application desktop (Tauri) requise.");
    return;
  }
  if (threadIsAutoMail(state.selectedThread, threadId)) {
    toast("Réponse indisponible pour ce fil automatique / newsletter.");
    return;
  }

  try {
    const replyDraft = await withTimeout(
      invoke<Draft>("prepare_reply", { threadId, messageId: null }),
      MAIL_ACTION_TIMEOUT_MS
    );
    replyDraft.markdownBody = body;
    state.draft = replyDraft;
    enterComposeView();
    startNewDraftSession();
    loadComposeMarkdownIntoEditor(body);
    state.composeCcBccOpen = draftHasRecipientsExtra(state.draft);
    state.composeAdvancedOpen = false;
    state.composeLayout = "split";
    syncPreviewOpenFromComposeLayout();
    resetMarkdownEditorHistory();
    render();
    window.setTimeout(() => void computePreview(), 0);
    scheduleDraftRevisionSave(350);
  } catch (error) {
    console.error("agentInsertDraftIntoCompose prepare_reply", error);
    toast(`Impossible d’ouvrir la réponse dans le fil : ${tauriErrorMessage(error)}`);
  }
}

function renderAiPanel() {
  if (mailboxDigestSlotInList()) {
    const digestMboxTitle = escapeHtml(state.selectedMailbox || "INBOX");
    const accountId = currentAccount()?.id?.trim() ?? "";
    const mailboxKey = state.selectedMailbox || "INBOX";
    const k = `${accountId}|${mailboxKey}`;
    const keyMatches = state.mailboxDigestKey === k;
    const banner = state.mailboxBriefBannerHtml.trim();
    const brief = state.mailboxActionBrief;
    const hasBrief = Boolean(brief && keyMatches);
    const hasBanner = Boolean(banner);
    const hasRenderable = hasBrief || hasBanner;
    let digestBody = "";
    if (state.mailboxDigestRefreshing && !hasRenderable) {
      digestBody = `<div class="inbox-brief-body">${renderBriefMailViewShell(
        `<p class="thread-zen-par dim" role="status">Génération du brief d’action…</p>`,
        { kicker: "Brief d’action" }
      )}</div>`;
    } else if (hasBrief) {
      digestBody = `<div class="inbox-brief-body">${renderActionBriefHtml(brief!)}</div>`;
    } else if (keyMatches && hasBanner) {
      digestBody = `<div class="inbox-brief-body">${banner}</div>`;
    } else if (state.mailboxDigestKey && !keyMatches) {
      digestBody = `<div class="inbox-brief-body">${renderBriefMailViewShell(
        `<p class="thread-zen-par dim" role="status">Changement de dossier — actualisation du brief…</p>`,
        { kicker: "Brief d’action" }
      )}</div>`;
    } else {
      digestBody = `<div class="inbox-brief-body">${renderBriefMailViewShell(
        `<p class="thread-zen-par dim">Le brief se charge automatiquement après chaque synchronisation ou chargement des conversations.</p>`,
        { kicker: "Brief d’action" }
      )}</div>`;
    }
    const busyLine =
      state.mailboxDigestRefreshing && keyMatches && hasRenderable
        ? `<p class="inbox-digest-busy dim" style="margin:0 14px 8px" aria-live="polite">Mise à jour…</p>`
        : "";
    const modeSel = state.mailboxBriefMode;
    const briefModeApplied = state.mailboxActionBrief?.mode?.trim();
    const ctxHint =
      state.llmRuntimeStatus?.llamaServerNCtx ??
      state.appPrefs.ai.localLlmContextSize ??
      null;
    const modeTitle =
      modeSel === "auto"
        ? `Auto : Quick / Decision / Deep selon la fenêtre de contexte${ctxHint ? ` (≈ ${ctxHint} jetons)` : ""}`
        : `Plafond ${modeSel} ; le mode effectif peut être réduit si le contexte est petit`;
    return `
    <aside class="ai-panel ai-panel--digest-slot" aria-label="Brief d'action du dossier">
      <header class="pane-header ai-panel-digest-head" style="display:flex;align-items:flex-start;justify-content:space-between;gap:10px">
        <div>
          <strong>Brief d'action</strong>
          <small class="dim" style="display:block;margin-top:3px">${briefModeApplied ? `${escapeHtml(briefModeApplied)} · ` : ""}${digestMboxTitle}</small>
        </div>
        <div style="display:flex;align-items:center;gap:6px;flex-shrink:0;flex-wrap:wrap;justify-content:flex-end">
          <label class="dim" style="font-size:11px;display:flex;align-items:center;gap:4px">Mode
            <select class="settings-ctl" data-action="mailbox-brief-mode" title="${escapeAttr(modeTitle)}" style="font-size:11px;padding:2px 6px;min-width:0">
              <option value="auto" ${modeSel === "auto" ? "selected" : ""}>Auto</option>
              <option value="quick" ${modeSel === "quick" ? "selected" : ""}>Quick</option>
              <option value="decision" ${modeSel === "decision" ? "selected" : ""}>Decision</option>
              <option value="deep" ${modeSel === "deep" ? "selected" : ""}>Deep</option>
            </select>
          </label>
          <button type="button" class="ghost-button inbox-digest-dismiss" data-action="llm-inbox-digest" title="Relancer le brief du dossier">Rafraîchir</button>
          <button type="button" class="icon-button" data-action="dismiss-mailbox-digest" aria-label="Fermer le brief">×</button>
        </div>
      </header>
      ${busyLine}
      <div class="ai-panel-digest-scroll inbox-brief-scroll">
        ${digestBody}
      </div>
    </aside>`;
  }

  const threadReading = state.view === "thread" && state.selectedThread;
  const thread = threadReading ? state.selectedThread : undefined;
  const participantLinks = thread ? threadParticipantsWithEmails(thread.messages) : [];
  const detailsTagCount = thread ? threadTagsForModal(thread.tags ?? []).length : 0;
  return `
    <aside class="ai-panel" aria-label="Détails">
      <header class="pane-header" style="display:flex;align-items:center;justify-content:space-between;gap:12px">
        <div><strong>Détails</strong><small class="dim" style="display:block;margin-top:3px">${threadReading ? "Conversation" : "Lecture d’un fil requise"}</small></div>
        <button type="button" class="icon-button" data-action="toggle-ai" aria-label="Fermer le panneau Détails">×</button>
      </header>
      <div class="ai-panel-body-scroll">

      ${
        threadReading && thread
          ? `
            <div class="details-block">
              <div class="details-row"><span class="dim">Sujet</span><strong style="font-weight:700">${escapeHtml(thread.subject)}</strong></div>
              <div class="details-row"><span class="dim">Participants</span><span>${participantLinks.map((p) => renderThreadParticipantLink(p)).join("") || '<span class="dim">—</span>'}</span></div>
              ${
                ENABLE_CLEAN_MESSAGE_VIEW
                  ? `<div class="details-row"><span class="dim">Vue</span><span class="label" style="background:rgba(173,188,216,.06);color:var(--text)">${state.messageViewMode === "clean" ? "Lisible (auto)" : "Tout brut"}</span></div>`
                  : ""
              }
              <div class="details-row"><span class="dim">Tags</span><span><button type="button" class="ghost-button thread-tags-details-link" data-action="open-thread-tags">${detailsTagCount ? `Voir les tags (${detailsTagCount})` : "Voir les tags"}</button></span></div>
            </div>
          `
          : `
            <div class="details-block details-block-muted">
              <p class="dim" style="margin:0;line-height:1.5;font-size:12px">
                Les détails du fil et les actions associées sont disponibles après ouverture d’une conversation.
              </p>
            </div>
          `
      }

      ${threadReading && thread ? `<div class="ai-actions" style="margin-top:8px">
        <button class="ai-action surface-sm" data-action="summarize"><span>[S]</span><span><strong>Aperçu du fil</strong><small class="dim" style="display:block">Résumé LLM · streaming</small></span></button>
        ${
          shouldOfferThreadTranslate(thread, state.appPrefs.general.motherLanguage?.trim() || "fr")
            ? `<button class="ai-action surface-sm" data-action="llm-translate-thread"><span>[T]</span><span><strong>Traduire le fil</strong><small class="dim" style="display:block">Tout le fil en un bloc (langue mère · LLM)</small></span></button>`
            : ""
        }
        ${
          threadIsAutoMail(thread)
            ? ""
            : `<button class="ai-action surface-sm" data-action="llm-quick-replies-thread"><span>[Q]</span><span><strong>Réponses rapides</strong><small class="dim" style="display:block">Propositions LLM · injecter dans le compositeur</small></span></button>${
                isAiFeatureEnabled(state.appPrefs.ai, "featureAgentPrepareReplyEnabled")
                  ? `<button class="ai-action surface-sm" data-action="agent-prepare-start"><span>[A]</span><span><strong>Assistant réponse</strong><small class="dim" style="display:block">Faits · brouillon · cohérence</small></span></button>`
                  : ""
              }`
        }
      </div>` : ""}
      ${threadReading && thread && !threadIsAutoMail(thread) ? renderAgentPrepareReplyPanelHtml() : ""}
      ${threadReading && thread ? renderThreadQaBlockHtml() : ""}

      ${
        threadReading &&
        !threadIsAutoMail(thread) &&
        state.quickReplySuggestions.length &&
        threadIdsMatch(state.aiThreadScope, state.selectedThreadId)
          ? `<div class="ai-quick-replies" role="list">${state.quickReplySuggestions
              .map(
                (s, i) => `
            <div class="ai-quick-reply-card surface-sm" role="listitem">
              <div class="ai-quick-reply-card__tone dim">${escapeHtml(s.tone)}</div>
              <p class="ai-quick-reply-card__text">${escapeHtml(s.text)}</p>
              ${s.rationale?.trim() ? `<p class="ai-quick-reply-card__why dim">${escapeHtml(s.rationale.trim())}</p>` : ""}
              <div class="ai-quick-reply-card__actions">
                <button type="button" class="ghost-button ai-quick-reply-card__btn" data-action="quick-reply-compose" data-qr-index="${i}">Composer</button>
                <button type="button" class="ghost-button ai-quick-reply-card__btn" data-action="quick-reply-copy" data-qr-index="${i}">Copier</button>
              </div>
            </div>`
              )
              .join("")}</div>`
          : ""
      }
      ${renderThreadSummaryPanelHtml()}
      </div>
    </aside>
  `;
}

let persistAiPrefsDebounce: ReturnType<typeof setTimeout> | undefined;

const AI_PREFS_IMMEDIATE_CHECKBOX_IDS = new Set([
  "prefs-openrouter-enabled",
  "prefs-llama-server-enabled",
  "prefs-llama-server-cpu-override",
  "prefs-llama-server-spawn-enabled",
  "prefs-bg-auto-semantic",
  "prefs-bg-llm-prefetch",
  "prefs-bg-idle-ai-cache",
  "prefs-ai-cloud-fallback",
  "prefs-semantic-search",
]);

async function persistAiPrefsFromDom(opts?: {
  silent?: boolean;
  skipRender?: boolean;
  /** N’enregistre que `state.appPrefs` (ex. après changement de mode PC/cloud/hybride). */
  skipDomCapture?: boolean;
}): Promise<void> {
  if (!isTauriRuntime()) {
    if (!opts?.silent) toast("Enregistrement : lancez l’app Tauri.");
    return;
  }
  if (!opts?.skipDomCapture) {
    captureAiPrefsFieldsFromDom(state.appPrefs);
  }
  if (state.view === "thread" && state.selectedThread) {
    state.aiOpen = true;
  }
  try {
    await withTimeout(invoke("set_app_prefs", { prefs: state.appPrefs }), MAIL_ACTION_TIMEOUT_MS);
    try {
      state.appPrefs = await withTimeout(invoke<AppPrefs>("get_app_prefs", {}), MAIL_ACTION_TIMEOUT_MS);
      state.appPrefs.ai = normalizeAiPrefsMerged({
        ...defaultAppPrefs().ai,
        ...state.appPrefs.ai,
      });
    } catch {
      /* ignore reload failures */
    }
    if (!opts?.silent) toast("Réglages IA enregistrés.");
  } catch (e) {
    toast(tauriErrorMessage(e));
  }
  if (!opts?.skipRender) render();
}

function schedulePersistAiPrefsFromDom(opts?: { skipDomCapture?: boolean }): void {
  if (persistAiPrefsDebounce) clearTimeout(persistAiPrefsDebounce);
  const skipDomCapture = Boolean(opts?.skipDomCapture);
  persistAiPrefsDebounce = window.setTimeout(() => {
    persistAiPrefsDebounce = undefined;
    void persistAiPrefsFromDom({ silent: true, skipDomCapture });
  }, 480);
}

function flushPendingAiPrefsPersist(): void {
  if (persistAiPrefsDebounce) {
    clearTimeout(persistAiPrefsDebounce);
    persistAiPrefsDebounce = undefined;
  }
}

function finalizeSettingsAiModalClose(): void {
  captureAiPrefsFieldsFromDom(state.appPrefs);
  flushPendingAiPrefsPersist();
  void persistAiPrefsFromDom({ silent: true, skipDomCapture: true, skipRender: true });
}

function wireEvents() {
  composeInteractionsAbort?.abort();
  composeInteractionsAbort = new AbortController();
  const composeSig = composeInteractionsAbort.signal;
  wireComposeRecipientChips();
  wireAtAutocompleteFields();

  document.querySelector<HTMLTextAreaElement>("#thread-qa-input")?.addEventListener(
    "input",
    (ev) => {
      state.threadQaDraft = (ev.currentTarget as HTMLTextAreaElement).value;
    },
    { signal: composeSig }
  );

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
      { signal: composeSig }
    );
  });

  document.addEventListener(
    "change",
    (ev: Event) => {
      if (!state.settingsAiModal) return;
      const t = ev.target as HTMLElement | null;
      if (!t?.closest(".settings-ai-modal-body")) return;
      const id = (t as HTMLInputElement | HTMLSelectElement).id ?? "";
      if (id && AI_PREFS_IMMEDIATE_CHECKBOX_IDS.has(id)) {
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
    { signal: composeSig }
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
    { signal: composeSig }
  );

  const actionHosts = document.querySelectorAll<HTMLElement>("[data-action]");
  let contactsSearchDebounce: ReturnType<typeof setTimeout> | undefined;
  document.querySelector<HTMLInputElement>("#contacts-list-search")?.addEventListener(
    "input",
    (ev) => {
      const q = (ev.currentTarget as HTMLInputElement).value;
      const acc = currentAccount();
      if (!acc?.id) return;
      if (contactsSearchDebounce) clearTimeout(contactsSearchDebounce);
      contactsSearchDebounce = window.setTimeout(() => {
        void loadContactsList(acc.id!, { reset: true, query: q }).then(() => render());
      }, 280);
    },
    { signal: composeSig }
  );

  const contactsListEl = document.querySelector<HTMLElement>("#contacts-thread-list");
  contactsListEl?.addEventListener(
    "scroll",
    () => {
      if (state.view !== "contacts" || isContactsListLoading() || !contactsListHasMore()) return;
      const el = contactsListEl;
      const nearBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 120;
      if (!nearBottom) return;
      const acc = currentAccount();
      if (!acc?.id) return;
      void loadContactsList(acc.id).then(() => render());
    },
    { signal: composeSig, passive: true }
  );

  actionHosts.forEach((host) => {
    host.addEventListener("click", (ev: MouseEvent) => {
      const cur = ev.currentTarget as HTMLElement | null;
      const el = cur ?? host;
      const action = (el.dataset.action ?? "").trim();
      void handleAction(action, el);
    });
  });

  document.addEventListener(
    "change",
    (ev: Event) => {
      const t = ev.target as HTMLElement | null;
      if (t?.dataset.action === "agent-toggle-skill") {
        const skill = t.dataset.skill as AssistSkillId | undefined;
        const s = state.agentSession;
        if (!skill || !s || s.busy) return;
        const checked = (t as HTMLInputElement).checked;
        const set = new Set(s.enabledSkills);
        if (checked) set.add(skill);
        else set.delete(skill);
        if (!set.has("analyzeIntent")) set.add("analyzeIntent");
        if (!set.has("draftReply")) set.add("draftReply");
        s.enabledSkills = [...set];
        void agentRefreshPlanFromDraft().then(() => render());
        return;
      }
      if (t?.dataset.action === "mailbox-brief-mode") {
        const v = (t as HTMLSelectElement).value as "auto" | "quick" | "decision" | "deep";
        if (v === state.mailboxBriefMode) return;
        state.mailboxBriefMode = v;
        if (mailboxDigestSlotInList()) {
          void enqueueMailboxDigestRefreshWhenIdle(true);
        }
        render();
        return;
      }
      if (t?.dataset.action !== "agent-set-mode") return;
      const mode = (t as HTMLSelectElement).value as AssistMode;
      const s = state.agentSession;
      if (!s || s.busy) return;
      s.assistMode = mode;
      s.enabledSkills = defaultEnabledSkillIds(mode);
      void agentRefreshPlanFromDraft().then(() => render());
    },
    { signal: composeSig },
  );

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
      { signal: composeSig }
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
      { signal: composeSig }
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

  document.querySelector<HTMLInputElement>("#prefs-bg-auto-semantic")?.addEventListener(
    "change",
    (ev) => {
      state.appPrefs.ai.aiBackgroundAutoSemanticIndex = Boolean(
        (ev.currentTarget as HTMLInputElement)?.checked
      );
      persistAiImmediate();
    },
    { signal: composeSig }
  );

  document.querySelector<HTMLInputElement>("#prefs-bg-llm-prefetch")?.addEventListener(
    "change",
    (ev) => {
      state.appPrefs.ai.aiBackgroundLlmPrefetch = Boolean(
        (ev.currentTarget as HTMLInputElement)?.checked
      );
      persistAiImmediate();
    },
    { signal: composeSig }
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
    { signal: composeSig }
  );

  document.querySelector<HTMLInputElement>("#prefs-ai-cloud-fallback")?.addEventListener(
    "change",
    (ev) => {
      state.appPrefs.ai.aiCloudLlmFallback = Boolean((ev.currentTarget as HTMLInputElement)?.checked);
      persistAiImmediate();
    },
    { signal: composeSig }
  );

  document.querySelector<HTMLInputElement>("#prefs-semantic-search")?.addEventListener(
    "change",
    (ev) => {
      const el = ev.currentTarget as HTMLInputElement;
      if (el.disabled) return;
      state.appPrefs.ai.semanticSearchEnabled = Boolean(el.checked);
      persistAiImmediate();
    },
    { signal: composeSig }
  );

  document.querySelectorAll<HTMLElement>("[data-toast]").forEach((element) => {
    element.addEventListener("click", () => toast(element.dataset.toast ?? "Not implemented yet"));
  });
  document.querySelectorAll<HTMLButtonElement>("[data-mailbox]").forEach((el) => {
    el.addEventListener("click", () => {
      // Boutons avec data-action (fm-select, org-open-mailbox, …) : handleAction uniquement.
      if (el.dataset.action?.trim()) return;
      void (async () => {
        await switchMailbox(el.dataset.mailbox || "INBOX");
      })();
    });
  });
  document.querySelectorAll<HTMLElement>(".thread-row-main[data-open-thread]").forEach((element) => {
    element.addEventListener("click", () => {
      const tid = element.dataset.threadId ?? "";
      const preserveAi = Boolean(
        state.aiOutput?.trim() && threadIdsMatch(state.aiThreadScope, tid)
      );
      void openThread(tid, { preserveAi });
    });
  });
  document.querySelectorAll<HTMLButtonElement>(".digest-open-thread[data-thread-id]").forEach((element) => {
    element.addEventListener("click", (e) => {
      e.preventDefault();
      void openThread(element.dataset.threadId ?? "");
    });
  });
  document.querySelectorAll<HTMLButtonElement>("[data-mv=trash][data-thread-id]").forEach((el) => {
    el.addEventListener("click", (e) => {
      e.stopPropagation();
      void onThreadMove("trash", el.dataset.threadId ?? "", el.dataset.sourceMailbox);
    });
  });
  document.querySelectorAll<HTMLButtonElement>("[data-mv=archive][data-thread-id]").forEach((el) => {
    el.addEventListener("click", (e) => {
      e.stopPropagation();
      void onThreadMove("archive", el.dataset.threadId ?? "", el.dataset.sourceMailbox);
    });
  });
  document.querySelectorAll<HTMLButtonElement>('[data-action="org-delete-mailbox-one"]').forEach((el) => {
    el.addEventListener(
      "click",
      (e) => {
        e.stopPropagation();
        e.preventDefault();
        const mb = el.dataset.mailbox?.trim();
        const refId = el.dataset.mailboxRefId?.trim();
        if (mb && refId) void onOrgDeleteMailboxOne(mb, refId);
      },
      { signal: composeSig },
    );
  });
  document.querySelectorAll<HTMLButtonElement>('[data-action="org-sync-mailbox"]').forEach((el) => {
    el.addEventListener(
      "click",
      (e) => {
        e.stopPropagation();
        e.preventDefault();
        const mb = el.dataset.mailbox?.trim();
        if (mb) void onOrgSyncMailbox(mb);
      },
      { signal: composeSig },
    );
  });
  document.querySelectorAll<HTMLButtonElement>('[data-action="org-v2-ignore-mailbox"]').forEach((el) => {
    el.addEventListener(
      "click",
      (e) => {
        e.stopPropagation();
        e.preventDefault();
        const mb = el.dataset.mailbox?.trim();
        if (mb) void onOrgV2IgnoreMailboxUi(mb);
      },
      { signal: composeSig },
    );
  });
  document.querySelectorAll<HTMLButtonElement>('[data-action="org-v2-unignore-mailbox"]').forEach((el) => {
    el.addEventListener(
      "click",
      (e) => {
        e.stopPropagation();
        e.preventDefault();
        const mb = el.dataset.mailbox?.trim();
        if (mb) void onOrgV2UnignoreMailboxUi(mb);
      },
      { signal: composeSig },
    );
  });
  document.querySelectorAll<HTMLSelectElement>("select.inbox-thread-folder-move").forEach((el) => {
    el.addEventListener("mousedown", (e) => e.stopPropagation());
    el.addEventListener("click", (e) => e.stopPropagation());
    el.addEventListener("change", (e) => {
      e.stopPropagation();
      const dest = el.value.trim();
      const tid = el.dataset.threadId ?? "";
      if (!dest || !tid) return;
      el.value = "";
      void onThreadMoveTo(tid, dest);
    });
  });
  document.querySelector<HTMLSelectElement>("#move-target-select")?.addEventListener("change", (event) => {
    state.moveTargetMailbox = (event.currentTarget as HTMLSelectElement).value || state.moveTargetMailbox;
  });
  document.querySelectorAll<HTMLButtonElement>("[data-att-download][data-msg-id]").forEach((el) => {
    el.addEventListener("click", (e) => {
      e.stopPropagation();
      void onAttachmentAction("download", el.dataset.msgId ?? "", el.dataset.attDownload ?? "");
    });
  });
  document.querySelectorAll<HTMLButtonElement>("[data-att-open][data-msg-id]").forEach((el) => {
    el.addEventListener("click", (e) => {
      e.stopPropagation();
      void onAttachmentAction("open", el.dataset.msgId ?? "", el.dataset.attOpen ?? "", el.dataset.attName ?? "");
    });
  });
  if (state.view === "thread") {
    hydrateEmailHtml();
  }
  document.querySelectorAll(".modal-shell-stop-prop").forEach((shell) => {
    shell.addEventListener("click", (e) => e.stopPropagation());
  });
  const orgTrashCheck = document.querySelector<HTMLInputElement>("#org-trash-check");
  const orgTrashConfirm = document.querySelector<HTMLButtonElement>("#org-trash-confirm-btn");
  if (orgTrashCheck && orgTrashConfirm) {
    const syncTrashConfirm = () => {
      orgTrashConfirm.disabled = !orgTrashCheck.checked;
    };
    syncTrashConfirm();
    orgTrashCheck.addEventListener("change", syncTrashConfirm, { signal: composeSig });
  }
  const orgDelMbCheck = document.querySelector<HTMLInputElement>("#org-delete-mailbox-check");
  const orgDelMbConfirm = document.querySelector<HTMLButtonElement>("#org-delete-mailbox-confirm-btn");
  if (orgDelMbCheck && orgDelMbConfirm) {
    const syncDelMbConfirm = () => {
      orgDelMbConfirm.disabled = !orgDelMbCheck.checked;
    };
    syncDelMbConfirm();
    orgDelMbCheck.addEventListener("change", syncDelMbConfirm, { signal: composeSig });
  }
  const orgV2TrashCheck = document.querySelector<HTMLInputElement>("#org-v2-trash-check");
  const orgV2TrashConfirm = document.querySelector<HTMLButtonElement>("#org-v2-trash-confirm-btn");
  if (orgV2TrashCheck && orgV2TrashConfirm) {
    const syncV2Trash = () => {
      orgV2TrashConfirm.disabled = !orgV2TrashCheck.checked;
    };
    syncV2Trash();
    orgV2TrashCheck.addEventListener("change", syncV2Trash, { signal: composeSig });
  }
  const orgV2DelMbCheck = document.querySelector<HTMLInputElement>("#org-v2-delete-mailbox-check");
  const orgV2DelMbConfirm = document.querySelector<HTMLButtonElement>("#org-v2-delete-mailbox-confirm-btn");
  if (orgV2DelMbCheck && orgV2DelMbConfirm) {
    const syncV2DelMb = () => {
      orgV2DelMbConfirm.disabled = !orgV2DelMbCheck.checked;
    };
    syncV2DelMb();
    orgV2DelMbCheck.addEventListener("change", syncV2DelMb, { signal: composeSig });
  }
  document.querySelectorAll<HTMLButtonElement>("[data-tone]").forEach((button) => {
    button.addEventListener("click", () => {
      state.tone = (button.dataset.tone as Tone) ?? state.tone;
      render();
    });
  });

  document.querySelector<HTMLElement>(".composer-body .preview")?.addEventListener(
    "click",
    (ev) => {
      const t = ev.target as HTMLElement | null;
      if (!t) return;
      const a = t.closest("a[href]") as HTMLAnchorElement | null;
      if (a) {
        const raw = a.getAttribute("href")?.trim() ?? "";
        const normalized = normalizeMailHrefForOpen(raw);
        if (normalized) {
          ev.preventDefault();
          void openExternalFromMailHref(normalized);
        }
        return;
      }
      if (t.tagName !== "IMG") return;
      const img = t as HTMLImageElement;
      const src = pickImgSrcForLightbox(img);
      if (!src) return;
      const alt = (img.getAttribute("alt") || "").trim();
      void resolveSrcForMailImageLightbox(src, null).then((resolved) => {
        state.imageModal = { src: resolved.src, alt, revokeObjectUrl: resolved.revokeObjectUrl ?? null };
        render();
      });
    },
    { signal: composeSig }
  );
  document.querySelectorAll<HTMLInputElement>("#search-input, #search-modal-input").forEach((searchInputEl) => {
    const fromModal = searchInputEl.id === "search-modal-input";
    searchInputEl.addEventListener(
      "focus",
      () => {
        void refreshSearchTagCatalog();
      },
      { signal: composeSig }
    );
    searchInputEl.addEventListener(
      "input",
      (event) => {
        state.searchDraft = (event.currentTarget as HTMLInputElement).value;
        syncSearchBarChrome();
        if (/#(?:tag|source|kind|entity|state)/i.test(state.searchDraft)) {
          void refreshSearchTagCatalog();
        }
      },
      { signal: composeSig }
    );
    searchInputEl.addEventListener(
      "keydown",
      (event) => {
        if (event.key === "Tab") return;
        if (event.key !== "Enter") return;
        if (isHashAutocompletePanelOpen() || isAtAutocompletePanelOpen()) return;
        event.preventDefault();
        commitSearchQuery({ fromModal });
      },
      { signal: composeSig }
    );
    searchInputEl.addEventListener(
      "search",
      () => {
        commitSearchQuery({ fromModal });
      },
      { signal: composeSig }
    );
  });
  document.querySelector<HTMLSelectElement>("#account-select")?.addEventListener("change", (event) => {
    void (async () => {
      const id = (event.currentTarget as HTMLSelectElement).value || state.accounts[0]?.id || "";
      await switchActiveAccount(id);
      render();
    })();
  });
  document.querySelector<HTMLTextAreaElement>("#compose-body")?.addEventListener(
    "input",
    (event) => {
      setComposeFromTextareaValue((event.currentTarget as HTMLTextAreaElement).value);
      schedulePreviewUpdate();
      scheduleDraftRevisionSave();
    },
    { signal: composeSig }
  );
  document.querySelector<HTMLTextAreaElement>("#compose-body")?.addEventListener(
    "paste",
    (event) => {
    const e = event as ClipboardEvent;
    const textarea = e.currentTarget as HTMLTextAreaElement | null;
    if (!textarea) return;
    const items = Array.from(e.clipboardData?.items ?? []);
    const imgItem = items.find((it) => it.kind === "file" && (it.type || "").startsWith("image/"));
    if (!imgItem) return;
    const file = imgItem.getAsFile();
    if (!file) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = typeof reader.result === "string" ? reader.result : "";
      if (!dataUrl.startsWith("data:image/")) return;
      const start = textarea.selectionStart ?? textarea.value.length;
      const end = textarea.selectionEnd ?? textarea.value.length;
      const nlBefore = start > 0 && textarea.value[start - 1] !== "\n" ? "\n" : "";
      const nlAfter = end < textarea.value.length && textarea.value[end] !== "\n" ? "\n" : "";
      const stamp = new Date().toLocaleString();
      const snippet = `${nlBefore}![Capture ${stamp}](${dataUrl})${nlAfter}\n`;
      textarea.setRangeText(snippet, start, end, "end");
      loadComposeMarkdownIntoEditor(textarea.value);
      textarea.value = state.composeBody;
      schedulePreviewUpdate(0);
      textarea.focus();
    };
    reader.readAsDataURL(file);
    },
    { signal: composeSig }
  );
  document.querySelector<HTMLInputElement>("#compose-subject")?.addEventListener(
    "input",
    () => {
      scheduleDraftRevisionSave();
    },
    { signal: composeSig }
  );
  document.querySelector<HTMLTextAreaElement>("#compose-body")?.addEventListener(
    "keydown",
    (event) => {
      const evk = event as KeyboardEvent;
      if (!(evk.ctrlKey || evk.metaKey)) return;
      const key = evk.key.toLowerCase();
      if (key === "b") {
        evk.preventDefault();
        void applyMarkdownAction("bold");
      } else if (key === "i") {
        evk.preventDefault();
        void applyMarkdownAction("italic");
      } else if (key === "k") {
        evk.preventDefault();
        void applyMarkdownAction("link");
      } else if (key === "u") {
        evk.preventDefault();
        void applyMarkdownAction("underline");
      }
    },
    { signal: composeSig }
  );
  document.querySelectorAll<HTMLButtonElement>("[data-md]").forEach((button) => {
    button.addEventListener(
      "click",
      () => {
        void applyMarkdownAction(button.dataset.md ?? "");
      },
      { signal: composeSig }
    );
  });
  bindComposerDropzone();
  document.querySelector<HTMLInputElement>("[data-quick-reply]")?.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      void sendQuickReply("reply");
    }
  });

  // Account creation helpers.
  document.querySelector<HTMLInputElement>("#account-email")?.addEventListener("input", (event) => {
    const value = (event.currentTarget as HTMLInputElement).value;
    applyDomainPresetIfSafe(value, {
      onApplied(domain, preset) {
        discoveredServersFormSnap = serverSidesFromPreset(preset);
        state.accountMessage = `Préréglage local pour « ${domain} ».`;
        accountFieldTouched.serverFields = false;
        render();
      },
    });
  });
  for (const selector of serverFieldSelectors()) {
    document.querySelector<HTMLElement>(selector)?.addEventListener("input", () => {
      accountFieldTouched.serverFields = true;
    });
    document.querySelector<HTMLElement>(selector)?.addEventListener("change", () => {
      accountFieldTouched.serverFields = true;
    });
  }
}

async function openAttachmentWithRiskHandling(
  messageId: string,
  attachmentId: string,
  label?: string,
  riskAcknowledged = false
): Promise<string> {
  try {
    return await withTimeout(
      invoke<string>("open_attachment", {
        req: { messageId, attachmentId, riskAcknowledged, openAck: "open-attachment" },
      }),
      MAIL_ACTION_TIMEOUT_MS
    );
  } catch (err) {
    const msg = tauriErrorMessage(err);
    if (!riskAcknowledged && msg.startsWith("ATTACHMENT_RISK_CONFIRM:")) {
      const hint = label?.trim() || "pièce jointe";
      const ok = await openConfirmModal({
        title: "Pièce jointe à risque",
        body: `RustyMail signale une pièce potentiellement sensible (${hint}). L’ouvrir quand même ?`,
        danger: true,
        confirmLabel: "Ouvrir quand même",
      });
      if (!ok) throw err;
      return openAttachmentWithRiskHandling(messageId, attachmentId, label, true);
    }
    throw err;
  }
}

/** Toutes les PJ d’un message → dossier Téléchargements (un `download_attachment` par fichier). */
async function downloadAllAttachmentsForMessage(messageId: string) {
  if (!messageId.trim()) return;
  if (!isTauriRuntime()) {
    toast("Téléchargement : lancez l’application bureau Tauri.");
    return;
  }
  const msg = state.selectedThread?.messages.find((m) => m.messageId === messageId);
  const atts = msg?.attachments ?? [];
  if (atts.length < 2) {
    toast("Ce message n’a pas plusieurs pièces jointes à regrouper.");
    return;
  }
  let ok = 0;
  const errors: string[] = [];
  for (const att of atts) {
    try {
      await withTimeout(
        invoke<string>("download_attachment", {
          req: { messageId, attachmentId: att.id },
        }),
        MAIL_ACTION_TIMEOUT_MS
      );
      ok++;
    } catch (e) {
      errors.push(`${att.fileName}: ${tauriErrorMessage(e)}`);
    }
  }
  if (errors.length === 0) {
    toast(
      `${ok} pièce${ok > 1 ? "s" : ""} jointe${ok > 1 ? "s" : ""} enregistrée${ok > 1 ? "s" : ""} dans Téléchargements`
    );
  } else {
    const hint = errors.slice(0, 2).join(" · ");
    toast(`${ok}/${atts.length} téléchargée(s). ${hint}${errors.length > 2 ? "…" : ""}`);
  }
}

async function onAttachmentAction(
  kind: "download" | "open",
  messageId: string,
  attachmentId: string,
  fileName?: string
) {
  if (!messageId.trim() || !attachmentId.trim()) return;
  const cmd = kind === "open" ? "open_attachment" : "download_attachment";
  try {
    const saved =
      kind === "open" ?
        await openAttachmentWithRiskHandling(messageId, attachmentId, fileName)
      : await withTimeout(
          invoke<string>(cmd, { req: { messageId, attachmentId } }),
          MAIL_ACTION_TIMEOUT_MS
        );
    toast(kind === "open" ? `Attachment opened: ${saved}` : `Attachment downloaded: ${saved}`);
  } catch (err) {
    console.error(cmd, err);
    toast(tauriErrorMessage(err));
  }
}

async function handleAction(action: string, element?: HTMLElement) {
  switch (action) {
    case "compose":
      state.aiOpen = false;
      clearThreadAiSummaryState();
      if (
        state.view === "thread" &&
        state.selectedThreadId?.trim() &&
        !threadIsAutoMail(state.selectedThread, state.selectedThreadId)
      ) {
        void prepareReply();
        break;
      }
      enterComposeView();
      startNewDraftSession();
      state.draft = {
        id: "draft-local",
        kind: "New",
        to: [],
        cc: [],
        bcc: [],
        subject: "",
        markdownBody: "",
        sendHtml: true,
        inReplyTo: null,
        references: [],
        attachmentPaths: [],
        threadId: null,
      };
      state.composeBody = "";
      state.composeCanonicalBody = "";
      state.composeLayout = "split";
      syncPreviewOpenFromComposeLayout();
      state.preview = undefined;
      state.composeAdvancedOpen = false;
      state.composeCcBccOpen = false;
      resetMarkdownEditorHistory();
      render();
      window.setTimeout(() => void computePreview(), 0);
      scheduleDraftRevisionSave(350);
      break;
    case "settings":
    case "account":
      openSettingsView();
      break;
    case "reload-accounts": {
      const ok = await loadAccountsFromBackend({ silent: false });
      if (ok) {
        state.mailboxes = await safeInvoke<string[]>(
          "list_imap_mailboxes",
          { accountId: currentAccount()?.id ?? null },
          [],
          BOOT_INVOKE_TIMEOUT_MS
        );
        ensureValidSelectedMailbox();
        await loadMailView(false);
        await loadMailboxUnread();
        toast(`Compte chargé : ${currentAccount()?.email ?? ""}`);
      }
      render();
      break;
    }
    case "settings-tab": {
      const tab = element?.dataset.settingsTab;
      if (
        tab === "accounts" ||
        tab === "general" ||
        tab === "appearance" ||
        tab === "autoSenders" ||
        tab === "ai" ||
        tab === "addressBook" ||
        tab === "storage" ||
        tab === "shortcuts" ||
        tab === "developer"
      ) {
        if (state.view !== "settings") {
          state.view = "settings";
          state.aiOpen = false;
          clearDiscoveredServerSnap();
          state.settingsSelectedAccountId =
            state.selectedAccountId && state.accounts.some((a) => a.id === state.selectedAccountId)
              ? state.selectedAccountId
              : (state.accounts[0]?.id ?? "new");
          accountFieldTouched.serverFields = false;
          state.accountServersPanelOpen = state.settingsSelectedAccountId !== "new";
        }
        state.settingsTab = tab;
        render();
        if (tab === "autoSenders") void loadNewsletterRules().then(() => render());
        if (tab === "ai") void refreshSemanticEmbeddingCounts();
        if (tab === "addressBook") void refreshAddressBookList().then(() => render());
        if (tab === "storage") void refreshSettingsPathsFromBackend();
      }
      break;
    }
    case "settings-reload-paths":
      void refreshSettingsPathsFromBackend();
      break;
    case "text-prompt-confirm": {
      const raw = document.querySelector<HTMLInputElement>("#text-prompt-input")?.value ?? "";
      finishTextPromptModal(raw);
      break;
    }
    case "text-prompt-cancel":
      finishTextPromptModal(null);
      break;
    case "confirm-modal-yes":
      finishConfirmModal(true);
      break;
    case "confirm-modal-no":
      finishConfirmModal(false);
      break;
    case "settings-ia-tab": {
      const tab = element?.dataset.iaTab;
      if (tab === "semantic") {
        state.settingsAiModal = "semantic";
        void refreshSemanticEmbeddingCounts().then(() => render());
      } else if (tab === "llm") {
        void openEnginesAiSettingsModal();
      } else if (tab === "dictation") {
        state.settingsAiModal = "dictation";
        render();
      } else if (tab === "background") {
        state.settingsAiModal = "background";
        render();
      } else if (tab === "features") {
        state.settingsAiModal = "features-0";
        render();
      }
      break;
    }
    case "open-settings-ai-modal": {
      const modal = normalizeSettingsAiModalId(element?.dataset.aiModal);
      if (!modal) break;
      state.settingsAiModal = modal;
      if (modal === "prompts") {
        void (async () => {
          if (!isTauriRuntime()) {
            state.promptCatalog = null;
            state.promptCatalogLoadError = t("settings.ai.promptsNoCatalog");
            render();
            return;
          }
          try {
            state.promptCatalog = await invoke<PromptCatalogItem[]>("list_ai_prompt_catalog", {});
            state.promptCatalogLoadError = "";
          } catch (e) {
            state.promptCatalog = null;
            state.promptCatalogLoadError = tauriErrorMessage(e);
          }
          render();
        })();
      } else if (modal === "semantic") void refreshSemanticEmbeddingCounts().then(() => render());
      else if (modal === "engines") void openEnginesAiSettingsModal();
      else render();
      break;
    }
    case "close-settings-ai-modal":
      finalizeSettingsAiModalClose();
      state.settingsAiModal = null;
      render();
      break;
    case "save-default-account-prompt": {
      void (async () => {
        const sel = document.querySelector<HTMLSelectElement>("#default-account-prompt-select");
        const id = (sel?.value ?? "").trim();
        if (!id) {
          toast("Choisissez un compte.");
          return;
        }
        try {
          await persistDefaultAccountId(id);
          await switchActiveAccount(id);
          toast("Compte par défaut enregistré.");
          render();
        } catch (e) {
          toast(tauriErrorMessage(e));
        }
      })();
      break;
    }
    case "dismiss-default-account-prompt": {
      try {
        window.localStorage.setItem(DEFAULT_ACCOUNT_PROMPT_DISMISS_KEY, "1");
      } catch {
        /* ignore */
      }
      render();
      break;
    }
    case "open-settings-default-account":
      state.view = "settings";
      state.settingsTab = "general";
      render();
      break;
    case "save-general-prefs": {
      void (async () => {
        if (!isTauriRuntime()) {
          toast("Enregistrement : lancez l’app Tauri.");
          return;
        }
        const sel = document.querySelector<HTMLSelectElement>("#prefs-mother-language");
        if (sel) {
          state.appPrefs.general.motherLanguage = sel.value.trim() || "fr";
          state.appPrefs.ai.draftLanguage = state.appPrefs.general.motherLanguage;
          setLocale(state.appPrefs.general.motherLanguage);
        }
        const globalCb = document.querySelector<HTMLInputElement>("#prefs-address-book-global");
        state.appPrefs.general.addressBookGlobalScope = Boolean(globalCb?.checked);
        const activityCb = document.querySelector<HTMLInputElement>("#prefs-activity-suggestions");
        state.appPrefs.general.activitySuggestionsEnabled = activityCb?.checked !== false;
        syncActivityRecordingPrefs();
        if (!state.appPrefs.general.activitySuggestionsEnabled) {
          state.suggestedSavedViews = [];
          clearSuggestionShownKeys();
        } else {
          void refreshSuggestedSavedViews().then(() => render());
        }
        const lfSel = document.querySelector<HTMLSelectElement>("#prefs-default-list-filter");
        const lfRaw = lfSel?.value?.trim() ?? "all";
        state.appPrefs.general.defaultListFilter = LIST_FILTER_VALUES.includes(lfRaw as State["listFilter"])
          ? (lfRaw as State["listFilter"])
          : "all";
        const archLayout = document.querySelector<HTMLSelectElement>("#prefs-archive-layout");
        state.appPrefs.general.archiveLayout = archLayout?.value?.trim() || "hierarchical";
        const archRoot = document.querySelector<HTMLInputElement>("#prefs-archive-root");
        state.appPrefs.general.archiveRoot = (archRoot?.value ?? "Archive").trim() || "Archive";
        const accSel = document.querySelector<HTMLSelectElement>("#prefs-default-account");
        const accVal = (accSel?.value ?? "").trim();
        if (accVal) state.appPrefs.general.defaultAccountId = accVal;
        else delete state.appPrefs.general.defaultAccountId;
        try {
          await withTimeout(invoke("set_app_prefs", { prefs: state.appPrefs }), MAIL_ACTION_TIMEOUT_MS);
          toast(t("toast.prefsSaved"));
        } catch (e) {
          toast(tauriErrorMessage(e));
        }
        if (accVal && state.view === "list") {
          await switchActiveAccount(accVal);
          render();
        } else if (
          state.view === "list" &&
          !isSavedDraftsVirtualMailbox(state.selectedMailbox ?? "") &&
          !isSearchActive() &&
          state.listFilter !== defaultListFilterFromPrefs()
        ) {
          await applyListFilter(defaultListFilterFromPrefs());
        } else {
          render();
        }
      })();
      break;
    }
    case "save-ai-prefs":
      void persistAiPrefsFromDom();
      break;
    case "refresh-llm-runtime-status": {
      void refreshLlmRuntimeStatus(false).then(() => {
        render();
        toast("Statut LLM actualisé.");
      });
      break;
    }
    case "refresh-llm-hardware-rescan": {
      void refreshLlmRuntimeStatus(true).then(() => {
        render();
        toast("Mémoire de l’ordinateur : nouvelle analyse effectuée.");
      });
      break;
    }
    case "llm-apply-recommended-weights": {
      const st = state.llmRuntimeStatus;
      if (!st?.recommendedRepo?.trim()) {
        toast("Aucune recommandation pour l’instant — essayez « Analyser la mémoire ».");
        break;
      }
      state.appPrefs.ai.localLlmHfRepoId = st.recommendedRepo.trim();
      if (st.recommendedFile?.trim()) {
        state.appPrefs.ai.localLlmGgufFile = st.recommendedFile.trim();
      }
      void persistAiPrefsFromDom({ silent: true, skipRender: true });
      toast("Modèle recommandé appliqué.");
      render();
      break;
    }
    case "llm-setup-recommended": {
      void (async () => {
        if (!isTauriRuntime()) {
          toast("Configuration recommandée : lancez l’app Tauri.");
          return;
        }
        await refreshLlmRuntimeStatus(true);
        const st = state.llmRuntimeStatus;
        if (st?.recommendedRepo?.trim()) {
          state.appPrefs.ai.localLlmHfRepoId = st.recommendedRepo.trim();
          if (st.recommendedFile?.trim()) {
            state.appPrefs.ai.localLlmGgufFile = st.recommendedFile.trim();
          }
          state.appPrefs.ai.localLlmEnabled = true;
        }
        await autoDetectLlamaServerBinary({ silent: true, persist: false });
        try {
          await withTimeout(invoke("set_app_prefs", { prefs: state.appPrefs }), MAIL_ACTION_TIMEOUT_MS);
        } catch (e) {
          toast(tauriErrorMessage(e));
          return;
        }
        await refreshLlmRuntimeStatus(false);
        toast("Configuration recommandée appliquée.");
        render();
      })();
      break;
    }
    case "ai-engine-mode": {
      const mode = element?.dataset.engineMode?.trim();
      if (mode !== "local" && mode !== "cloud" && mode !== "hybrid") break;
      state.aiEngineSettingsTab = mode;
      if (mode === "local") {
        applyEngineConnectionMode(state.appPrefs.ai, "local");
      } else if (mode === "hybrid") {
        applyEngineConnectionMode(state.appPrefs.ai, "hybrid");
      }
      syncLlmEnginePrefsToDom(state.appPrefs.ai);
      render();
      void (async () => {
        if (mode === "local" || mode === "hybrid") {
          try {
            await withTimeout(invoke("set_app_prefs", { prefs: state.appPrefs }), MAIL_ACTION_TIMEOUT_MS);
          } catch (e) {
            toast(tauriErrorMessage(e));
            return;
          }
        }
        toast(
          mode === "local"
            ? "Mode Sur mon PC."
            : mode === "cloud"
              ? "Mode Cloud."
              : "Mode Hybride enregistré.",
        );
        await refreshLlmRuntimeStatus(false);
        render();
      })();
      break;
    }
    case "cancel-llm-prefetch": {
      if (!isTauriRuntime()) break;
      void (async () => {
        try {
          await invoke("cancel_prefetch_llm_model", {});
          toast("Téléchargement du modèle annulé.");
        } catch (e) {
          toast(tauriErrorMessage(e));
        }
      })();
      break;
    }
    case "prefetch-llm-model": {
      if (!isTauriRuntime()) {
        toast("Téléchargement du modèle : ouvrez l’application de bureau (Tauri).");
        break;
      }
      if (state.llmPrefetchInFlight) {
        toast("Un téléchargement est déjà en cours — utilisez Annuler pour l’arrêter.");
        break;
      }
      state.llmPrefetchInFlight = true;
      state.llmPrefetchPercent = 0;
      paintLlmPrefetchProgressDom();
      paintStatusBarProgressDom();
      toast("Téléchargement du modèle en arrière-plan — vous pouvez continuer à utiliser l’app.");
      void (async () => {
        try {
          const msg = await withTimeout(invoke<string>("prefetch_llm_model", {}), 1_800_000);
          toast(msg || "Fichier modèle prêt.");
        } catch (e) {
          const msg = tauriErrorMessage(e);
          if (!/annulé/i.test(msg)) toast(msg);
        } finally {
          state.llmPrefetchInFlight = false;
          if (state.llmPrefetchPercent == null) {
            paintLlmPrefetchProgressDom();
            paintStatusBarProgressDom();
          }
          void refreshLlmRuntimeStatus(false).then(() => {
            if (state.settingsAiModal === "engines") render();
          });
        }
      })();
      break;
    }
    case "prefetch-semantic-minilm": {
      void (async () => {
        if (!isTauriRuntime()) {
          toast("Téléchargement MiniLM : lancez l’app Tauri.");
          return;
        }
        toast("Téléchargement all-MiniLM-L6-v2 (ONNX + tokenizer)…");
        try {
          const msg = await withTimeout(invoke<string>("prefetch_semantic_minilm_model", {}), 900_000);
          toast(msg);
          try {
            state.semanticModelAvailable = await withTimeout(invoke<boolean>("semantic_model_available", {}), MAIL_ACTION_TIMEOUT_MS);
          } catch {
            state.semanticModelAvailable = false;
          }
        } catch (e) {
          toast(tauriErrorMessage(e));
        }
        render();
      })();
      break;
    }
    case "reindex-semantic-account": {
      void (async () => {
        if (!isTauriRuntime()) {
          toast("Réindexation : lancez l’app Tauri.");
          return;
        }
        if (!ipcThrottleMs("reindex_semantic_account_ui", 3500)) {
          toast("Une réindexation vient d’être demandée — patiente quelques secondes.");
          return;
        }
        const aid = state.selectedAccountId?.trim() || currentAccount()?.id?.trim();
        if (!aid) {
          toast("Sélectionne un compte actif avant de réindexer.");
          return;
        }
        if (!state.semanticModelAvailable) {
          toast("Modèle MiniLM absent (model.onnx + tokenizer.json).");
          return;
        }
        try {
          toast("Réindexation sémantique (tout le compte, dossiers présents localement)…");
          const stats = await withTimeout(
            invoke<{ indexed: number; skipped: number; errors: number }>("reindex_semantic_account_cmd", {
              accountId: aid,
            }),
            1_800_000
          );
          toast(`Index sémantique : ${stats.indexed} ligne(s), ${stats.errors} erreur(s).`);
          await searchThreads();
          await refreshSemanticEmbeddingCounts();
        } catch (e) {
          toast(tauriErrorMessage(e));
        }
      })();
      break;
    }
    case "refresh-semantic-embedding-counts": {
      void refreshSemanticEmbeddingCounts();
      break;
    }
    case "prefetch-whisper-models": {
      void (async () => {
        if (!isTauriRuntime()) {
          toast("Téléchargement GGML : lancez l’app Tauri.");
          return;
        }
          toast("Téléchargement du GGML Whisper (HF) selon tes réglages…");
        try {
          const msg = await withTimeout(invoke<string>("prefetch_whisper_dictation_model", {}), 900_000);
          toast(msg);
        } catch (e) {
          toast(tauriErrorMessage(e));
        }
        render();
      })();
      break;
    }
    case "dictation-test-mic": {
      void (async () => {
        if (!isTauriRuntime()) {
          toast("Test micro : lancez l’app Tauri.");
          return;
        }
        // Enregistre 3s et envoie un WAV 16kHz mono PCM16 au backend Whisper.
        toast("Test micro : enregistrement 3s…");
        let stream: MediaStream | null = null;
        let recorder: MediaRecorder | null = null;
        const chunks: Blob[] = [];
        try {
          stream = await requestMicStream();
          const mimeOpt =
            typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
              ? "audio/webm;codecs=opus"
              : "audio/webm";
          recorder = new MediaRecorder(stream, { mimeType: mimeOpt });
          recorder.ondataavailable = (ev) => {
            if (ev.data && ev.data.size > 0) chunks.push(ev.data);
          };
          recorder.start(250);
          await new Promise((resolve) => window.setTimeout(resolve, 3000));
          const blob: Blob = await new Promise((resolve, reject) => {
            const r = recorder!;
            r.onerror = () => reject(new Error("Enregistrement interrompu"));
            r.onstop = () => resolve(new Blob(chunks, { type: r.mimeType || "audio/webm" }));
            r.stop();
          });
          stream.getTracks().forEach((t) => t.stop());
          stream = null;
          recorder = null;
          const wavBytes = await mediaBlobToWav16kMonoPcm16(blob);
          const audioWavBase64 = bytesToBase64(wavBytes);
          toast("Test micro : transcription…");
          const res = await withTimeout(
            invoke<{ durationS: number; rms: number; elapsedMs: number; text?: string | null; error?: { kind: string; seconds?: number; rms?: number; message?: string } | null }>(
              "dictation_test_run",
              { audioWavBase64 }
            ),
            180_000
          );
          if (res.error) {
            const msg =
              res.error.kind === "audio_too_short"
                ? `Audio trop court (${(res.error.seconds ?? res.durationS).toFixed(2)}s).`
                : res.error.kind === "audio_silent"
                  ? `Audio quasi silencieux (RMS=${(res.error.rms ?? res.rms).toFixed(4)}).`
                  : res.error.message
                    ? res.error.message
                    : "Échec transcription.";
            toast(`Test micro : ${msg}`);
          } else {
            toast(
              `Test micro OK (${res.durationS.toFixed(2)}s, RMS=${res.rms.toFixed(4)}, ${Math.round(res.elapsedMs)}ms) : ${String(res.text ?? "").slice(0, 140)}`
            );
          }
        } catch (e) {
          toast(`Test micro : ${micPermissionErrorMessage(e)}`);
        } finally {
          try {
            recorder?.stop();
          } catch {
            // ignore
          }
          stream?.getTracks().forEach((t) => t.stop());
        }
        render();
      })();
      break;
    }
    case "save-cloud-api-key": {
      void (async () => {
        if (!isTauriRuntime()) {
          toast("Enregistrement : lancez l’app Tauri.");
          return;
        }
        const inp = document.querySelector<HTMLInputElement>("#prefs-cloud-api-key");
        const secret = inp?.value?.trim() ?? "";
        if (!secret) {
          toast("Collez une clé API avant d’enregistrer.");
          return;
        }
        try {
          await withTimeout(invoke("set_openrouter_api_key", { secret }), MAIL_ACTION_TIMEOUT_MS);
          await withTimeout(invoke("set_dictation_api_key", { secret }), MAIL_ACTION_TIMEOUT_MS);
          state.openrouterApiKeySet = true;
          state.dictationApiKeySet = true;
          if (inp) inp.value = "";
          toast("Clé cloud enregistrée (OpenRouter + dictée).");
          void refreshLlmRuntimeStatus(false).then(() => {
            if (state.settingsAiModal === "engines") render();
          });
        } catch (e) {
          toast(tauriErrorMessage(e));
        }
      })();
      break;
    }
    case "clear-cloud-api-key": {
      void (async () => {
        if (!isTauriRuntime()) {
          toast("Lancez l’app Tauri.");
          return;
        }
        try {
          await withTimeout(invoke("clear_openrouter_api_key", {}), MAIL_ACTION_TIMEOUT_MS);
          await withTimeout(invoke("clear_dictation_api_key", {}), MAIL_ACTION_TIMEOUT_MS);
          state.openrouterApiKeySet = false;
          state.dictationApiKeySet = false;
          toast("Clé cloud supprimée.");
          void refreshLlmRuntimeStatus(false).then(() => {
            if (state.settingsAiModal === "engines") render();
          });
        } catch (e) {
          toast(tauriErrorMessage(e));
        }
      })();
      break;
    }
    case "save-dictation-api-key": {
      void (async () => {
        if (!isTauriRuntime()) {
          toast("Enregistrement : lancez l’app Tauri.");
          return;
        }
        const inp = document.querySelector<HTMLInputElement>("#prefs-dictation-api-key");
        const secret = inp?.value?.trim() ?? "";
        if (!secret) {
          toast("Collez une clé API avant d’enregistrer.");
          return;
        }
        try {
          await withTimeout(invoke("set_dictation_api_key", { secret }), MAIL_ACTION_TIMEOUT_MS);
          state.dictationApiKeySet = true;
          if (inp) inp.value = "";
          toast("Clé API enregistrée dans le trousseau.");
        } catch (e) {
          toast(tauriErrorMessage(e));
        }
        render();
      })();
      break;
    }
    case "clear-dictation-api-key": {
      void (async () => {
        if (!isTauriRuntime()) {
          toast("Lancez l’app Tauri.");
          return;
        }
        try {
          await withTimeout(invoke("clear_dictation_api_key", {}), MAIL_ACTION_TIMEOUT_MS);
          state.dictationApiKeySet = false;
          toast("Clé API supprimée du trousseau.");
        } catch (e) {
          toast(tauriErrorMessage(e));
        }
        render();
      })();
      break;
    }
    case "save-openrouter-api-key": {
      void (async () => {
        if (!isTauriRuntime()) {
          toast("Enregistrement : lancez l’app Tauri.");
          return;
        }
        const inp = document.querySelector<HTMLInputElement>("#prefs-openrouter-api-key");
        const secret = inp?.value?.trim() ?? "";
        if (!secret) {
          toast("Collez une clé OpenRouter avant d’enregistrer.");
          return;
        }
        try {
          await withTimeout(invoke("set_openrouter_api_key", { secret }), MAIL_ACTION_TIMEOUT_MS);
          state.openrouterApiKeySet = true;
          if (inp) inp.value = "";
          toast("Clé OpenRouter enregistrée dans le trousseau.");
          void refreshLlmRuntimeStatus(false).then(() => render());
        } catch (e) {
          toast(tauriErrorMessage(e));
        }
        render();
      })();
      break;
    }
    case "clear-openrouter-api-key": {
      void (async () => {
        if (!isTauriRuntime()) {
          toast("Lancez l’app Tauri.");
          return;
        }
        try {
          await withTimeout(invoke("clear_openrouter_api_key", {}), MAIL_ACTION_TIMEOUT_MS);
          state.openrouterApiKeySet = false;
          toast("Clé OpenRouter supprimée du trousseau.");
          void refreshLlmRuntimeStatus(false).then(() => render());
        } catch (e) {
          toast(tauriErrorMessage(e));
        }
        render();
      })();
      break;
    }
    case "save-llama-server-api-key": {
      void (async () => {
        if (!isTauriRuntime()) {
          toast("Enregistrement : lancez l’app Tauri.");
          return;
        }
        const inp = document.querySelector<HTMLInputElement>("#prefs-llama-server-api-key");
        const secret = inp?.value?.trim() ?? "";
        if (!secret) {
          toast("Collez une clé Bearer avant d’enregistrer (ou laissez vide et utilisez « Supprimer »).");
          return;
        }
        try {
          await withTimeout(invoke("set_llama_server_api_key", { secret }), MAIL_ACTION_TIMEOUT_MS);
          state.llamaServerApiKeySet = true;
          if (inp) inp.value = "";
          toast("Clé llama-server enregistrée dans le trousseau.");
          void refreshLlmRuntimeStatus(false).then(() => render());
        } catch (e) {
          toast(tauriErrorMessage(e));
        }
        render();
      })();
      break;
    }
    case "clear-llama-server-api-key": {
      void (async () => {
        if (!isTauriRuntime()) {
          toast("Lancez l’app Tauri.");
          return;
        }
        try {
          await withTimeout(invoke("clear_llama_server_api_key", {}), MAIL_ACTION_TIMEOUT_MS);
          state.llamaServerApiKeySet = false;
          toast("Clé llama-server supprimée du trousseau.");
          void refreshLlmRuntimeStatus(false).then(() => render());
        } catch (e) {
          toast(tauriErrorMessage(e));
        }
        render();
      })();
      break;
    }
    case "llama-server-detect": {
      void (async () => {
        if (!isTauriRuntime()) {
          toast("Détection : lancez l’app Tauri.");
          return;
        }
        try {
          const det = await invoke<{
            onPath: boolean;
            wingetInstalled: boolean;
            resolvedPath?: string | null;
          }>("llama_server_detect", {
            binaryHint: state.appPrefs.ai.llamaServerBinaryPath || "llama-server",
          });
          if (det.onPath || det.wingetInstalled) {
            toast(`llama-server détecté${det.resolvedPath ? ` (${det.resolvedPath})` : ""}.`);
          } else {
            toast("llama-server introuvable (PATH et winget).");
          }
        } catch (e) {
          toast(tauriErrorMessage(e));
        }
      })();
      break;
    }
    case "llama-server-winget-install": {
      void (async () => {
        if (!isTauriRuntime()) {
          toast("winget : lancez l’app Tauri sous Windows.");
          return;
        }
        toast("Installation winget… une fenêtre administrateur peut s’ouvrir.");
        try {
          const res = await invoke<{ success: boolean; message: string }>("llama_server_winget_install", {});
          toast(res.message);
          if (res.success) {
            state.appPrefs.ai.llamaServerEnabled = true;
            state.appPrefs.ai.llamaServerSpawnEnabled = true;
            state.appPrefs.ai.llamaServerBinaryPath = "llama-server";
            state.appPrefs.ai.localLlmEnabled = true;
            await invoke("set_app_prefs", { prefs: state.appPrefs });
            void refreshLlmRuntimeStatus(false).then(() => render());
          }
        } catch (e) {
          toast(tauriErrorMessage(e));
        }
        render();
      })();
      break;
    }
    case "pick-llama-server-binary-path": {
      void (async () => {
        if (!isTauriRuntime()) {
          toast("Parcourir : lancez l’app Tauri.");
          return;
        }
        try {
          const picked = await withTimeout(
            invoke<string | null>("pick_llama_server_binary_path", {}),
            MAIL_ACTION_TIMEOUT_MS
          );
          if (!picked?.trim()) {
            toast("Aucun fichier sélectionné.");
            return;
          }
          state.appPrefs.ai.llamaServerBinaryPath = picked.trim();
          await withTimeout(invoke("set_app_prefs", { prefs: state.appPrefs }), MAIL_ACTION_TIMEOUT_MS);
          toast("Chemin llama-server enregistré.");
          void refreshLlmRuntimeStatus(false).then(() => render());
        } catch (e) {
          toast(tauriErrorMessage(e));
        }
        render();
      })();
      break;
    }
    case "newsletter-domain-add": {
      void (async () => {
        const raw = document.querySelector<HTMLInputElement>("#newsletter-domain-input")?.value?.trim() ?? "";
        if (!raw) {
          toast("Indiquez une règle (domaine, *.domaine ou local@domaine).");
          return;
        }
        if (!isTauriRuntime()) {
          toast("Ajout de règles : exécutez l’app Tauri.");
          return;
        }
        try {
          await withTimeout(invoke("add_newsletter_rule", { input: raw }), MAIL_ACTION_TIMEOUT_MS);
          await loadNewsletterRules();
          const inp = document.querySelector<HTMLInputElement>("#newsletter-domain-input");
          if (inp) inp.value = "";
          toast("Règle enregistrée.");
          render();
        } catch (error) {
          toast(tauriErrorMessage(error));
        }
      })();
      break;
    }
    case "newsletter-domain-remove": {
      const dom = readNlButtonRule(element);
      if (!dom) {
        toast("Règle invalide ou manquante.");
        break;
      }
      void (async () => {
        if (!isTauriRuntime()) {
          toast("Suppression des règles : lancez l’app bureau Tauri.");
          return;
        }
        try {
          await withTimeout(invoke("remove_newsletter_rule", { input: dom }), MAIL_ACTION_TIMEOUT_MS);
          await loadNewsletterRules();
          toast("Règle supprimée.");
          render();
        } catch (error) {
          toast(tauriErrorMessage(error));
        }
      })();
      break;
    }
    case "newsletter-msg-add-rule": {
      const raw = readNlButtonRule(element);
      const rule = normalizeNlRuleInvokeInput(raw);
      if (!rule) {
        toast("Impossible de lire l’adresse (data-rule vide). Réouvrez le fil ou utilisez les paramètres.");
        break;
      }
      if (!rule.includes("@")) {
        toast("Pour ajouter depuis un message, l’expéditeur doit être une adresse e-mail (avec @).");
        break;
      }
      void (async () => {
        if (!isTauriRuntime()) {
          toast("Ajout depuis un message : lancez l’app bureau Tauri.");
          return;
        }
        try {
          await withTimeout(invoke("add_newsletter_rule", { input: rule }), MAIL_ACTION_TIMEOUT_MS);
          await loadNewsletterRules();
          if (state.selectedThreadId) {
            const tid = state.selectedThreadId;
            const refreshed = await fetchOpenThreadOrNotify(tid);
            if (refreshed) state.selectedThread = refreshed;
          }
          toast(`Règle ajoutée : ${rule}`);
          render();
        } catch (error) {
          toast(tauriErrorMessage(error));
        }
      })();
      break;
    }
    case "newsletter-msg-remove-rule": {
      const dom = readNlButtonRule(element);
      if (!dom) {
        toast("Règle invalide ou manquante.");
        break;
      }
      void (async () => {
        if (!isTauriRuntime()) {
          toast("Retrait de règle : lancez l’app bureau Tauri.");
          return;
        }
        try {
          await withTimeout(invoke("remove_newsletter_rule", { input: dom }), MAIL_ACTION_TIMEOUT_MS);
          await loadNewsletterRules();
          if (state.selectedThreadId) {
            const tid = state.selectedThreadId;
            const refreshed = await fetchOpenThreadOrNotify(tid);
            if (refreshed) state.selectedThread = refreshed;
          }
          toast(`Règle retirée : ${dom}`);
          render();
        } catch (error) {
          toast(tauriErrorMessage(error));
        }
      })();
      break;
    }
    case "settings-select-account": {
      const id = element?.dataset.accountId?.trim();
      if (!id) break;
      skipAccountIdentityCaptureOnce = true;
      clearDiscoveredServerSnap();
      state.settingsSelectedAccountId = id;
      accountFieldTouched.serverFields = false;
      state.accountServersPanelOpen = true;
      state.oauthLockedEmail = null;
      state.accountFormOAuthPrefill = null;
      resetNewAccountSetupState();
      render();
      break;
    }
    case "settings-new-account":
      skipAccountIdentityCaptureOnce = true;
      clearDiscoveredServerSnap();
      state.settingsSelectedAccountId = "new";
      accountFieldTouched.serverFields = false;
      resetNewAccountSetupState();
      render();
      break;
    case "discover-mail-servers":
      void discoverMailServersAction();
      break;
    case "account-toggle-servers":
      state.accountServersPanelOpen = !state.accountServersPanelOpen;
      render();
      break;
    case "oauth-google-connect": {
      void (async () => {
        if (!isTauriRuntime()) {
          toast("OAuth2 : lancez l’application bureau Tauri.");
          return;
        }
        try {
          const o = await withTimeout(
            invoke<OAuthDesktopLoginOutcome>("oauth_google_desktop_login_cmd", {}),
            OAUTH_DESKTOP_LOGIN_TIMEOUT_MS,
          );
          warnOAuthEphemeralRedirect(o);
          const email = (o.email ?? "").trim();
          if (!email.includes("@")) {
            toast("OAuth Google : adresse e-mail absente ou invalide.");
            return;
          }
          skipAccountIdentityCaptureOnce = true;
          await finishOAuthNewAccountAfterLogin("oauthGoogle", email, (o.displayName ?? "").trim());
        } catch (e) {
          toast(tauriErrorMessage(e));
        }
      })();
      break;
    }
    case "oauth-microsoft-connect": {
      void (async () => {
        if (!isTauriRuntime()) {
          toast("OAuth2 : lancez l’application bureau Tauri.");
          return;
        }
        try {
          const o = await withTimeout(
            invoke<OAuthDesktopLoginOutcome>("oauth_microsoft_desktop_login_cmd", {}),
            OAUTH_DESKTOP_LOGIN_TIMEOUT_MS,
          );
          warnOAuthEphemeralRedirect(o);
          const email = (o.email ?? "").trim();
          if (!email.includes("@")) {
            toast("OAuth Microsoft : adresse e-mail absente ou invalide.");
            return;
          }
          skipAccountIdentityCaptureOnce = true;
          await finishOAuthNewAccountAfterLogin("oauthMicrosoft", email, (o.displayName ?? "").trim());
        } catch (e) {
          toast(tauriErrorMessage(e));
        }
      })();
      break;
    }
    case "account-auth-password-mode":
      clearAccountOAuthWizard();
      state.accountPasswordSetupExpanded = true;
      state.accountFormAuthKind = "password";
      state.oauthLockedEmail = null;
      state.accountFormOAuthPrefill = null;
      state.accountServersPanelOpen = false;
      render();
      break;
    case "oauth-wizard-retry": {
      const retry = state.accountOAuthWizardRetry;
      if (!retry || (retry.authKind !== "oauthGoogle" && retry.authKind !== "oauthMicrosoft")) break;
      clearAccountOAuthWizard();
      void finishOAuthNewAccountAfterLogin(retry.authKind, retry.email, retry.displayName);
      break;
    }
    case "delete-settings-account":
      void deleteSettingsAccount();
      break;
    case "back":
    case "nav-back":
      void goBack();
      break;
    case "nav-crumb": {
      const raw = element?.dataset.navIndex ?? "";
      const idx = Number.parseInt(raw, 10);
      if (Number.isNaN(idx)) break;
      void navigateToBreadcrumbIndex(idx);
      break;
    }
    case "nav-inbox":
      navigateToInbox();
      break;
    case "toggle-ai-quick-panel":
      state.aiQuickPanelOpen = !state.aiQuickPanelOpen;
      render();
      break;
    case "toggle-thread-quick-reply": {
      state.threadQuickReplyOpen = !state.threadQuickReplyOpen;
      render();
      if (state.threadQuickReplyOpen) {
        window.setTimeout(() => {
          document.querySelector<HTMLInputElement>("[data-quick-reply]")?.focus();
        }, 340);
      }
      break;
    }
    case "ai-features-all-on":
      setAllAiFeatures(state.appPrefs.ai, true);
      state.appPrefs.ai = normalizeAiPrefsMerged(state.appPrefs.ai);
      void (async () => {
        try {
          await persistAiFeaturePrefs();
          toast("Toutes les fonctionnalités IA activées.");
        } catch (e) {
          toast(tauriErrorMessage(e));
        }
        render();
      })();
      break;
    case "ai-features-all-off":
      setAllAiFeatures(state.appPrefs.ai, false);
      state.appPrefs.ai = normalizeAiPrefsMerged(state.appPrefs.ai);
      void (async () => {
        try {
          await persistAiFeaturePrefs();
          toast("Toutes les fonctionnalités IA désactivées.");
        } catch (e) {
          toast(tauriErrorMessage(e));
        }
        render();
      })();
      break;
    case "toggle-ai": {
      if (mailboxDigestSlotInList()) {
        dismissMailboxDigestPanel();
        break;
      }
      if (state.aiOpen) state.aiOpen = false;
      else if (state.view === "thread" || state.view === "list") state.aiOpen = true;
      render();
      break;
    }
    case "open-quote-fold": {
      const mid = element?.dataset.msgId?.trim();
      if (!mid || !state.selectedThread) break;
      const msg = state.selectedThread.messages.find((x) => x.messageId === mid);
      const raw = msg?.collapsedQuotes ?? [];
      if (!raw.length) break;
      const merged = groupCollapsedQuotesByAttribution(raw);
      if (!merged.length) break;
      state.quoteFoldModal = {
        senderLabel: (msg?.sender ?? "").trim() || mid,
        blocks: merged,
        foldedLines: raw.length
      };
      render();
      break;
    }
    case "close-quote-fold":
      state.quoteFoldModal = null;
      render();
      break;
    case "open-thread-tags":
      if (state.view === "thread" && state.selectedThread) {
        state.threadTagsModalOpen = !state.threadTagsModalOpen;
        render();
      }
      break;
    case "close-thread-tags":
      state.threadTagsModalOpen = false;
      render();
      break;
    case "search-from-tag": {
      const family = element?.dataset.tagFamily?.trim();
      const value = element?.dataset.tagValue?.trim();
      if (!family || !value) break;
      launchTagMailSearch({ family: tagFamilyForInvoke(family), value });
      break;
    }
    case "close-image-modal":
      if (state.imageModal?.revokeObjectUrl) URL.revokeObjectURL(state.imageModal.revokeObjectUrl);
      state.imageModal = null;
      render();
      break;
    case "toggle-message-view":
      if (!ENABLE_CLEAN_MESSAGE_VIEW) return;
      state.messageViewMode = state.messageViewMode === "clean" ? "original" : "clean";
      render();
      break;
    case "reply":
      await prepareReply();
      break;
    case "reply-one":
      await prepareReplyToMessage(element?.dataset.msgId ?? "");
      break;
    case "reply-all":
      await prepareReplyAll();
      break;
    case "forward":
      await prepareForward();
      break;
    case "forward-one":
      await prepareForwardToMessage(element?.dataset.msgId ?? "");
      break;
    case "download-all-attachments": {
      const mid = element?.dataset.msgId?.trim();
      if (mid) void downloadAllAttachmentsForMessage(mid);
      break;
    }
    case "contacts-entity-open": {
      const href = element?.dataset.href?.trim();
      if (href) void openExternalFromMailHref(href);
      break;
    }
    case "contacts-entity-mailto": {
      const email = element?.dataset.email?.trim();
      if (email) void openExternalFromMailHref(`mailto:${email}`);
      break;
    }
    case "mail-unsubscribe-open": {
      const href = decodeHtmlEntitiesLoose(element?.dataset.href?.trim() ?? "");
      const normalized = normalizeMailHrefForOpen(href);
      if (normalized) void openExternalFromMailHref(normalized);
      else toast("Lien de désabonnement invalide.");
      break;
    }
    case "close-compose":
      void finalizeCloseComposeFromUser();
      break;
    case "close-close-compose-modal":
      state.closeComposeModal = null;
      render();
      break;
    case "close-compose-without-saving":
      state.closeComposeModal = null;
      clearDraftSession();
      if (navCanGoBack()) void goBack();
      else {
        state.view = state.selectedThread ? "thread" : "list";
        render();
      }
      break;
    case "save-and-close-compose": {
      void (async () => {
        state.closeComposeModal = null;
        render();
        const ok = await saveDraftToSavedListNow({ silentToast: true });
        if (ok) {
          toast("Ajouté à « Sauvés », compositeur fermé.");
          clearDraftSession();
          if (navCanGoBack()) await goBack();
          else {
            state.view = state.selectedThread ? "thread" : "list";
            render();
          }
        }
      })();
      break;
    }
    case "toggle-sidebar":
      if (state.view === "compose") break;
      state.sidebarCollapsed = !state.sidebarCollapsed;
      writeSidebarCollapsedPreference(state.sidebarCollapsed);
      render();
      break;
    case "leave-saved-drafts-mailbox":
      void (async () => {
        await switchMailbox(pickImapMailboxFallback());
      })();
      break;
    case "refresh-draft-history":
      void refreshDraftRevisions(60);
      break;
    case "toggle-draft-versions-expanded":
      if (!isTauriRuntime()) break;
      state.draftVersionsListExpanded = !state.draftVersionsListExpanded;
      render();
      break;
    case "compare-draft-revision": {
      const revisionId = element?.dataset.revisionId?.trim() ?? "";
      if (!revisionId) break;
      void computeDraftDiffAgainstRevision(revisionId);
      break;
    }
    case "toggle-draft-compare-view":
      state.draftDiffView = state.draftDiffView === "preview" ? "diff" : "preview";
      render();
      break;
    case "restore-draft-revision": {
      if (!isTauriRuntime()) break;
      const revisionId = element?.dataset.revisionId?.trim() ?? "";
      const accountId = currentAccount()?.id?.trim() ?? "";
      if (!revisionId || !accountId) break;
      void (async () => {
        const ok = await openConfirmModal({
          title: "Restaurer cette version ?",
          body: "Le contenu actuel du compositeur sera remplacé par cette révision.",
          confirmLabel: "Restaurer",
        });
        if (!ok) return;
        try {
          const wasHistoriqueLayout = state.composeLayout === "historique";
          const restored = await withTimeout(
            invoke<Draft | null>("draft_revision_restore", { accountId, revisionId }),
            MAIL_ACTION_TIMEOUT_MS
          );
          if (!restored) {
            toast("Cette version n’existe plus.");
            return;
          }
          state.draft = restored;
          loadComposeMarkdownIntoEditor(restored.markdownBody);
          enterComposeView({ skipHistory: true });
          state.composeLayout = wasHistoriqueLayout ? "historique" : "split";
          syncPreviewOpenFromComposeLayout();
          resetMarkdownEditorHistory();
          render();
          if (wasHistoriqueLayout) {
            void refreshDraftRevisions(60);
            void computeDraftDiffAgainstRevision(revisionId);
          } else {
            window.setTimeout(() => void computePreview(), 0);
          }
          scheduleDraftRevisionSave(450);
        } catch (error) {
          console.error("draft_revision_restore", error);
          toast(`Restauration impossible: ${tauriErrorMessage(error)}`);
        }
      })();
      break;
    }
    case "toggle-preview":
      await cycleComposeLayout();
      break;
    case "set-compose-layout": {
      const raw = element?.dataset.composeLayout?.trim();
      if (raw !== "split" && raw !== "write" && raw !== "preview" && raw !== "historique") break;
      if (raw === "historique" && !isTauriRuntime()) break;
      state.composeLayout = raw;
      syncPreviewOpenFromComposeLayout();
      render();
      if (raw === "historique") void refreshDraftRevisions(60);
      if (state.composeLayout !== "write" && state.composeLayout !== "historique") {
        window.setTimeout(() => void computePreview(), 0);
      }
      break;
    }
    case "toggle-compose-advanced":
      state.composeAdvancedOpen = !state.composeAdvancedOpen;
      render();
      break;
    case "toggle-compose-cc-bcc": {
      if (draftHasRecipientsExtra(state.draft)) break;
      state.composeCcBccOpen = !state.composeCcBccOpen;
      render();
      break;
    }
    case "send":
      await sendDraft();
      break;
    case "cancel-split-send":
      state.splitSendConfirm = null;
      state.composeMessage = "";
      render();
      break;
    case "confirm-split-send":
      void confirmAndExecuteSplitSend();
      break;
    case "pick-attachments":
      await pickAttachments();
      break;
    case "clear-attachments":
      clearAttachments();
      break;
    case "remove-attachment":
      removeAttachment(element?.dataset.path ?? "");
      break;
    case "quick-reply-send":
      await sendQuickReply("reply");
      break;
    case "quick-reply-send-all":
      await sendQuickReply("reply-all");
      break;
    case "quick-reply-compose": {
      const qrRaw = element?.dataset.qrIndex;
      if (qrRaw !== undefined && qrRaw !== "") {
        const idx = Number(qrRaw);
        const s = state.quickReplySuggestions[idx];
        if (!s?.text) break;
        state.composeGrammarSuggestions = null;
        await prepareReply();
        const add = `${s.text.trim()}\n\n`;
        state.composeBody = `${add}${state.composeBody}`;
        state.composeCanonicalBody = state.composeBody;
        const ta = document.querySelector<HTMLTextAreaElement>("#compose-body");
        if (ta) ta.value = state.composeBody;
        void computePreview();
        toast("Texte inséré dans le compositeur.");
        render();
      } else {
        await prepareReply();
      }
      break;
    }
    case "summarize":
      await summarizeThread();
      break;
    case "llm-translate-thread":
      void llmTranslateThreadUi();
      break;
    case "llm-translate-message": {
      const mid = element?.dataset.msgId?.trim();
      if (mid) void llmTranslateMessageUi(mid, element?.dataset.llmTranslateRefresh === "1");
      break;
    }
    case "llm-quick-replies-thread":
      void llmQuickRepliesThreadUi();
      break;
    case "llm-inbox-digest":
      void llmInboxDigestUi();
      break;
    case "demo-reset-playground": {
      if (!isTauriRuntime()) {
        toast("Démo : lance l’app via Tauri (`npm run tauri:dev`), pas le navigateur seul.");
        break;
      }
      try {
        const msg = await invoke<string>("demo_reset_playground_mailbox");
        toast(msg);
        const ok = await loadAccountsFromBackend({ silent: false });
        if (!ok) toast("Rechargement des comptes incomplet — vérifie la liste.");
        const DEMO = "playground@demo.rustymail.app";
        if (state.accounts.some((a) => a.id === DEMO)) {
          state.selectedAccountId = DEMO;
          state.view = "list";
          state.selectedMailbox = "INBOX";
          await loadMailView(false);
          await loadMailboxUnread();
        }
        render();
      } catch (e) {
        console.error("demo_reset_playground_mailbox", e);
        toast(tauriErrorMessage(e));
      }
      break;
    }
    case "demo-remove-playground": {
      if (!isTauriRuntime()) {
        toast("Démo : lance l’app via Tauri (`npm run tauri:dev`), pas le navigateur seul.");
        break;
      }
      const confirmed = await openConfirmModal({
        title: "Supprimer la boîte démo ?",
        body:
          "Le compte playground@demo.rustymail.app et toutes ses données locales seront effacés (messages, cache, index sémantique pour ce compte, mot de passe factice dans le trousseau). Vous pourrez ensuite configurer un compte IMAP réel dans Paramètres → Comptes. Les modèles IA téléchargés (MiniLM, GGUF) restent sur disque.",
        danger: true,
        confirmLabel: "Supprimer la démo",
      });
      if (!confirmed) break;
      try {
        const msg = await invoke<string>("demo_remove_playground_mailbox");
        toast(msg);
        const DEMO = "playground@demo.rustymail.app";
        const ok = await loadAccountsFromBackend({ silent: false });
        if (!ok) toast("Rechargement des comptes incomplet — vérifie la liste.");
        if (state.selectedAccountId === DEMO) {
          state.selectedAccountId = state.accounts[0]?.id ?? "";
        }
        if (state.settingsSelectedAccountId === DEMO) {
          state.settingsSelectedAccountId = state.accounts[0]?.id ?? "new";
        }
        if (state.accounts.length > 0 && state.selectedAccountId) {
          state.view = "list";
          state.selectedMailbox = "INBOX";
          await loadMailView(false);
          await loadMailboxUnread();
        } else {
          state.view = "settings";
          state.settingsTab = "accounts";
        }
        render();
      } catch (e) {
        console.error("demo_remove_playground_mailbox", e);
        toast(tauriErrorMessage(e));
      }
      break;
    }
    case "toggle-mailbox-digest-panel":
      if (mailboxDigestSlotInList()) {
        dismissMailboxDigestPanel();
      } else {
        void llmInboxDigestUi();
      }
      break;
    case "compose-ai-rewrite": {
      const st = element?.dataset.rewriteStyle ?? "Formal";
      void composeAiRewrite(st);
      break;
    }
    case "compose-ai-rewrite-selected-tone":
      void composeAiRewrite(composeRewriteStyleFromTone());
      break;
    case "compose-ai-grammar":
      void composeAiGrammar();
      break;
    case "compose-grammar-dismiss":
      state.composeGrammarSuggestions = null;
      render();
      break;
    case "compose-grammar-apply": {
      const gi = Number(element?.dataset.grammarI ?? "");
      const g = state.composeGrammarSuggestions?.[gi];
      if (!g) break;
      const ta = document.querySelector<HTMLTextAreaElement>("#compose-body");
      const src = ta?.value ?? state.composeBody;
      const o = g.original ?? "";
      const r = g.replacement ?? "";
      if (!o) break;
      const next = src.replace(o, r);
      state.composeBody = next;
      state.composeCanonicalBody = next;
      if (ta) ta.value = next;
      void computePreview();
      toast("Remplacement appliqué (première occurrence).");
      render();
      break;
    }
    case "open-search-modal":
      openSearchModal();
      break;
    case "close-search-modal":
      closeSearchModal();
      break;
    case "search-modal-commit":
      commitSearchQuery({ fromModal: true });
      break;
    case "search-nl-assist":
      void searchNlAssist();
      break;
    case "llm-cancel-job":
      cancelLlmQueueJob();
      toast("Annulation demandée…");
      break;
    case "llm-qa-thread":
      void llmQaThreadUi();
      break;
    case "llm-qa-clear":
      state.threadQaAnswer = null;
      state.threadQaStreamText = "";
      render();
      break;
    case "qa-open-message": {
      const mid = element?.dataset.msgId?.trim();
      if (mid) scrollToThreadMessage(mid);
      break;
    }
    case "address-book-refresh":
      void refreshAddressBookList().then(() => render());
      break;
    case "reindex-address-book": {
      void (async () => {
        const acc = currentAccount();
        if (!acc?.id || !isTauriRuntime()) {
          toast("Réindexation : compte ou Tauri requis.");
          return;
        }
        try {
          const res = await invoke<{ messagesProcessed: number }>("reindex_address_contacts_cmd", {
            accountId: acc.id,
          });
          toast(`Carnet réindexé (${res?.messagesProcessed ?? 0} messages traités).`);
          await refreshAddressBookList();
          await loadAddressBookSidebarCount();
          render();
        } catch (e) {
          toast(tauriErrorMessage(e));
        }
      })();
      break;
    }
    case "address-book-edit": {
      addressBookEditEmail = element?.dataset.email?.trim() ?? null;
      render();
      break;
    }
    case "address-book-cancel-edit":
      addressBookEditEmail = null;
      render();
      break;
    case "address-book-save": {
      void (async () => {
        const acc = currentAccount();
        if (!acc?.id || !isTauriRuntime()) return;
        const email = document.querySelector<HTMLInputElement>("#ab-edit-email")?.value?.trim() ?? "";
        const displayName = document.querySelector<HTMLInputElement>("#ab-edit-name")?.value?.trim() ?? "";
        const notes = document.querySelector<HTMLTextAreaElement>("#ab-edit-notes")?.value?.trim() ?? "";
        const isFavorite = Boolean(document.querySelector<HTMLInputElement>("#ab-edit-fav")?.checked);
        try {
          await invoke("upsert_manual_contact_cmd", {
            payload: { accountId: acc.id, email, displayName, notes, isFavorite },
          });
          addressBookEditEmail = null;
          await refreshAddressBookList();
          toast("Contact enregistré.");
          render();
        } catch (e) {
          toast(tauriErrorMessage(e));
        }
      })();
      break;
    }
    case "address-book-delete": {
      void (async () => {
        const acc = currentAccount();
        const email = element?.dataset.email?.trim();
        if (!acc?.id || !email) return;
        try {
          await invoke<boolean>("delete_manual_contact_cmd", { accountId: acc.id, email });
          await refreshAddressBookList();
          toast("Contact supprimé.");
          render();
        } catch (e) {
          toast(tauriErrorMessage(e));
        }
      })();
      break;
    }
    case "address-book-toggle-fav": {
      void (async () => {
        const acc = currentAccount();
        const email = element?.dataset.email?.trim();
        const row = addressBookRowsCache.find((r) => r.email === email);
        if (!acc?.id || !email || !row) return;
        try {
          await invoke("upsert_manual_contact_cmd", {
            payload: {
              accountId: acc.id,
              email,
              displayName: row.displayName,
              notes: row.notes,
              isFavorite: !row.isFavorite,
            },
          });
          await refreshAddressBookList();
          render();
        } catch (e) {
          toast(tauriErrorMessage(e));
        }
      })();
      break;
    }
    case "open-contacts-view":
      void openContactsView();
      break;
    case "open-organization-view":
      void openOrganizationView();
      break;
    case "open-organization-v2-view":
      void openOrganizationV2View();
      break;
    case "open-folder-manager-view":
      state.mailboxManageOpen = false;
      void openFolderManagerView();
      break;
    case "fm-refresh":
      void refreshFolderManagerTree();
      break;
    case "fm-create-root":
      void fmCreateMailbox();
      break;
    case "fm-create-child": {
      const parent = element?.dataset.mailbox?.trim();
      if (parent) void fmCreateMailbox(parent);
      break;
    }
    case "fm-select": {
      const mb = element?.dataset.mailbox?.trim();
      if (mb) void fmSelectMailbox(mb);
      break;
    }
    case "fm-sync": {
      const mb = element?.dataset.mailbox?.trim();
      if (mb) void fmSyncMailbox(mb);
      break;
    }
    case "fm-archive": {
      const mb = element?.dataset.mailbox?.trim();
      if (!mb) return;
      state.folderManager.pendingArchiveMailbox = mb;
      state.folderManager.archiveRemember = (state.folderManager.report?.autoArchiveMailboxes ?? []).some(
        (m) => m.toLowerCase() === mb.toLowerCase(),
      );
      state.folderManager.archiveConfirmOpen = true;
      render();
      break;
    }
    case "fm-archive-cancel":
      state.folderManager.archiveConfirmOpen = false;
      state.folderManager.pendingArchiveMailbox = null;
      render();
      break;
    case "fm-archive-remember-toggle":
      state.folderManager.archiveRemember = Boolean(
        document.querySelector<HTMLInputElement>("#fm-archive-remember")?.checked,
      );
      break;
    case "fm-archive-confirm":
      void fmConfirmArchiveMailbox();
      break;
    case "fm-delete": {
      const mb = element?.dataset.mailbox?.trim();
      if (!mb) return;
      state.folderManager.pendingDeleteMailbox = mb;
      state.folderManager.deleteConfirmOpen = true;
      state.folderManager.deleteConfirmChecked = false;
      render();
      break;
    }
    case "fm-delete-cancel":
      state.folderManager.deleteConfirmOpen = false;
      state.folderManager.pendingDeleteMailbox = null;
      state.folderManager.deleteConfirmChecked = false;
      render();
      break;
    case "fm-delete-check-toggle":
      state.folderManager.deleteConfirmChecked = Boolean(
        document.querySelector<HTMLInputElement>("#fm-delete-check")?.checked,
      );
      render();
      break;
    case "fm-delete-confirm":
      void fmConfirmDeleteMailbox();
      break;
    case "fm-toggle-lock": {
      const acc = currentAccount();
      const mb = element?.dataset.mailbox?.trim();
      if (!acc?.id || !mb) return;
      const locked = element?.dataset.locked === "1";
      void setMailboxLocked(acc.id, mb, !locked)
        .then(async (list) => {
          if (state.folderManager.report) state.folderManager.report.lockedMailboxes = list;
          render();
        })
        .catch((e) => toast(tauriErrorMessage(e)));
      break;
    }
    case "fm-toggle-node": {
      const key = element?.dataset.nodeKey?.trim();
      if (!key) return;
      const cur = state.folderManager.expandedNodes[key];
      state.folderManager.expandedNodes[key] = cur === true ? false : true;
      saveFolderTreeExpanded(state.folderManager.expandedNodes);
      render();
      break;
    }
    case "fm-open-inbox": {
      const mb = element?.dataset.mailbox?.trim();
      if (mb) void openOrganizationMailbox(mb);
      break;
    }
    case "org-v2-scan": {
      const acc = currentAccount();
      if (!acc?.id) return;
      state.organizationV2.scanning = true;
      state.organizationV2.applyMessage = "Analyse V2…";
      render();
      void orgV2ScanAccount(acc.id)
        .then((report) => {
          state.organizationV2.report = report;
          state.organizationV2.scanning = false;
          state.organizationV2.applyMessage = `${report.proposals.length} action(s).`;
          render();
        })
        .catch((e) => {
          state.organizationV2.scanning = false;
          state.organizationV2.applyMessage = "";
          toast(tauriErrorMessage(e));
          render();
        });
      break;
    }
    case "org-v2-dismiss": {
      const pid = element?.dataset.proposalId?.trim();
      if (pid) void orgV2DismissProposal(pid);
      break;
    }
    case "org-v2-snooze": {
      const pid = element?.dataset.proposalId?.trim();
      if (pid) void orgV2SnoozeProposal(pid);
      break;
    }
    case "org-v2-apply": {
      const acc = currentAccount();
      const proposalId = element?.dataset.proposalId?.trim();
      if (!acc?.id || !proposalId) return;
      if (element?.dataset.trash === "1") {
        state.organizationV2.trashConfirmOpen = true;
        state.organizationV2.pendingTrashProposalId = proposalId;
        state.organizationV2.pendingTrashActionOverride = null;
        render();
        return;
      }
      if (element?.dataset.deleteMailbox === "1") {
        state.organizationV2.deleteMailboxConfirmOpen = true;
        state.organizationV2.pendingDeleteMailboxProposalId = proposalId;
        render();
        return;
      }
      const applyProposal = state.organizationV2.report?.proposals.find((p) => p.id === proposalId);
      if (!applyProposal) {
        toast("Proposition introuvable — relancez l’analyse.");
        break;
      }
      void confirmThenRunOrgV2Apply(acc.id, proposalId);
      break;
    }
    case "org-v2-trash-cancel":
      state.organizationV2.trashConfirmOpen = false;
      state.organizationV2.pendingTrashProposalId = null;
      state.organizationV2.pendingTrashActionOverride = null;
      render();
      break;
    case "org-v2-trash-confirm": {
      const acc = currentAccount();
      const pid = state.organizationV2.pendingTrashProposalId;
      if (!acc?.id || !pid) return;
      const override = state.organizationV2.pendingTrashActionOverride;
      state.organizationV2.trashConfirmOpen = false;
      state.organizationV2.pendingTrashProposalId = null;
      state.organizationV2.pendingTrashActionOverride = null;
      render();
      const trashProposal = state.organizationV2.report?.proposals.find((p) => p.id === pid);
      if (!trashProposal) {
        toast("Proposition introuvable — relancez l’analyse.");
        break;
      }
      void runOrgV2Apply(acc.id, trashProposal, "bulk-trash-org", override ?? undefined);
      break;
    }
    case "org-v2-delete-mailbox-cancel":
      state.organizationV2.deleteMailboxConfirmOpen = false;
      state.organizationV2.pendingDeleteMailboxProposalId = null;
      render();
      break;
    case "org-v2-delete-mailbox-confirm": {
      const acc = currentAccount();
      const pid = state.organizationV2.pendingDeleteMailboxProposalId;
      if (!acc?.id || !pid) return;
      state.organizationV2.deleteMailboxConfirmOpen = false;
      state.organizationV2.pendingDeleteMailboxProposalId = null;
      render();
      const delMbProposal = state.organizationV2.report?.proposals.find((p) => p.id === pid);
      if (!delMbProposal) {
        toast("Proposition introuvable — relancez l’analyse.");
        break;
      }
      void runOrgV2Apply(acc.id, delMbProposal, undefined, undefined, "delete-mailbox");
      break;
    }
    case "org-v2-ignore-mailbox":
    case "org-v2-unignore-mailbox":
      break;
    case "org-scan": {
      const acc = currentAccount();
      if (!acc?.id) return;
      state.organization.scanning = true;
      state.organization.applyMessage = "Analyse de la boîte (structure, propositions)…";
      render();
      void orgScanAccount(acc.id, Boolean(state.appPrefs.ai.featureOrgProposalsEnabled))
        .then((report) => {
          state.organization.report = report;
          state.organization.scanning = false;
          state.organization.applyMessage = `${report.proposals.length} proposition(s).`;
          render();
        })
        .catch((e) => {
          state.organization.scanning = false;
          state.organization.applyMessage = "";
          toast(tauriErrorMessage(e));
          render();
        });
      break;
    }
    case "org-open-mailbox": {
      const mb = element?.dataset.mailbox?.trim();
      if (mb) void openOrganizationMailbox(mb);
      break;
    }
    case "org-sync-mailbox":
    case "org-delete-mailbox-one":
      break;
    case "org-apply-trash": {
      const acc = currentAccount();
      const proposalId = element?.dataset.proposalId?.trim();
      if (!acc?.id || !proposalId) return;
      state.organization.trashConfirmOpen = true;
      state.organization.pendingTrashProposalId = proposalId;
      state.organization.pendingTrashActionOverride = "trash";
      render();
      break;
    }
    case "org-apply-archive": {
      const acc = currentAccount();
      const proposalId = element?.dataset.proposalId?.trim();
      if (!acc?.id || !proposalId) return;
      void confirmThenRunOrgApply(acc.id, proposalId, undefined, "archive");
      break;
    }
    case "org-apply": {
      const acc = currentAccount();
      const proposalId = element?.dataset.proposalId?.trim();
      if (!acc?.id || !proposalId) return;
      const isTrash = element?.dataset.trash === "1";
      if (isTrash) {
        state.organization.trashConfirmOpen = true;
        state.organization.pendingTrashProposalId = proposalId;
        state.organization.pendingTrashActionOverride = null;
        render();
        return;
      }
      if (element?.dataset.deleteMailbox === "1") {
        state.organization.deleteMailboxConfirmOpen = true;
        state.organization.pendingDeleteMailboxProposalId = proposalId;
        render();
        return;
      }
      void confirmThenRunOrgApply(acc.id, proposalId);
      break;
    }
    case "org-trash-cancel":
      state.organization.trashConfirmOpen = false;
      state.organization.pendingTrashProposalId = null;
      state.organization.pendingTrashActionOverride = null;
      render();
      break;
    case "org-trash-confirm": {
      const acc = currentAccount();
      const pid = state.organization.pendingTrashProposalId;
      if (!acc?.id || !pid) return;
      const override = state.organization.pendingTrashActionOverride;
      state.organization.trashConfirmOpen = false;
      state.organization.pendingTrashProposalId = null;
      state.organization.pendingTrashActionOverride = null;
      render();
      void runOrgApply(acc.id, pid, "bulk-trash-org", override ?? undefined);
      break;
    }
    case "org-delete-mailbox-cancel":
      state.organization.deleteMailboxConfirmOpen = false;
      state.organization.pendingDeleteMailboxProposalId = null;
      render();
      break;
    case "org-delete-mailbox-confirm": {
      const acc = currentAccount();
      const pid = state.organization.pendingDeleteMailboxProposalId;
      if (!acc?.id || !pid) return;
      state.organization.deleteMailboxConfirmOpen = false;
      state.organization.pendingDeleteMailboxProposalId = null;
      render();
      void runOrgApply(acc.id, pid, undefined, undefined, "delete-mailbox");
      break;
    }
    case "org-retag-all": {
      const acc = currentAccount();
      if (!acc?.id) return;
      state.organization.applying = true;
      state.organization.applyMessage = "Normalisation des tags en cours…";
      toast("Recalcul des tags sur tout le compte…");
      render();
      void orgRetagAccount(acc.id, false)
        .then(async (p) => {
          state.organization.applying = false;
          state.organization.applyMessage = p.message;
          toast(p.message);
          await refreshOrganizationReport();
          render();
        })
        .catch((e) => {
          state.organization.applying = false;
          state.organization.applyMessage = "";
          toast(tauriErrorMessage(e));
          render();
        });
      break;
    }
    case "contacts-back-list":
      if (navCanGoBack()) void goBack();
      else {
        state.view = "contacts";
        state.selectedContactEmail = undefined;
        render();
      }
      break;
    case "contacts-back-inbox":
      navigateToInbox();
      break;
    case "contacts-refresh-list": {
      const acc = currentAccount();
      if (acc?.id) {
        void loadContactsList(acc.id, { reset: true })
          .then(() => loadAddressBookSidebarCount())
          .then(() => render());
      }
      break;
    }
    case "contacts-load-more": {
      const acc = currentAccount();
      if (acc?.id) void loadContactsList(acc.id).then(() => render());
      break;
    }
    case "contacts-open-detail": {
      const email = element?.dataset.email?.trim();
      if (email) void openContactDetailView(email);
      break;
    }
    case "contacts-open-thread": {
      const tid = element?.dataset.threadId?.trim();
      if (tid) void openThread(tid);
      break;
    }
    case "contacts-compose": {
      const d = getContactDetail();
      const to = d?.email || state.selectedContactEmail;
      if (!to) break;
      enterComposeView();
      startNewDraftSession();
      state.draft = {
        id: "draft-local",
        kind: "New",
        to: [{ email: to }],
        cc: [],
        bcc: [],
        subject: "",
        markdownBody: "",
        sendHtml: true,
        inReplyTo: null,
        references: [],
        attachmentPaths: [],
        threadId: null,
      };
      state.composeBody = "";
      state.composeCanonicalBody = "";
      state.composeLayout = "split";
      syncPreviewOpenFromComposeLayout();
      state.preview = undefined;
      render();
      break;
    }
    case "contacts-toggle-fav": {
      const acc = currentAccount();
      const email = element?.dataset.email?.trim() || state.selectedContactEmail;
      const d = getContactDetail();
      if (!acc?.id || !email || !d) break;
      void (async () => {
        try {
          await invoke("upsert_manual_contact_cmd", {
            payload: {
              accountId: acc.id,
              email,
              displayName: d.displayName,
              notes: d.notes,
              isFavorite: !d.isFavorite,
            },
          });
          await loadContactDetail(acc.id, email);
          render();
        } catch (e) {
          toast(tauriErrorMessage(e));
        }
      })();
      break;
    }
    case "contacts-llm-profile": {
      if (!isAiFeatureEnabled(state.appPrefs.ai, "featureContactProfileEnabled")) {
        toast("Activez « Profil IA contact » dans les réglages IA.");
        break;
      }
      const acc = currentAccount();
      const email = element?.dataset.email?.trim() || state.selectedContactEmail;
      if (!acc?.id || !email) break;
      void (async () => {
        await loadContactProfile(acc.id!, email);
        render();
        toast("Profil IA chargé.");
      })();
      break;
    }
    case "contacts-search-domain": {
      const domain = element?.dataset.domain?.trim();
      if (domain) void launchDomainMailSearch(domain);
      break;
    }
    case "contacts-search-all":
    case "contacts-search-unread":
    case "contacts-search-focused":
    case "contacts-search-auto":
    case "contacts-search-keyword":
    case "contacts-search-hybrid": {
      const email = state.selectedContactEmail || getContactDetail()?.email;
      if (!email) break;
      const kwInput = document.querySelector<HTMLInputElement>("#contacts-search-keyword");
      if (kwInput) setContactsKeywordDraft(kwInput.value);
      const filter =
        action === "contacts-search-unread"
          ? "unread"
          : action === "contacts-search-focused"
            ? "focused"
            : action === "contacts-search-auto"
              ? "auto"
              : "all";
      launchContactMailSearch({
        email,
        listFilter: filter,
        text: getContactsKeywordDraft(),
        hybrid: action === "contacts-search-hybrid",
      });
      break;
    }
    case "address-book-export-vcard": {
      const acc = currentAccount();
      if (!acc?.id) {
        toast("Sélectionnez un compte.");
        break;
      }
      void (async () => {
        try {
          const path = await invoke<string>("export_address_contacts_vcard_cmd", {
            accountId: acc.id,
          });
          toast(`Carnet exporté : ${path}`);
        } catch (e) {
          const msg = tauriErrorMessage(e);
          if (!msg.toLowerCase().includes("annul")) toast(msg);
        }
      })();
      break;
    }
    case "address-book-import-vcard": {
      const acc = currentAccount();
      if (!acc?.id) {
        toast("Sélectionnez un compte.");
        break;
      }
      void (async () => {
        try {
          const res = await invoke<{ imported: number; skippedDuplicates: number; errors: string[] }>(
            "import_address_contacts_vcard_cmd",
            { payload: { accountId: acc.id, merge: true } }
          );
          await refreshAddressBookList();
          const errN = res.errors?.length ?? 0;
          toast(
            `Import : ${res.imported} contact(s), ${res.skippedDuplicates} ignoré(s)${errN ? `, ${errN} erreur(s)` : ""}.`
          );
        } catch (e) {
          const msg = tauriErrorMessage(e);
          if (!msg.toLowerCase().includes("annul")) toast(msg);
        }
      })();
      break;
    }
    case "agent-prepare-start":
      void agentPrepareReplyStart();
      break;
    case "agent-prepare-continue":
      void agentPrepareReplyContinue();
      break;
    case "agent-prepare-cancel":
      void stopAgentTelemetry().then(() => {
        state.agentSession = null;
        render();
      });
      break;
    case "agent-insert-compose":
      void agentInsertDraftIntoCompose();
      break;
    case "agent-append-slot": {
      const slot = element?.dataset.slot?.trim();
      if (slot) void agentInsertDraftIntoCompose(slot);
      break;
    }
    case "agent-append-all-slots": {
      const s = state.agentSession;
      if (s?.slots.length) void agentInsertDraftIntoCompose(s.slots.join("\n"));
      break;
    }
    case "summarize-sender-threads":
      void summarizeSenderThreadsLight();
      break;
    case "llm-quick-replies-compose":
      void llmQuickRepliesComposeUi();
      break;
    case "mic":
      await micAction({ target: "compose" });
      break;
    case "mic-thread-qa":
      await micAction({ target: "thread-qa" });
      break;
    case "save-account":
      await saveAccount();
      break;
    case "sync-inbox":
      void syncInbox({ background: state.view === "thread" });
      break;
    case "empty-trash-mailbox":
      void onEmptyTrashMailbox();
      break;
    case "bulk-trash-visible":
      void bulkTrashVisibleThreads();
      break;
    case "save-saved-search":
      void saveCurrentSearchView();
      break;
    case "clear-search-exit":
      void clearSearchAndReloadInbox();
      break;
    case "apply-saved-search": {
      const sid = element?.dataset.savedSearchId?.trim();
      if (sid) void applySavedSearchView(sid);
      break;
    }
    case "delete-saved-search": {
      const sid = element?.dataset.savedSearchId?.trim();
      if (sid) void deleteSavedSearchView(sid);
      break;
    }
    case "search-view-mark-read":
      void bulkMarkReadSearchViewThreads();
      break;
    case "search-view-archive":
      void bulkArchiveSearchViewThreads();
      break;
    case "search-view-open-organizer":
      void openOrganizationV2View();
      break;
    case "search-view-affiner":
      void runFluxAffinerFromSearchView();
      break;
    case "accept-view-suggestion": {
      const email = element?.dataset.senderEmail?.trim();
      if (email) void acceptSuggestedSavedView(email);
      break;
    }
    case "dismiss-view-suggestion": {
      const email = element?.dataset.senderEmail?.trim();
      if (email) void dismissSuggestedSavedView(email, "dismiss");
      break;
    }
    case "snooze-view-suggestion": {
      const email = element?.dataset.senderEmail?.trim();
      if (email) void dismissSuggestedSavedView(email, "snooze");
      break;
    }
    case "saved-search-mark-seen":
      void markActiveSavedSearchSeen({ toast: true });
      break;
    case "load-more":
      if (usesSearchContextLoader()) await loadThreadsForSearchContext(true);
      else await loadMailView(true);
      render();
      break;
    case "clear-search-text":
      state.search = "";
      state.searchDraft = "";
      if (!isSearchActive()) {
        void clearSearchAndReloadInbox();
      } else {
        void loadThreadsForSearchContext(false).then(() => render());
      }
      break;
    case "clear-search-list-filter":
      state.listFilter = "all";
      if (state.search.trim()) {
        void searchThreads();
      } else if (isSearchActive()) {
        void loadThreadsForSearchContext(false).then(() => render());
      } else {
        render();
      }
      break;
    case "clear-search-nl-filters":
      resetManualSearchNlFilters();
      if (!isSearchActive()) {
        void clearSearchAndReloadInbox();
      } else if (state.search.trim()) {
        void searchThreads();
      } else {
        void loadThreadsForSearchContext(false).then(() => render());
      }
      break;
    case "clear-search-sender":
      state.searchSenders = [];
      if (!isSearchActive()) {
        void clearSearchAndReloadInbox();
      } else if (state.search.trim() || state.searchTags.length > 0) {
        void searchThreads();
      } else {
        void loadThreadsForSearchContext(false).then(() => render());
      }
      break;
    case "clear-search-sender-one": {
      const email = element?.dataset.email?.trim().toLowerCase();
      if (email) state.searchSenders = state.searchSenders.filter((s) => s.toLowerCase() !== email);
      if (!isSearchActive()) void clearSearchAndReloadInbox();
      else if (state.search.trim() || state.searchSenders.length || state.searchTags.length) void searchThreads();
      else void loadThreadsForSearchContext(false).then(() => render());
      break;
    }
    case "clear-search-mailbox":
      state.searchMailboxPath = null;
      state.searchDraft = state.searchDraft
        .replace(/#(?:local|dossier|ici):(?:"[^"]*"|'[^']*'|[^\s#]+)/gi, "")
        .replace(/\s{2,}/g, " ")
        .trim();
      const searchInClear = document.querySelector<HTMLInputElement>("#search-input");
      if (searchInClear) searchInClear.value = state.searchDraft;
      if (!isSearchActive()) void clearSearchAndReloadInbox();
      else if (state.search.trim() || state.searchSenders.length || state.searchTags.length) void searchThreads();
      else void loadThreadsForSearchContext(false).then(() => render());
      break;
    case "clear-search-account":
      state.searchAccountOverrideId = null;
      if (!isSearchActive()) void clearSearchAndReloadInbox();
      else if (state.search.trim() || state.searchSenders.length || state.searchTags.length) void searchThreads();
      else void loadThreadsForSearchContext(false).then(() => render());
      break;
    case "clear-search-tag-one": {
      const raw = element?.dataset.tag?.trim().toLowerCase();
      if (raw) {
        state.searchTags = state.searchTags.filter((t) => `${String(t.family).toLowerCase()}:${t.value}`.toLowerCase() !== raw);
      }
      if (!isSearchActive()) void clearSearchAndReloadInbox();
      else if (state.search.trim() || state.searchSenders.length || state.searchTags.length) void searchThreads();
      else void loadThreadsForSearchContext(false).then(() => render());
      break;
    }
    case "clear-search-newsletter-rule":
      state.searchNewsletterRule = null;
      if (state.search.trim()) {
        void searchThreads();
      } else {
        void loadThreadsForSearchContext(false).then(() => render());
      }
      break;
    case "toggle-search-scope":
      state.searchScope = state.searchScope === "account" ? "mailbox" : "account";
      state.searchMailboxPath = null;
      toast(
        state.searchScope === "account"
          ? "Portée : tout le compte (tous les dossiers)"
          : `Portée : dossier affiché — ${threadMailboxListLabel(state.selectedMailbox || "INBOX").full}`
      );
      if (isSearchActive()) {
        if (state.search.trim() || state.searchSenders.length) void searchThreads();
        else void loadThreadsForSearchContext(false).then(() => render());
      } else {
        render();
      }
      break;
    case "list-filter-all":
      void applyListFilter("all");
      break;
    case "list-filter-unread":
      void applyListFilter("unread");
      break;
    case "list-filter-starred":
      void applyListFilter("starred");
      break;
    case "list-filter-focused":
      void applyListFilter("focused");
      break;
    case "list-filter-auto":
      void applyListFilter("auto");
      break;
    case "clear-mailbox-digest":
    case "dismiss-mailbox-digest":
      dismissMailboxDigestPanel();
      break;
    case "quick-reply-copy": {
      const idx = Number(element?.dataset.qrIndex ?? "");
      const s = state.quickReplySuggestions[idx];
      const t = s?.text?.trim();
      if (!t) break;
      void navigator.clipboard.writeText(t).then(
        () => toast("Copié dans le presse-papiers."),
        () => toast("Copie impossible (permission navigateur).")
      );
      break;
    }
    case "thread-trash-cur":
      if (state.selectedThreadId) void onThreadMove("trash", state.selectedThreadId);
      break;
    case "thread-archive-cur":
      if (state.selectedThreadId) void onThreadMove("archive", state.selectedThreadId);
      break;
    case "retag-thread": {
      const tid = element?.dataset.threadId?.trim() || state.selectedThreadId?.trim() || "";
      const accountId = state.selectedAccountId?.trim() || "";
      if (!tid || !accountId) break;
      if (!isTauriRuntime()) {
        toast("Recalcul des tags : disponible dans l’app Tauri.");
        break;
      }
      void (async () => {
        try {
          const n = await withTimeout(
            invoke<number>("org_retag_threads_cmd", {
              payload: { accountId, threadIds: [tid] },
            }),
            MAIL_ACTION_TIMEOUT_MS
          );
          toast(n > 0 ? "Tags mis à jour." : "Tags déjà à jour.");
          await openThread(tid, { skipHistory: true, preserveAi: true });
        } catch (err) {
          console.error("org_retag_threads_cmd", err);
          toast(tauriErrorMessage(err));
        }
      })();
      break;
    }
    case "toggle-thread-seen": {
      const tid = element?.dataset.threadId?.trim() ?? "";
      if (!tid) break;
      const row = state.threads.find((t) => String(t.id) === tid);
      void onThreadSeen(row?.unread ? "read" : "unread", tid);
      break;
    }
    case "toggle-thread-follow": {
      const tid = element?.dataset.threadId?.trim() ?? "";
      if (!tid) break;
      void onThreadToggleFollow(tid);
      break;
    }
    case "toggle-thread-seen-cur": {
      const tid = state.selectedThreadId;
      if (!tid) break;
      const row = state.threads.find((t) => String(t.id) === tid);
      const unreadNow = Boolean(row?.unread ?? state.selectedThread?.unread);
      void onThreadSeen(unreadNow ? "read" : "unread", tid);
      break;
    }
    case "thread-move-cur":
      if (state.selectedThreadId) openMoveDialog(state.selectedThreadId);
      break;
    case "close-move":
      state.moveOpen = false;
      state.moveThreadId = undefined;
      render();
      break;
    case "confirm-move":
      await confirmMoveDialog();
      break;
    case "open-mailbox-manage":
      state.mailboxManageOpen = true;
      render();
      break;
    case "close-mailbox-manage":
      state.mailboxManageOpen = false;
      render();
      break;
    case "mb-create":
      await mailboxManageAction("create");
      break;
    case "mb-rename":
      await mailboxManageAction("rename");
      break;
    case "mb-delete":
      await mailboxManageAction("delete");
      break;
    case "mb-subscribe":
      await mailboxManageAction("subscribe");
      break;
    case "save-saved-draft": {
      void (async () => {
        if (!isTauriRuntime()) {
          toast("Enregistrer dans la liste : lancez l’app Tauri.");
          return;
        }
        if (!state.draft) {
          toast("Aucun contenu à enregistrer.");
          return;
        }
        await saveDraftToSavedListNow();
      })();
      break;
    }
    case "delete-saved-draft": {
      const sid = element?.dataset.savedDraftId?.trim() ?? "";
      if (!sid) break;
      void (async () => {
        if (!isTauriRuntime()) return;
        const ok = await openConfirmModal({
          title: "Retirer ce brouillon ?",
          body: "Retirer ce brouillon de la liste enregistrée ? L’historique local des versions pour ce brouillon sera supprimé. Aucun mail IMAP n’est affecté.",
          danger: true,
          confirmLabel: "Retirer",
        });
        if (!ok) return;
        const accountId = currentAccount()?.id?.trim();
        if (!accountId) {
          toast("Aucun compte actif.");
          return;
        }
        try {
          await withTimeout(invoke("saved_draft_delete", { accountId, savedDraftId: sid }), MAIL_ACTION_TIMEOUT_MS);
          toast("Brouillon retiré de la liste.");
          await loadMailView(false);
          await refreshSavedDraftsMailboxCount();
          state.selectedThreadId = state.threads[0]?.id;
          state.selectedThread = undefined;
          render();
        } catch (e) {
          toast(tauriErrorMessage(e));
          render();
        }
      })();
      break;
    }
  }
}

function removeAttachment(path: string) {
  if (!state.draft) return;
  const p = path.trim();
  if (!p) return;
  state.draft.attachmentPaths = (state.draft.attachmentPaths ?? []).filter((x) => x !== p);
  const attachmentsField = document.querySelector<HTMLInputElement>("#compose-attachments");
  if (attachmentsField) attachmentsField.value = attachmentPathsJoinedForHiddenField(state.draft.attachmentPaths);
  render();
  scheduleDraftRevisionSave(250);
}

function fileBaseName(path: string) {
  const normalized = String(path).replace(/\\/g, "/");
  const last = normalized.split("/").pop() ?? normalized;
  return last || normalized;
}

async function pickAttachments() {
  if (!state.draft) return;
  if (!isTauriRuntime()) {
    toast("Ajouter des pièces jointes : disponible seulement dans l’app Tauri.");
    return;
  }
  try {
    const picked = await withTimeout(invoke<string[]>("pick_attachment_paths", {}), MAIL_ACTION_TIMEOUT_MS);
    if (!picked.length) return;
    const merged = Array.from(new Set([...(state.draft.attachmentPaths ?? []), ...picked]));
    state.draft.attachmentPaths = merged;
    toast(`${picked.length} pièce(s) jointe(s) ajoutée(s).`);
    render();
    scheduleDraftRevisionSave(250);
  } catch (error) {
    toast(`Picker PJ échoué: ${tauriErrorMessage(error)}`);
  }
}

function clearAttachments() {
  if (!state.draft) return;
  state.draft.attachmentPaths = [];
  toast("Pièces jointes supprimées.");
  render();
  scheduleDraftRevisionSave(250);
}

async function mailboxAction(kind: "create" | "rename" | "delete" | "subscribe") {
  const account = currentAccount();
  if (!account) {
    toast("Aucun compte actif.");
    return;
  }
  if (kind !== "create" && isSavedDraftsVirtualMailbox(state.selectedMailbox)) {
    toast("Choisissez un dossier IMAP pour gérer les boîtes.");
    return;
  }
  try {
    if (kind === "create") {
      const prefix = mailboxPathPrefixForCreate();
      const def = prefix || "";
      const bodyHint = [
        prefix ? `Préfixe suggéré depuis le dossier courant : ${prefix}` : "",
        `Hiérarchie avec /. Ex. sous « ${state.selectedMailbox || "INBOX"} ».`,
      ]
        .filter(Boolean)
        .join("\n");
      const mailbox =
        (await openTextPromptModal({
          title: "Créer un dossier IMAP",
          body: bodyHint,
          label: "Chemin du dossier",
          defaultValue: def,
        }))?.trim() ?? "";
      if (!mailbox) return;
      toast(await withTimeout(invoke<string>("create_imap_mailbox", { accountId: account.id, mailbox }), MAIL_ACTION_TIMEOUT_MS));
    } else if (kind === "rename") {
      const fromMailbox = state.selectedMailbox;
      const toMailbox =
        (await openTextPromptModal({
          title: "Renommer le dossier",
          body: `Dossier actuel : ${fromMailbox}`,
          label: "Nouveau chemin IMAP",
          defaultValue: "",
        }))?.trim() ?? "";
      if (!toMailbox) return;
      toast(await withTimeout(invoke<string>("rename_imap_mailbox", { accountId: account.id, fromMailbox, toMailbox }), MAIL_ACTION_TIMEOUT_MS));
      // Preserve exact mailbox spelling (leading spaces can be meaningful on some servers).
      state.selectedMailbox = toMailbox;
    } else if (kind === "delete") {
      const mailbox = state.selectedMailbox;
      const ok = await openConfirmModal({
        title: "Supprimer ce dossier IMAP ?",
        body: `La mailbox « ${mailbox} » sera supprimée côté serveur.`,
        danger: true,
        confirmLabel: "Supprimer",
      });
      if (!ok) return;
      toast(
        await withTimeout(
          invoke<string>("delete_imap_mailbox", {
            accountId: account.id,
            mailbox,
            destructiveAck: "delete-mailbox",
          }),
          MAIL_ACTION_TIMEOUT_MS
        )
      );
      state.selectedMailbox = "INBOX";
    } else {
      const mailbox = state.selectedMailbox;
      toast(await withTimeout(invoke<string>("subscribe_imap_mailbox", { accountId: account.id, mailbox }), MAIL_ACTION_TIMEOUT_MS));
    }
    state.mailboxes = await safeInvoke<string[]>("list_imap_mailboxes", { accountId: account.id }, [], BOOT_INVOKE_TIMEOUT_MS);
    ensureValidSelectedMailbox();
    await loadMailView(false);
    await loadMailboxUnread();
    state.selectedThreadId = state.threads[0]?.id;
    state.selectedThread = undefined;
    render();
  } catch (error) {
    toast(tauriErrorMessage(error));
  }
}

async function openSavedDraftById(savedDraftId: string) {
  const sdid = savedDraftId.trim();
  if (!sdid) return;
  if (!isTauriRuntime()) {
    toast("Ouvrir un brouillon enregistré : lancez l’app Tauri.");
    return;
  }
  const account = currentAccount();
  if (!account) {
    toast("Configurez d’abord un compte.");
    return;
  }
  try {
    const res = await withTimeout(
      invoke<SavedDraftOpenPayload>("saved_draft_open", { accountId: account.id, savedDraftId: sdid }),
      MAIL_ACTION_TIMEOUT_MS
    );
    enterComposeView();
    startNewDraftSession();
    state.draftSessionId = res.sessionId;
    state.savedDraftRecordId = res.savedDraftId;
    state.draft = res.draft;
    state.composeCcBccOpen = draftHasRecipientsExtra(res.draft);
    state.composeAdvancedOpen = false;
    state.composeLayout = "historique";
    syncPreviewOpenFromComposeLayout();
    resetMarkdownEditorHistory();
    loadComposeMarkdownIntoEditor(state.draft.markdownBody ?? "");
    state.preview = undefined;
    state.composeMessage = "";
    render();
    window.setTimeout(() => void computePreview(), 0);
    void refreshDraftRevisions(60);
    scheduleDraftRevisionSave(350);
  } catch (error) {
    console.error("saved_draft_open", error);
    toast(tauriErrorMessage(error));
    render();
  }
}

/** Marquer le fil comme lu lors de l’ouverture, sans liste de chargement ni toast. */
async function markOpenedThreadReadIfUnread(threadId: string): Promise<void> {
  if (savedDraftIdFromThreadId(threadId)) return;
  if (!isTauriRuntime()) return;
  const unread = Boolean(state.selectedThread?.unread);
  if (!unread) return;
  const account = currentAccount();
  const accountId = account?.id?.trim();
  if (!accountId) return;
  try {
    const mailbox = sourceMailboxForThread(threadId);
    await withTimeout(invoke<string>("thread_mark_read", { accountId, mailbox, threadId }), MAIL_ACTION_TIMEOUT_MS);
    if (state.selectedThread) state.selectedThread = { ...state.selectedThread, unread: false };
    const ti = state.threads.findIndex((t) => String(t.id) === String(threadId));
    if (ti >= 0) {
      state.threads[ti] = { ...state.threads[ti], unread: false };
    }
    await loadMailboxUnread();
  } catch (e) {
    console.warn("thread_mark_read (ouverture)", e);
  }
}

async function openThread(
  threadId: string,
  opts?: { preserveAi?: boolean; skipHistory?: boolean }
) {
  invalidateIdleAiCachePrefetch();
  const savedId = savedDraftIdFromThreadId(threadId);
  if (savedId) {
    await openSavedDraftById(savedId);
    return;
  }
  const tid = threadId.trim();
  if (!opts?.skipHistory) beginNavigation("thread");
  const prev = state.selectedThreadId;
  const keepAi =
    opts?.preserveAi &&
    threadAiSummaryScoped() &&
    threadIdsMatch(state.aiThreadScope, tid);
  if (String(prev) !== String(tid)) {
    state.threadQuickReplyOpen = false;
    state.threadTagsModalOpen = false;
    if (!keepAi) {
      clearThreadAiSummaryState();
      state.messageTranslations = {};
      state.messageTranslationBusy = {};
    }
  }
  state.selectedThreadId = tid;
  const opened = await fetchOpenThreadOrNotify(tid);
  if (!opened) {
    if (!opts?.skipHistory) navPop();
    state.selectedThread = undefined;
    state.view = "list";
    render();
    return;
  }
  state.selectedThread = opened;
  if (threadIsAutoMail(opened, tid)) {
    state.quickReplySuggestions = [];
    if (state.agentSession?.threadId === tid) {
      void stopAgentTelemetry();
      state.agentSession = null;
    }
  }
  if (state.aiOutput?.trim() && threadIdsMatch(state.aiThreadScope, tid)) {
    state.aiThreadScope = String(tid);
  }
  await markOpenedThreadReadIfUnread(tid);
  await loadNewsletterRules();
  state.view = "thread";
  startThreadActivityOpen(tid);
  if (isTauriRuntime()) void invoke("ai_user_activity_ping").catch(() => {});
  const hyd = state.selectedThread?.messages ?? [];
  if (isTauriRuntime() && hyd.length) void hydrateMessageTranslationsFromCacheForThread(hyd);
  for (const m of hyd) scheduleSecurityLlmAugment(m);
  void maybeAutoSummarizeThreadOnOpen(tid, opened);
  render();
}

async function maybeAutoSummarizeThreadOnOpen(
  threadId: string,
  thread: { messages?: Array<{ messageId?: string }> }
): Promise<void> {
  const ai = state.appPrefs.ai as AppPrefsAi & {
    featureAutoThreadSummaryEnabled?: boolean;
    autoThreadSummaryMinMessages?: number;
  };
  if (!ai.featureAutoThreadSummaryEnabled) return;
  if (senderBatchSummarizeActive) return;
  if (!isAiFeatureEnabled(state.appPrefs.ai, "featureThreadSummaryEnabled")) return;
  const min = ai.autoThreadSummaryMinMessages ?? 6;
  if ((thread.messages?.length ?? 0) < min) return;
  if (autoThreadSummaryDoneFor === threadId) return;
  autoThreadSummaryDoneFor = threadId;
  await summarizeThread();
}

function restoreSearchInputSelection(selStart: number, selEnd: number, genAtCapture: number) {
  const apply = () => {
    if (genAtCapture !== searchThreadsGeneration) return;
    const inp = document.querySelector<HTMLInputElement>("#search-input");
    if (!inp) return;
    inp.focus();
    const len = inp.value.length;
    try {
      inp.setSelectionRange(Math.min(selStart, len), Math.min(selEnd, len));
    } catch {
      /* type=search */
    }
  };
  requestAnimationFrame(() => requestAnimationFrame(apply));
}

async function searchThreads() {
  const gen = ++searchThreadsGeneration;

  const inputBefore = document.querySelector<HTMLInputElement>("#search-input");
  const searchHadFocus = document.activeElement === inputBefore;
  let selStart = state.searchDraft.length;
  let selEnd = selStart;
  if (searchHadFocus && inputBefore) {
    try {
      const a = inputBefore.selectionStart;
      const b = inputBefore.selectionEnd;
      if (typeof a === "number" && a >= 0) selStart = a;
      if (typeof b === "number" && b >= 0) selEnd = b;
    } catch {
      /* Safari / certains navigateurs avec type=search */
    }
  }

  if (isTauriRuntime() && isSavedDraftsVirtualMailbox(state.selectedMailbox)) {
    await loadMailView(false);
    const q = state.search.trim().toLowerCase();
    if (q) {
      state.threads = state.threads.filter((t) => {
        const subj = t.subject.toLowerCase();
        const who = (t.participants[0] ?? "").toLowerCase();
        return subj.includes(q) || who.includes(q);
      });
    }
    if (gen !== searchThreadsGeneration) return;
    render();
    if (!searchHadFocus) return;
    restoreSearchInputSelection(selStart, selEnd, gen);
    return;
  }

  const accountId = searchAccountIdForQuery();
  if (!accountId) {
    state.threads = [];
    if (gen !== searchThreadsGeneration) return;
    render();
    if (!searchHadFocus) return;
    restoreSearchInputSelection(selStart, selEnd, gen);
    return;
  }
  state.threads = filterRecentlyRemovedThreads(
    await safeInvoke<ThreadListItem[]>(
      "search_threads",
      {
        query: buildSearchQueryFromCurrentState(),
      },
      []
    ),
  );

  if (gen !== searchThreadsGeneration) {
    return;
  }

  render();

  // Recréé par `render()` : replacer la sélection après layout (double rAF).
  if (!searchHadFocus) return;
  restoreSearchInputSelection(selStart, selEnd, gen);
}

async function deleteSettingsAccount() {
  if (!isTauriRuntime()) {
    toast("La suppression du compte requiert l’app Tauri (npm run tauri:dev).");
    return;
  }
  const id = state.settingsSelectedAccountId;
  if (id === "new") return;
  const confirmed = await openConfirmModal({
    title: "Supprimer ce compte ?",
    body:
      "Toutes les données locales de ce compte seront effacées : messages, pièces jointes en base, cache IMAP, et index de recherche sémantique (vecteurs embeddings) pour ces messages. Le mot de passe IMAP/SMTP sera retiré du trousseau. Les modèles IA téléchargés (ex. MiniLM ONNX) restent sur le disque tant qu’un autre compte peut les réutiliser. Les règles anti-newsletter sont globales au profil : elles ne sont pas supprimées avec un seul compte. Les fichiers enregistrés ailleurs (ex. Téléchargements) ne sont pas effacés.",
    danger: true,
    confirmLabel: "Supprimer le compte",
  });
  if (!confirmed) return;

  try {
    await withTimeout(
      invoke("delete_account", { accountId: id, destructiveAck: "delete-account" }),
      ACCOUNT_INVOKE_TIMEOUT_MS
    );
    const rawAccounts = await withTimeout(invoke<unknown[]>("list_accounts", {}), ACCOUNT_INVOKE_TIMEOUT_MS);
    state.accounts = (Array.isArray(rawAccounts) ? rawAccounts : [])
      .map((row) => normalizeAccountRow(row))
      .filter((a): a is Account => a !== null);
    if (state.selectedAccountId === id) {
      state.selectedAccountId = state.accounts[0]?.id;
    }
    if ((state.appPrefs.general.defaultAccountId ?? "").trim() === id) {
      delete state.appPrefs.general.defaultAccountId;
      try {
        await withTimeout(invoke("set_app_prefs", { prefs: state.appPrefs }), MAIL_ACTION_TIMEOUT_MS);
      } catch {
        /* ignore */
      }
    }
    state.settingsSelectedAccountId = state.accounts[0]?.id ?? "new";
    state.accountMessage = "Compte supprimé.";
    if (isTauriRuntime()) {
      state.mailboxes = await safeInvoke<string[]>("list_imap_mailboxes", { accountId: currentAccount()?.id ?? null }, [], BOOT_INVOKE_TIMEOUT_MS);
      ensureValidSelectedMailbox();
      await loadMailView();
      await loadMailboxUnread();
    }
  } catch (error) {
    state.accountMessage = `Échec suppression : ${tauriErrorMessage(error)}`;
    console.error("delete_account", error);
    toast(state.accountMessage);
  }
  render();
}

function setOAuthWizardPhase(phase: OAuthAccountWizardPhase, message: string, error?: string | null) {
  state.accountOAuthWizardPhase = phase;
  state.accountOAuthWizardMessage = message;
  state.accountOAuthWizardError = error ?? null;
  render();
}

async function discoverServersSnapForEmail(
  email: string,
  authKind: MailAuthKind,
): Promise<{ snap: { imap: Account["imap"]; smtp: Account["smtp"] }; sourceLabel: string }> {
  accountFieldTouched.serverFields = false;
  let snap: { imap: Account["imap"]; smtp: Account["smtp"] } | null = null;
  let sourceLabel = "";

  const preset = applyDomainPresetIfSafe(email, {
    onApplied(_domain, p) {
      snap = serverSidesFromPreset(p);
      sourceLabel = "Préréglage domaine";
    },
  });
  if (preset && snap) {
    if (isTauriRuntime()) {
      try {
        const raw = await withTimeout(
          invoke<DiscoverMailServersResult>("discover_mail_servers", { email }),
          ACCOUNT_INVOKE_TIMEOUT_MS,
        );
        snap = serverSidesFromDiscovery(raw);
        sourceLabel = raw.sourceLabel;
      } catch {
        /* garde le préréglage */
      }
    }
    return { snap, sourceLabel };
  }

  if (isTauriRuntime()) {
    const raw = await withTimeout(
      invoke<DiscoverMailServersResult>("discover_mail_servers", { email }),
      ACCOUNT_INVOKE_TIMEOUT_MS,
    );
    return { snap: serverSidesFromDiscovery(raw), sourceLabel: raw.sourceLabel };
  }

  const fallback = oauthProviderFallbackPreset(authKind);
  if (!fallback) {
    throw new Error("Impossible de déterminer les serveurs IMAP/SMTP pour cette adresse.");
  }
  return { snap: serverSidesFromPreset(fallback), sourceLabel: "Préréglage fournisseur OAuth" };
}

async function saveAccountProgrammatic(profile: {
  displayName: string;
  email: string;
  authKind: MailAuthKind;
  imap: Account["imap"];
  smtp: Account["smtp"];
}): Promise<Account | null> {
  const emailNorm = profile.email.trim().toLowerCase();
  if (!profile.email.includes("@")) {
    throw new Error("E-mail invalide.");
  }
  if (state.accounts.some((a) => a.id === emailNorm)) {
    throw new Error("Ce compte existe déjà — sélectionnez-le dans la liste.");
  }
  const request = {
    displayName: profile.displayName.trim() || profile.email,
    email: profile.email.trim(),
    password: "",
    authKind: profile.authKind,
    imapHost: profile.imap.host,
    imapPort: profile.imap.port,
    imapSecurity: profile.imap.security,
    imapAllowInvalidTls: profile.imap.allowInvalidTls,
    smtpHost: profile.smtp.host,
    smtpPort: profile.smtp.port,
    smtpSecurity: profile.smtp.security,
    smtpAllowInvalidTls: profile.smtp.allowInvalidTls,
  };
  const savedRaw = await withTimeout(invoke<unknown>("save_account", { request }), ACCOUNT_INVOKE_TIMEOUT_MS);
  const saved = normalizeAccountRow(savedRaw);
  const rawAccounts = await withTimeout(invoke<unknown[]>("list_accounts", {}), ACCOUNT_INVOKE_TIMEOUT_MS);
  const accounts = (Array.isArray(rawAccounts) ? rawAccounts : [])
    .map((row) => normalizeAccountRow(row))
    .filter((a): a is Account => a !== null);
  state.accounts = accounts.length ? accounts : saved ? [saved] : [];
  if (saved) {
    if (!state.selectedAccountId || !state.accounts.some((a) => a.id === state.selectedAccountId)) {
      state.selectedAccountId = saved.id;
    }
    state.settingsSelectedAccountId = saved.id;
  }
  return saved;
}

async function finishOAuthNewAccountAfterLogin(
  authKind: "oauthGoogle" | "oauthMicrosoft",
  email: string,
  displayName: string,
): Promise<void> {
  if (!isTauriRuntime()) {
    toast("OAuth2 : lancez l’application bureau Tauri.");
    return;
  }

  const emailNorm = email.trim().toLowerCase();
  state.accountPasswordSetupExpanded = false;
  state.accountFormAuthKind = authKind;
  state.oauthLockedEmail = emailNorm;
  state.accountFormOAuthPrefill = { email: email.trim(), displayName: displayName.trim() };
  state.accountOAuthWizardRetry = { authKind, email: email.trim(), displayName: displayName.trim() };
  accountFieldTouched.serverFields = false;
  state.accountMessage = "";

  try {
    setOAuthWizardPhase("discover", `Détection des serveurs pour ${email.trim()}…`);
    const { snap, sourceLabel } = await discoverServersSnapForEmail(email.trim(), authKind);
    discoveredServersFormSnap = snap;
    state.accountMessage = sourceLabel;

    setOAuthWizardPhase("save", "Enregistrement du compte (SQLite + trousseau)…");
    const saved = await saveAccountProgrammatic({
      displayName: displayName.trim() || email.trim(),
      email: email.trim(),
      authKind,
      imap: snap.imap,
      smtp: snap.smtp,
    });
    if (!saved) {
      throw new Error("Enregistrement refusé par le serveur local.");
    }

    clearDiscoveredServerSnap();
    state.accountFormOAuthPrefill = null;
    state.oauthLockedEmail = null;

    state.selectedAccountId = saved.id;
    state.settingsSelectedAccountId = saved.id;
    state.listFilter = "all";
    state.search = "";
    state.searchDraft = "";
    state.searchSenders = [];
    state.searchTags = [];
    state.searchLanguageFilter = null;
    state.searchNewsletterRule = null;
    state.searchModifiersTouched = false;
    state.searchMailboxPath = null;
    state.searchNlMode = null;
    state.selectedThreadId = undefined;
    state.selectedThread = undefined;
    navigateToInbox({ resetStack: true });

    if (isTauriRuntime()) {
      state.mailboxes = await safeInvoke<string[]>("list_imap_mailboxes", { accountId: saved.id }, [], BOOT_INVOKE_TIMEOUT_MS);
      ensureValidSelectedMailbox();
    }

    setOAuthWizardPhase("sync", `Synchronisation de tous les dossiers · ${saved.email}…`);
    await syncInbox({ allMailboxes: true });

    clearAccountOAuthWizard();
    state.accountOAuthWizardRetry = null;
    state.accountMessage = `Compte ${saved.email} prêt.`;
    toast(`Compte ${saved.displayName || saved.email} ajouté et synchronisé.`);
    render();
  } catch (e) {
    const text = tauriErrorMessage(e);
    state.accountOAuthWizardPhase = "error";
    state.accountOAuthWizardMessage = "La configuration automatique a échoué.";
    state.accountOAuthWizardError = text;
    state.accountMessage = text;
    state.accountServersPanelOpen = true;
    toast(text);
    render();
  }
}

async function discoverMailServersAction(): Promise<void> {
  const emailRaw = inputValue("account-email").trim();
  if (!emailRaw.includes("@")) {
    toast("Saisissez une adresse e-mail complète avant la détection.");
    return;
  }
  if (accountFieldTouched.serverFields) {
    const ok = await openConfirmModal({
      title: "Remplacer les serveurs ?",
      body: "Les serveurs ont été modifiés à la main. Les remplacer par le résultat de la détection ?",
      confirmLabel: "Remplacer",
    });
    if (!ok) return;
    accountFieldTouched.serverFields = false;
  }

  if (!isTauriRuntime()) {
    const preset = applyDomainPresetIfSafe(emailRaw, {
      onApplied(domain, p) {
        discoveredServersFormSnap = serverSidesFromPreset(p);
        state.accountMessage = `Préréglage local (${domain}) — lancez RustyMail en mode bureau pour ISPDB, .well-known et autoconfig.`;
        accountFieldTouched.serverFields = false;
        state.accountServersPanelOpen = true;
        render();
      },
    });
    if (!preset) {
      toast("Aucun préréglage local pour ce domaine · lancement en application bureau nécessaire pour la détection automatique étendue.");
    }
    return;
  }

  try {
    toast("Détection des serveurs (ISPDB Mozilla, .well-known, autoconfig, préréglages locaux…)…");
    const raw = await withTimeout(
      invoke<DiscoverMailServersResult>("discover_mail_servers", { email: emailRaw }),
      ACCOUNT_INVOKE_TIMEOUT_MS,
    );
    discoveredServersFormSnap = serverSidesFromDiscovery(raw);
    accountFieldTouched.serverFields = false;
    state.accountMessage = raw.sourceLabel;
    state.accountServersPanelOpen = true;
    render();
  } catch (err) {
    const text = tauriErrorMessage(err);
    toast(text);
    const preset = applyDomainPresetIfSafe(emailRaw, {
      onApplied(domain, p) {
        discoveredServersFormSnap = serverSidesFromPreset(p);
        state.accountMessage = `Préréglage local (${domain}) après échec : ${text}`;
        accountFieldTouched.serverFields = false;
        render();
      },
    });
    if (!preset) {
      state.accountMessage = text;
      render();
    }
  }
}

async function saveAccount() {
  if (!isTauriRuntime()) {
    state.accountMessage = "L’enregistrement du compte sur disque requiert l’app Tauri (npm run tauri:dev), pas le navigateur seul.";
    render();
    toast(state.accountMessage);
    return;
  }

  const emailRaw = inputValue("account-email").trim();
  const emailNorm = emailRaw.toLowerCase();
  const editingId =
    state.view === "settings" && state.settingsTab === "accounts" && state.settingsSelectedAccountId !== "new"
      ? state.settingsSelectedAccountId.trim().toLowerCase()
      : null;
  const isNewProfile = editingId === null;

  const persistedEdit = editingId != null ? state.accounts.find((a) => a.id === editingId) : undefined;
  const authKindForSave: MailAuthKind =
    editingId != null ?
      state.oauthLockedEmail != null || state.accountFormAuthKind !== "password" ?
        state.accountFormAuthKind
      : (persistedEdit?.authKind ?? "password")
    : state.accountFormAuthKind;

  const request = {
    displayName: inputValue("account-display-name"),
    email: emailRaw,
    password: inputValue("account-password"),
    authKind: authKindForSave,
    imapHost: inputValue("imap-host"),
    imapPort: numberValue("imap-port", 993),
    imapSecurity: selectValue("imap-security", "Tls") as SecurityMode,
    imapAllowInvalidTls: checkedValue("imap-allow-invalid-tls"),
    smtpHost: inputValue("smtp-host"),
    smtpPort: numberValue("smtp-port", 587),
    smtpSecurity: selectValue("smtp-security", "StartTls") as SecurityMode,
    smtpAllowInvalidTls: checkedValue("smtp-allow-invalid-tls"),
    ...(editingId ? { previousAccountId: editingId } : {})
  };

  if (!request.email.includes("@")) {
    state.accountMessage = "E-mail invalide.";
    render();
    return;
  }

  if (isNewProfile && state.accounts.some((a) => a.id === emailNorm)) {
    state.accountMessage = "Ce compte existe déjà. Sélectionnez-le dans la liste pour le modifier.";
    render();
    return;
  }

  const oauthNew =
    isNewProfile && (authKindForSave === "oauthGoogle" || authKindForSave === "oauthMicrosoft");

  if (!request.password && isNewProfile && !oauthNew) {
    state.accountMessage = "Mot de passe ou app password requis pour un nouveau compte (mode mot de passe).";
    render();
    return;
  }

  if (!request.imapHost || !request.smtpHost) {
    state.accountMessage = "Renseignez les hôtes IMAP et SMTP.";
    render();
    return;
  }

  state.accountMessage = "Enregistrement en cours (SQLite + trousseau)…";
  render();

  try {
    const savedRaw = await withTimeout(invoke<unknown>("save_account", { request }), ACCOUNT_INVOKE_TIMEOUT_MS);
    const saved = normalizeAccountRow(savedRaw);
    const rawAccounts = await withTimeout(invoke<unknown[]>("list_accounts", {}), ACCOUNT_INVOKE_TIMEOUT_MS);
    const accounts = (Array.isArray(rawAccounts) ? rawAccounts : [])
      .map((row) => normalizeAccountRow(row))
      .filter((a): a is Account => a !== null);
    if (accounts.length === 0) {
      state.accountMessage = "Compte enregistré côté commande, mais la liste rechargée est vide — vérifiez les logs Tauri.";
      state.accounts = saved ? [saved] : [];
    } else {
      state.accounts = accounts;
      if (!state.selectedAccountId || !state.accounts.some((a) => a.id === state.selectedAccountId)) {
        state.selectedAccountId = state.accounts[0]?.id;
      }
      state.accountMessage = `Compte enregistré : ${saved?.email ?? accounts[0]?.email ?? ""} (${accounts.length} dans SQLite).`;
    }
    if (editingId && state.selectedAccountId === editingId && saved) {
      state.selectedAccountId = saved.id;
    }
    if (state.view === "settings" && state.settingsTab === "accounts" && saved) {
      state.settingsSelectedAccountId = saved.id;
    }
    clearDiscoveredServerSnap();
    state.accountFormOAuthPrefill = null;
    state.oauthLockedEmail = null;
    clearAccountOAuthWizard();
    state.accountOAuthWizardRetry = null;
    if (isTauriRuntime()) {
      state.mailboxes = await safeInvoke<string[]>("list_imap_mailboxes", { accountId: currentAccount()?.id ?? null }, [], BOOT_INVOKE_TIMEOUT_MS);
      ensureValidSelectedMailbox();
      await loadMailView();
      await loadMailboxUnread();
    }
  } catch (error) {
    const text = tauriErrorMessage(error);
    state.accountMessage = `Échec enregistrement : ${text}`;
    console.error("save_account / list_accounts", error);
    toast(state.accountMessage);
  }
  render();
}

/** Rafraîchit la liste après sync IMAP déjà faite côté Rust (IDLE/polling) — sans 2e passage réseau. */
async function refreshUiAfterImapPush(mailboxHint?: string) {
  if (!isTauriRuntime()) return;
  const mb = (mailboxHint || state.selectedMailbox || "INBOX").trim();
  if (mb && state.selectedMailbox !== mb) {
    state.selectedMailbox = mb;
  }
  try {
    if (isSearchActive()) {
      await searchThreads();
    } else if (usesSearchContextLoader()) {
      await loadThreadsForSearchContext(false);
    } else {
      await loadMailView();
    }
    await loadMailboxUnread();
    const keepThreadId = state.view === "thread" ? state.selectedThreadId : undefined;
    if (keepThreadId && state.threads.some((t) => t.id === keepThreadId)) {
      state.selectedThreadId = keepThreadId;
      if (state.view === "thread") {
        try {
          state.selectedThread = await withTimeout(
            invoke<DiscussionThreadView>("open_thread", { threadId: keepThreadId }),
            BOOT_INVOKE_TIMEOUT_MS,
          );
        } catch {
          state.selectedThread = undefined;
        }
      }
    }
    state.syncMessage = "Boîte mise à jour";
    render();
    void refreshSavedSearches(true);
    void refreshSuggestedSavedViews();
    window.setTimeout(() => {
      if (!state.syncInProgress && state.syncMessage === "Boîte mise à jour") {
        state.syncMessage = "";
        render();
      }
    }, 1800);
  } catch (error) {
    console.warn("refreshUiAfterImapPush", error);
  }
}

async function syncInbox(options?: { background?: boolean; allMailboxes?: boolean }) {
  if (state.syncInProgress) return;
  if (!isTauriRuntime()) {
    state.syncMessage = "Sync IMAP: disponible seulement dans l’app Tauri.";
    render();
    toast(state.syncMessage);
    return;
  }

  const syncAllFolders = syncAllAccountMailboxesRequested(options);

  if (syncAllFolders && state.settingsSelectedAccountId === "new") {
    toast("Enregistrez d’abord le compte avant de synchroniser tous les dossiers.");
    return;
  }

  const account = accountForImapSync();
  if (!account) {
    state.accountMessage = syncAllFolders
      ? "Aucun compte sélectionné — enregistrez ou choisissez un compte dans la liste."
      : "Aucun compte — enregistrez d’abord un compte IMAP.";
    state.syncMessage = state.accountMessage;
    render();
    toast(state.syncMessage);
    return;
  }

  if (!syncAllFolders && isSavedDraftsVirtualMailbox(state.selectedMailbox)) {
    toast("Pas de synchronisation IMAP pour les brouillons locaux.");
    return;
  }

  const mailbox =
    syncAllFolders && isSavedDraftsVirtualMailbox(state.selectedMailbox) ?
      "INBOX"
    : state.selectedMailbox || "INBOX";
  const keepThreadId = state.view === "thread" ? state.selectedThreadId : undefined;
  state.syncInProgress = true;
  state.syncProgressBatch = null;
  state.syncMessage =
    syncAllFolders ?
      `Sync… tous les dossiers · ${account.email}`
    : account.imap.allowInvalidTls ?
      `Sync… (TLS non vérifié) · ${mailbox}`
    : `Sync… · ${mailbox}`;
  render();

  try {
    let targets: string[];
    if (syncAllFolders) {
      const listed = await withTimeout(
        invoke<string[]>("list_imap_mailboxes", { accountId: account.id }),
        BOOT_INVOKE_TIMEOUT_MS,
      );
      targets = Array.from(new Set(listed.map((m) => m.trim()).filter(Boolean))).sort((a, b) =>
        a.localeCompare(b, undefined, { sensitivity: "base" }),
      );
      if (!targets.length) targets = ["INBOX"];
      if (account.id === state.selectedAccountId) {
        state.mailboxes = listed;
      }
    } else if (options?.background) {
      // Sync auto (IDLE) : un seul dossier pour limiter la charge réseau / SQLite.
      targets = [mailbox];
    } else {
      const all = state.mailboxes.length ? state.mailboxes : [mailbox];
      const primary = pickSystemMailboxes(all).map((x) => x.name);
      targets = Array.from(new Set([...primary, mailbox].filter(Boolean)));
    }

    const batches = chunkStringList(targets, SYNC_MAILBOXES_BATCH_SIZE);
    let outcome: SyncMailboxesOutcome = {
      results: [],
      skippedNotOnServer: [],
      syncedMailboxAliases: [],
      syncErrors: [],
    };
    for (let bi = 0; bi < batches.length; bi++) {
      const batch = batches[bi]!;
      state.syncProgressBatch = { current: bi + 1, total: batches.length };
      const batchLabel =
        batches.length > 1 ?
          `Sync… ${bi + 1}/${batches.length} · ${batch.length} dossier${batch.length === 1 ? "" : "s"} (${targets.length} au total)`
        : syncAllFolders ?
          `Sync… ${targets.length} dossier${targets.length === 1 ? "" : "s"}`
        : `Sync… ${escapeHtml(batch.join(", "))}`;
      state.syncMessage = batchLabel;
      scheduleStatusBarProgressPaint();
      render();
      const focus =
        batch.includes(mailbox) ? mailbox
        : batch.includes("INBOX") ? "INBOX"
        : batch[0];
      const part = await withTimeout(
        invoke<SyncMailboxesOutcome>("sync_mailboxes", {
          accountId: account.id,
          mailboxes: batch,
          focusMailbox: focus,
          limitPerMailbox: 80,
        }),
        syncInvokeTimeoutMs(batch.length),
      );
      outcome = mergeSyncMailboxesOutcomes(outcome, part);
    }
    const results = outcome.results ?? [];
    const skippedOnServer = outcome.skippedNotOnServer ?? [];
    const syncErrors = outcome.syncErrors ?? [];
    const aliases = outcome.syncedMailboxAliases ?? [];
    let selectionChangedByAlias = false;
    for (const a of aliases) {
      if (state.selectedMailbox === a.requested) {
        state.selectedMailbox = a.syncedAs;
        selectionChangedByAlias = true;
      }
    }
    if (syncAllFolders || skippedOnServer.length || selectionChangedByAlias || syncErrors.length) {
      try {
        const listed = await withTimeout(
          invoke<string[]>("list_imap_mailboxes", { accountId: account.id }),
          BOOT_INVOKE_TIMEOUT_MS
        );
        if (account.id === state.selectedAccountId) {
          state.mailboxes = listed;
        }
      } catch (error) {
        console.error("list_imap_mailboxes after sync", error);
        toast(`Impossible de rafraîchir la liste des dossiers : ${tauriErrorMessage(error)}`);
      }
      ensureValidSelectedMailbox();
      render();
    }
    if (isSearchActive()) {
      await searchThreads();
    } else if (usesSearchContextLoader()) {
      await loadThreadsForSearchContext(false);
    } else {
      await loadMailView();
    }
    await loadMailboxUnread();
    if (keepThreadId && state.threads.some((t) => t.id === keepThreadId)) {
      state.selectedThreadId = keepThreadId;
    } else {
      state.selectedThreadId = state.threads[0]?.id;
    }
    if (state.view === "thread" && state.selectedThreadId) {
      try {
        state.selectedThread = await withTimeout(
          invoke<DiscussionThreadView>("open_thread", { threadId: state.selectedThreadId }),
          BOOT_INVOKE_TIMEOUT_MS
        );
      } catch (error) {
        console.error("open_thread after sync", error);
        toast(`Impossible d’ouvrir le fil : ${tauriErrorMessage(error)}`);
        state.selectedThread = undefined;
      }
    }
    const totalFetched = results.reduce((sum, r) => sum + (r.fetchedUids ?? 0), 0);
    const touched = results.map((r) => r.mailbox).filter(Boolean);
    let syncLine = `${totalFetched} importés · ${touched.length} dossier${touched.length === 1 ? "" : "s"}`;
    if (syncAllFolders) {
      syncLine = `Compte synchronisé · ${syncLine}`;
    }
    if (skippedOnServer.length) {
      syncLine += ` · Ignorés (absents sur le serveur) : ${skippedOnServer.join(", ")}`;
    }
    if (syncErrors.length) {
      const shorten = (s: string, n = 140) => (s.length <= n ? s : `${s.slice(0, n)}…`);
      const detail = syncErrors.map((e) => `${e.mailbox}: ${shorten(e.error)}`).join(" · ");
      syncLine += ` · Échec sync (${syncErrors.length}) : ${detail}`;
    }
    state.syncMessage = syncLine;
    if (!options?.background) {
      const partial = skippedOnServer.length > 0 || syncErrors.length > 0;
      toast(
        partial
          ? syncAllFolders
            ? "Synchronisation du compte terminée (partielle — certains dossiers ignorés ou en erreur)"
            : "Synchronisation IMAP terminée (partielle — dossiers ignorés ou en erreur)"
          : syncAllFolders
            ? `Synchronisation du compte terminée (${touched.length} dossier${touched.length === 1 ? "" : "s"})`
            : "Synchronisation IMAP terminée"
      );
    } else if (skippedOnServer.length > 0 || syncErrors.length > 0) {
      toast("Synchronisation partielle — voir la ligne d’état sous le titre du dossier.");
    }
    if (
      state.appPrefs.ai.aiBackgroundAutoSemanticIndex &&
      state.semanticModelAvailable &&
      totalFetched > 0
    ) {
      void invoke("reindex_semantic_mailbox_cmd", { accountId: account.id, mailbox }).catch(() => {});
    }
    render();
    void refreshSavedSearches(true);
    void refreshSuggestedSavedViews();
  } catch (error) {
    console.error("sync_inbox failed", error);
    const message = error instanceof Error ? error.message : String(error);
    state.syncMessage = `Sync échouée: ${message}`;
    toast(state.syncMessage);
    render();
  } finally {
    state.syncInProgress = false;
    state.syncProgressBatch = null;
    if (options?.background) {
      window.setTimeout(() => {
        if (!state.syncInProgress) {
          state.syncMessage = "";
          render();
        }
      }, 1800);
    }
    render();
  }
}

async function prepareReply() {
  const threadId = currentThreadIdForReply();
  if (!threadId) {
    toast("Aucun fil sélectionné.");
    return;
  }
  try {
    state.draft = await withTimeout(invoke<Draft>("prepare_reply", { threadId, messageId: null }), MAIL_ACTION_TIMEOUT_MS);
  } catch (error) {
    console.error("Tauri command failed: prepare_reply", error);
    toast(`Impossible de préparer la réponse: ${tauriErrorMessage(error)}`);
    return;
  }
  loadComposeMarkdownIntoEditor(state.draft.markdownBody);
  enterComposeView();
  startNewDraftSession();
  state.composeCcBccOpen = draftHasRecipientsExtra(state.draft);
  state.composeLayout = "split";
  syncPreviewOpenFromComposeLayout();
  resetMarkdownEditorHistory();
  render();
  window.setTimeout(() => void computePreview(), 0);
  scheduleDraftRevisionSave(350);
}

async function prepareReplyToMessage(messageId: string) {
  const mid = messageId.trim();
  if (!mid) return;
  const threadId = currentThreadIdForReply();
  if (!threadId) {
    toast("Aucun fil sélectionné.");
    return;
  }
  const thread = state.selectedThread;
  const msg = thread?.messages.find((m) => m.messageId === mid);
  if (!msg) {
    await prepareReply();
    return;
  }
  try {
    state.draft = await withTimeout(invoke<Draft>("prepare_reply", { threadId, messageId: mid }), MAIL_ACTION_TIMEOUT_MS);
  } catch (error) {
    console.error("Tauri command failed: prepare_reply (quote)", error);
    toast(`Impossible de préparer la réponse: ${tauriErrorMessage(error)}`);
    return;
  }
  const header = `${formatThreadReadingWhen(msg.receivedAt)} — ${msg.sender}`;
  const body = (msg.cleanedText || msg.sourceText || "").trim();
  const quoted = body
    .split("\n")
    .map((line) => `> ${line}`.trimEnd())
    .join("\n");
  const intro = (state.draft?.markdownBody ?? "").trimEnd();
  const next = `${intro}\n\n> ${header}\n${quoted}\n\n`;
  loadComposeMarkdownIntoEditor(next);
  enterComposeView();
  startNewDraftSession();
  state.composeCcBccOpen = draftHasRecipientsExtra(state.draft);
  state.composeLayout = "split";
  syncPreviewOpenFromComposeLayout();
  resetMarkdownEditorHistory();
  render();
  window.setTimeout(() => void computePreview(), 0);
  scheduleDraftRevisionSave(350);
}

async function sendQuickReply(kind: "reply" | "reply-all") {
  const quickInput = document.querySelector<HTMLInputElement>("[data-quick-reply]");
  const body = quickInput?.value.trim() ?? "";
  if (!body) {
    toast("Le quick reply est vide.");
    return;
  }
  const threadId = currentThreadIdForReply();
  if (!threadId) {
    toast("Aucun fil sélectionné.");
    return;
  }
  const command = kind === "reply" ? "prepare_reply" : "prepare_reply_all";
  let draft: Draft;
  try {
    draft = await withTimeout(
      invoke<Draft>(command, kind === "reply" ? { threadId, messageId: null } : { threadId }),
      MAIL_ACTION_TIMEOUT_MS
    );
  } catch (error) {
    console.error(`Tauri command failed: ${command}`, error);
    toast(`Impossible de préparer la réponse: ${tauriErrorMessage(error)}`);
    return;
  }
  draft.markdownBody = `${body}\n`;
  try {
    const sendOutcome = await withTimeout(
      invoke<SendDraftOutcome>("send_draft", {
        accountId: currentAccount()?.id ?? null,
        draft,
        sendAck: "send-draft",
      }),
      MAIL_ACTION_TIMEOUT_MS
    );
    toast(kind === "reply" ? "Réponse envoyée." : "Réponse à tous envoyée.");
    toastSendDraftImapNotice(sendOutcome);
    if (quickInput) quickInput.value = "";
    await loadMailView(false);
    await loadMailboxUnread();
    if (state.selectedThreadId) {
      const tid = state.selectedThreadId;
      const refreshed = await fetchOpenThreadOrNotify(tid);
      if (refreshed) state.selectedThread = refreshed;
    }
    render();
  } catch (error) {
    console.error("send_draft (quick reply)", error);
    toast(`Envoi échoué: ${tauriErrorMessage(error)}`);
  }
}

async function prepareReplyAll() {
  const threadId = currentThreadIdForReply();
  if (!threadId) {
    toast("Aucun fil sélectionné.");
    return;
  }
  try {
    state.draft = await withTimeout(invoke<Draft>("prepare_reply_all", { threadId }), MAIL_ACTION_TIMEOUT_MS);
  } catch (error) {
    console.error("Tauri command failed: prepare_reply_all", error);
    toast(`Impossible de préparer la réponse: ${tauriErrorMessage(error)}`);
    return;
  }
  loadComposeMarkdownIntoEditor(state.draft.markdownBody);
  enterComposeView();
  startNewDraftSession();
  state.composeCcBccOpen = draftHasRecipientsExtra(state.draft);
  state.composeLayout = "split";
  syncPreviewOpenFromComposeLayout();
  resetMarkdownEditorHistory();
  render();
  window.setTimeout(() => void computePreview(), 0);
  scheduleDraftRevisionSave(350);
}

async function prepareForward() {
  await prepareForwardWithOptionalMessage(null);
}

async function prepareForwardToMessage(messageId: string) {
  const mid = messageId.trim();
  if (!mid) {
    await prepareForward();
    return;
  }
  const threadId = currentThreadIdForReply();
  if (!threadId) {
    toast("Aucun fil sélectionné.");
    return;
  }
  const thread = state.selectedThread;
  const msg = thread?.messages.find((m) => m.messageId === mid);
  if (!msg) {
    await prepareForward();
    return;
  }
  await prepareForwardWithOptionalMessage(mid);
}

async function prepareForwardWithOptionalMessage(messageId: string | null) {
  const threadId = currentThreadIdForReply();
  if (!threadId) {
    toast("Aucun fil sélectionné.");
    return;
  }
  const mid = messageId?.trim() || null;
  try {
    state.draft = await withTimeout(
      invoke<Draft>("prepare_forward", { threadId, messageId: mid }),
      MAIL_ACTION_TIMEOUT_MS
    );
  } catch (error) {
    console.error("Tauri command failed: prepare_forward", error);
    toast(`Impossible de préparer le transfert: ${tauriErrorMessage(error)}`);
    return;
  }
  loadComposeMarkdownIntoEditor(state.draft.markdownBody);
  enterComposeView();
  startNewDraftSession();
  state.composeCcBccOpen = false;
  state.composeLayout = "split";
  syncPreviewOpenFromComposeLayout();
  resetMarkdownEditorHistory();
  render();
  window.setTimeout(() => void computePreview(), 0);
  scheduleDraftRevisionSave(350);
}

/** Raccourci M : Split → Write → Preview → Split. */
async function cycleComposeLayout() {
  persistDraft();
  const order: ComposeLayout[] = ["split", "write", "preview"];
  const fullOrder: ComposeLayout[] =
    isTauriRuntime() ? [...order, "historique"] : order;
  const idx = Math.max(0, fullOrder.indexOf(state.composeLayout));
  state.composeLayout = fullOrder[(idx + 1) % fullOrder.length];
  syncPreviewOpenFromComposeLayout();
  render();
  if (state.composeLayout === "historique") void refreshDraftRevisions(60);
  else if (state.composeLayout !== "write") await computePreview();
}

function applyComposerPreviewDom(htmlRaw: string) {
  const node = document.querySelector<HTMLElement>(".composer-body .preview");
  if (!node) return false;
  node.innerHTML = sanitizeEmailHtml(htmlRaw, { relocateUnsubscribe: false }).html;
  return true;
}

async function computePreview() {
  persistDraft();
  const md = state.composeCanonicalBody || state.draft?.markdownBody || state.composeBody;
  state.preview = await safeInvoke<DraftPreview>("preview_draft", { markdownBody: md }, {
    textPlain: md,
    html: `<p>${escapeHtml(md).replace(/\n/g, "<br />")}</p>`
  });
  // Ne pas faire un render() global pendant la frappe : il détruirait #compose-body et saute le curseur.
  // On met uniquement à jour le panneau d’aperçu si le composer est déjà monté avec l’aperçu ouvert.
  if (state.view === "compose" && composePreviewPaneActive() && applyComposerPreviewDom(state.preview?.html ?? "")) {
    return;
  }
  render();
}

function schedulePreviewUpdate(delayMs: number = 250) {
  if (!composePreviewPaneActive()) return;
  if (previewTimer) window.clearTimeout(previewTimer);
  previewTimer = window.setTimeout(() => void computePreview(), delayMs);
}

type SendDraftOutcome = {
  imapNotice?: string | null;
};

/** Aligné sur `rustymail_domain::split_send` (serde camelCase). */
type SplitChunk = {
  paths: string[];
  totalBytes: number;
  oversized: boolean;
  displayNames: string[];
};

type SplitPlan = {
  chunks: SplitChunk[];
  budgetBytes: number;
  serverTargetBytes: number;
  encodedOverhead: number;
  hasOversized: boolean;
};

type SplitSendResult = {
  messageIds: string[];
  imapNotices?: Array<string | null | undefined>;
  failedChunkIndex?: number | null;
  errorMessage?: string | null;
};

/** Toast facultatif après envoi réussi quand la copie IMAP / le dédoublonnage Envoyés a un souci. */
function toastSendDraftImapNotice(outcome: SendDraftOutcome | undefined) {
  const note = outcome?.imapNotice?.trim();
  if (!note) return;
  const shorten = (s: string, n = 220) => (s.length <= n ? s : `${s.slice(0, n)}…`);
  toast(`Information : ${shorten(note)}`);
}

function toastSplitImapNotices(notes: Array<string | null | undefined> | undefined) {
  if (!notes?.length) return;
  const shorten = (s: string, n = 220) => (s.length <= n ? s : `${s.slice(0, n)}…`);
  for (const note of notes) {
    const t = note?.trim();
    if (t) toast(`Information : ${shorten(t)}`);
  }
}

/** Après confirmation modale « envoi en N parties ». */
async function confirmAndExecuteSplitSend() {
  if (!state.draft) {
    state.splitSendConfirm = null;
    render();
    return;
  }
  persistDraft();
  const draftOutbound = draftPayloadForRust(state.draft);
  const n = state.splitSendConfirm?.chunks.length ?? 0;
  state.splitSendConfirm = null;
  const accountId = currentAccount()?.id ?? null;
  const splitTimeout = MAIL_ACTION_TIMEOUT_MS * Math.max(1, Math.min(n || 1, 12));
  try {
    state.composeMessage = n > 1 ? `Envoi en cours (${n} parties)…` : "Envoi en cours…";
    render();
    const keepThreadId = state.selectedThreadId;
    const result = await withTimeout(
      invoke<SplitSendResult>("execute_split_send_cmd", {
        accountId,
        draft: draftOutbound,
        sendAck: "send-draft",
      }),
      splitTimeout
    );
    if (result.failedChunkIndex != null) {
      const done = result.messageIds?.length ?? 0;
      const err = (result.errorMessage ?? "").trim();
      toast(
        `Envoi interrompu à la partie ${result.failedChunkIndex}/${n} (${done} partie(s) déjà envoyée(s)).${err ? ` ${err}` : ""}`
      );
      state.composeMessage = `Échec partie ${result.failedChunkIndex}/${n}`;
      toastSplitImapNotices(result.imapNotices);
      render();
      return;
    }
    state.composeMessage = n > 1 ? `Email envoyé en ${n} parties` : "Email envoyé";
    toast(state.composeMessage);
    toastSplitImapNotices(result.imapNotices);
    await loadMailView(false);
    await loadMailboxUnread();
    if (keepThreadId) {
      const refreshed = await fetchOpenThreadOrNotify(keepThreadId);
      if (refreshed) state.selectedThread = refreshed;
    }
    state.view = state.selectedThread ? "thread" : "list";
    state.draft = undefined;
    state.composeBody = "";
    state.composeCanonicalBody = "";
    state.composeLayout = "split";
    syncPreviewOpenFromComposeLayout();
    state.preview = undefined;
    window.setTimeout(() => {
      state.composeMessage = "";
      render();
    }, 2500);
    render();
  } catch (error) {
    console.error("execute_split_send_cmd", error);
    state.composeMessage = `Envoi échoué: ${tauriErrorMessage(error)}`;
    toast(state.composeMessage);
    render();
  }
}

async function sendDraft() {
  persistDraft();
  if (!state.draft) {
    toast("Aucun brouillon à envoyer.");
    console.warn("sendDraft: state.draft is undefined");
    return;
  }
  const toEmails = state.draft.to.map((x) => x.email?.trim()).filter(Boolean);
  if (toEmails.length === 0) {
    toast("Ajoutez au moins une adresse dans le champ À.");
    return;
  }
  if (!state.draft.subject?.trim()) {
    toast("Renseignez l’objet du message.");
    return;
  }
  const account = currentAccount();
  const accountId = account?.id ?? null;
  const draftOutbound = draftPayloadForRust(state.draft);
  const attachPaths = draftOutbound.attachmentPaths ?? [];

  if (isTauriRuntime() && attachPaths.length > 0) {
    try {
      state.composeMessage = "Analyse des pièces jointes…";
      render();
      const plan = await withTimeout(invoke<SplitPlan>("plan_split_send", { draft: draftOutbound }), MAIL_ACTION_TIMEOUT_MS);
      if (plan.chunks.length > 1) {
        state.splitSendConfirm = plan;
        state.composeMessage = "";
        render();
        return;
      }
    } catch (error) {
      console.error("plan_split_send", error);
      state.composeMessage = "";
      toast(tauriErrorMessage(error));
      render();
      return;
    }
  }

  try {
    state.composeMessage = "Envoi en cours…";
    render();
    const keepThreadId = state.selectedThreadId;
    const sendOutcome = await withTimeout(
      invoke<SendDraftOutcome>("send_draft", {
        accountId,
        draft: draftOutbound,
        sendAck: "send-draft",
      }),
      MAIL_ACTION_TIMEOUT_MS
    );
    state.composeMessage = "Email envoyé";
    toast(state.composeMessage);
    toastSendDraftImapNotice(sendOutcome);
    if (keepThreadId) {
      recordActivity({
        eventType: "message_sent",
        threadId: String(keepThreadId),
        senderEmail: toEmails[0] ?? null,
      });
    }
    await loadMailView(false);
    await loadMailboxUnread();
    if (keepThreadId) {
      const refreshed = await fetchOpenThreadOrNotify(keepThreadId);
      if (refreshed) state.selectedThread = refreshed;
    }
    state.view = state.selectedThread ? "thread" : "list";
    state.draft = undefined;
    state.composeBody = "";
    state.composeCanonicalBody = "";
    state.composeLayout = "split";
    syncPreviewOpenFromComposeLayout();
    state.preview = undefined;
    clearDraftSession();
    // Keep message visible a bit in case toast is blocked.
    window.setTimeout(() => {
      state.composeMessage = "";
      render();
    }, 2500);
    render();
  } catch (error) {
    console.error("send_draft", error);
    state.composeMessage = `Envoi échoué: ${tauriErrorMessage(error)}`;
    toast(state.composeMessage);
    render();
  }
}

/** Synthèse d’un fil (appelant doit déjà tenir la file LLM ou être hors file). */
async function summarizeThreadCore(
  threadId: string,
  signal: AbortSignal,
  opts?: { toastOnDone?: boolean; toastOnCache?: boolean; prefetchOnly?: boolean }
): Promise<{ status: "done" | "cancelled" | "error"; errorMessage?: string }> {
  const prefetchOnly = opts?.prefetchOnly === true;
  const toastOnDone = !prefetchOnly && opts?.toastOnDone !== false;
  const toastOnCache = !prefetchOnly && opts?.toastOnCache !== false;
  const fail = (message: string) => ({ status: "error" as const, errorMessage: message });
  if (!prefetchOnly) {
    state.aiOpen = true;
    state.quickReplySuggestions = [];
    state.aiOutput = "Aperçu synthétique du fil…";
    state.aiThreadScope = String(threadId);
    render();
  }
  const seg = await aiCacheKeySegment();
  const cacheKey = `summary:v2:${seg}:p${AI_CACHE_PROMPT_REVISION}:${threadId}`;
  const cached = await invokeAiCacheGet(cacheKey, {
    timeoutMs: BOOT_INVOKE_TIMEOUT_MS,
    withTimeout,
  });
  if (cached && !signal.aborted) {
    try {
      const o = repairSummaryResultStrings(JSON.parse(cached) as SummaryResult);
      if (applyThreadAiOutputIfLive(threadId, summaryResultToZenText(o))) {
        if (toastOnCache) toast("Synthèse (cache locale).");
        if (!prefetchOnly) render();
        return { status: "done" };
      }
      return { status: "done" };
    } catch {
      /* invalide : recalcul */
    }
  }
  let done: Awaited<ReturnType<typeof runLlmStreamJob>>;
  try {
    done = await withTimeout(
      runLlmStreamJob({
        command: "llm_stream_summarize_thread",
        args: { threadId },
        signal,
        onChunk: (acc) => {
          if (applyThreadAiOutputIfLive(threadId, acc)) paintThreadAiSummaryDom(acc);
        },
      }),
      LLM_INVOKE_TIMEOUT_MS
    );
  } catch (error) {
    if (signal.aborted || isLlmCancelledError(error)) {
      if (threadIdsMatch(state.aiThreadScope, threadId)) clearThreadAiSummaryState();
      if (toastOnDone) toast("Synthèse annulée.");
      if (!prefetchOnly) render();
      return { status: "cancelled" };
    }
    const msg = tauriErrorMessage(error);
    console.error("summarizeThreadCore", error);
    if (threadIdsMatch(state.aiThreadScope, threadId)) clearThreadAiSummaryState();
    if (toastOnDone) toast(`Synthèse échouée : ${msg}`);
    if (!prefetchOnly) render();
    return fail(msg);
  }
  if (done === "cancelled") {
    if (threadIdsMatch(state.aiThreadScope, threadId)) clearThreadAiSummaryState();
    if (toastOnDone) toast("Synthèse annulée.");
    if (!prefetchOnly) render();
    return { status: "cancelled" };
  }
  if (done.summary) {
    const summary = repairSummaryResultStrings(done.summary as SummaryResult);
    applyThreadAiOutputIfLive(
      threadId,
      done.displayText?.trim() || summaryResultToZenText(summary)
    );
  } else if (done.displayText?.trim()) {
    applyThreadAiOutputIfLive(threadId, repairUtf8Mojibake(done.displayText));
  } else {
    const msg = "réponse vide du modèle";
    if (threadIdsMatch(state.aiThreadScope, threadId)) clearThreadAiSummaryState();
    if (toastOnDone) toast("Synthèse terminée sans contenu exploitable.");
    if (!prefetchOnly) render();
    return fail(msg);
  }
  if (toastOnDone) toast("Synthèse terminée.");
  if (!prefetchOnly) render();
  return { status: "done" };
}

async function translateThreadCore(
  threadId: string,
  signal: AbortSignal,
  opts?: { prefetchOnly?: boolean }
): Promise<{ status: "done" | "cancelled" | "error"; errorMessage?: string }> {
  const prefetchOnly = opts?.prefetchOnly === true;
  const fail = (message: string) => ({ status: "error" as const, errorMessage: message });
  const targetLang = state.appPrefs.general.motherLanguage?.trim() || "fr";
  if (!prefetchOnly) {
    state.aiOpen = true;
    state.quickReplySuggestions = [];
    state.aiOutput = `Traduction → ${targetLang}…`;
    state.aiThreadScope = String(threadId);
    render();
  }
  const seg = await aiCacheKeySegment();
  const cacheKey = `translate:v2:${seg}:p${AI_CACHE_PROMPT_REVISION}:thread:${threadId}:${targetLang}`;
  const cached = await invokeAiCacheGet(cacheKey, {
    timeoutMs: BOOT_INVOKE_TIMEOUT_MS,
    withTimeout,
  });
  if (cached && !signal.aborted) {
    try {
      const o = JSON.parse(cached) as LlmTranslationResult;
      if (o.translatedText) {
        if (applyThreadAiOutputIfLive(threadId, repairUtf8Mojibake(o.translatedText))) {
          if (!prefetchOnly) {
            toast("Traduction (cache locale).");
            render();
          }
        }
        return { status: "done" };
      }
    } catch {
      /* recalcul */
    }
  }
  let done: Awaited<ReturnType<typeof runLlmStreamJob>>;
  try {
    done = await withTimeout(
      runLlmStreamJob({
        command: "llm_stream_translate_thread",
        args: { threadId, targetLang },
        signal,
        onChunk: (acc) => {
          const preview = extractPartialJsonStringField(acc, "translatedText");
          if (!preview) return;
          if (applyThreadAiOutputIfLive(threadId, repairUtf8Mojibake(preview))) {
            paintThreadAiSummaryDom(repairUtf8Mojibake(preview));
          }
        },
      }),
      LLM_INVOKE_TIMEOUT_MS
    );
  } catch (error) {
    if (signal.aborted || isLlmCancelledError(error)) {
      if (threadIdsMatch(state.aiThreadScope, threadId)) clearThreadAiSummaryState();
      if (!prefetchOnly) toast("Traduction annulée.");
      if (!prefetchOnly) render();
      return { status: "cancelled" };
    }
    const msg = tauriErrorMessage(error);
    if (!prefetchOnly) toast(`Traduction échouée : ${msg}`);
    console.warn("translateThreadCore", error);
    if (!prefetchOnly) render();
    return fail(msg);
  }
  if (done === "cancelled") {
    if (threadIdsMatch(state.aiThreadScope, threadId)) clearThreadAiSummaryState();
    if (!prefetchOnly) toast("Traduction annulée.");
    if (!prefetchOnly) render();
    return { status: "cancelled" };
  }
  const tx =
    done.translation?.translatedText?.trim() ||
    done.displayText?.trim() ||
    "";
  if (tx) applyThreadAiOutputIfLive(threadId, repairUtf8Mojibake(tx));
  if (!prefetchOnly) toast("Traduction terminée.");
  if (!prefetchOnly) render();
  return { status: "done" };
}

async function summarizeThread() {
  const threadId =
    state.view === "thread" && state.selectedThreadId?.trim() ?
      state.selectedThreadId.trim()
    : currentThreadIdForReply();
  if (!threadId) {
    toast("Aucun fil sélectionné.");
    return;
  }
  if (!isAiFeatureEnabled(state.appPrefs.ai, "featureThreadSummaryEnabled")) {
    toast("Synthèse de fil désactivée — activez-la dans Paramètres IA ou le panneau « IA ».");
    return;
  }
  if (!isTauriRuntime()) {
    toast("Résumé du fil : lancez l’application RustyMail (Tauri), pas le navigateur seul.");
    state.aiOpen = true;
    state.aiOutput =
      "La synthèse utilise la base locale et les commandes Tauri ; elle n’est pas disponible en prévisualisation web seule.";
    render();
    return;
  }
  const ran = await withLlmQueue("Synthèse fil", (signal) => summarizeThreadCore(threadId, signal));
  if (ran === null) return;
}

async function summarizeSenderThreadsLight() {
  if (state.searchSenders.length === 0) {
    toast("Filtrez d’abord par expéditeur (@ ou recherche NL).");
    return;
  }
  if (!isAiFeatureEnabled(state.appPrefs.ai, "featureThreadSummaryEnabled")) {
    toast("Synthèse de fil désactivée dans les préférences IA.");
    return;
  }
  if (!state.threads.length) {
    toast("Aucun fil dans la liste filtrée — lancez une recherche.");
    return;
  }
  const topK = state.threads.slice(0, 5);
  const priorView = state.view;
  const priorThreadId = state.selectedThreadId;
  const priorThread = state.selectedThread;
  senderBatchSummarizeAbort?.abort();
  senderBatchSummarizeAbort = new AbortController();
  const signal = senderBatchSummarizeAbort.signal;
  senderBatchSummarizeActive = true;
  state.aiOpen = true;
  let okCount = 0;
  try {
    const ran = await withLlmQueue(`Synthèse fils (${topK.length})`, async (queueSignal) => {
      for (let i = 0; i < topK.length; i++) {
        if (signal.aborted || queueSignal.aborted) return "cancelled" as const;
        const item = topK[i];
        const tid = String(item?.id ?? "");
        if (!tid) continue;
        const label = (item?.subject ?? "").trim() || `Fil ${i + 1}`;
        state.aiOutput = `Synthèse ${i + 1}/${topK.length} — ${label}…`;
        render();
        const exists = await fetchOpenThreadOrNotify(tid, { quiet: true });
        if (!exists) {
          toast(`Fil ignoré (non disponible en local) : ${label}`);
          continue;
        }
        if (signal.aborted || queueSignal.aborted) return "cancelled" as const;
        const outcome = await summarizeThreadCore(tid, queueSignal, {
          toastOnDone: false,
          toastOnCache: false,
        });
        if (outcome.status === "cancelled") return "cancelled" as const;
        if (outcome.status === "error") {
          const detail = outcome.errorMessage?.trim();
          toast(
            detail
              ? `Synthèse échouée : ${label} — ${detail}`
              : `Synthèse échouée : ${label}`
          );
          continue;
        }
        okCount += 1;
      }
      return "done" as const;
    });
    if (ran === "cancelled") toast("Synthèse batch annulée.");
    else if (ran) {
      if (okCount === 0) toast("Aucune synthèse n’a abouti — vérifiez le moteur IA et la sync des fils.");
      else
        toast(
          `${okCount}/${topK.length} synthèse${okCount === 1 ? "" : "s"} — résultat du dernier fil dans le panneau IA (liste inchangée).`
        );
    }
  } finally {
    senderBatchSummarizeAbort = null;
    senderBatchSummarizeActive = false;
    state.view = priorView;
    state.selectedThreadId = priorThreadId;
    state.selectedThread = priorThread;
    if (okCount > 0 && threadAiSummaryScoped()) {
      state.aiOpen = true;
    }
    render();
  }
}

async function llmTranslateThreadUi() {
  const threadId = state.selectedThreadId?.trim();
  if (!threadId) {
    toast("Ouvre un fil à traduire.");
    return;
  }
  const thread = state.selectedThread;
  const mother = state.appPrefs.general.motherLanguage?.trim() || "fr";
  if (thread && !shouldOfferThreadTranslate(thread, mother)) {
    toast("Fil déjà dans la langue mère — traduction inutile.");
    return;
  }
  if (!isAiFeatureEnabled(state.appPrefs.ai, "featureThreadTranslateEnabled")) {
    toast("Traduction de fil désactivée — activez-la dans Paramètres IA ou le panneau « IA ».");
    return;
  }
  if (!isTauriRuntime()) {
    toast("Traduire LLM : lancez Tauri.");
    return;
  }
  const ran = await withLlmQueue("Traduction fil", async (signal) => {
    await translateThreadCore(threadId, signal, { prefetchOnly: false });
  });
  if (ran === null) return;
}

async function hydrateMessageTranslationsFromCacheForThread(messages: CleanedMessageView[]): Promise<void> {
  if (!isTauriRuntime()) return;
  const targetLang = state.appPrefs.general.motherLanguage?.trim() || "fr";
  const seg = await aiCacheKeySegment();
  const batchSize = 12;
  for (let i = 0; i < messages.length; i += batchSize) {
    const slice = messages.slice(i, i + batchSize);
    await Promise.all(
      slice.map(async (m) => {
        const mother = state.appPrefs.general.motherLanguage?.trim() || "fr";
        if (!shouldOfferPerMessageTranslate(m, mother)) return;
        const ck = `translate:v2:${seg}:p${AI_CACHE_PROMPT_REVISION}:msg:${m.messageId}:${targetLang}`;
        try {
          const raw = await invokeAiCacheGet(ck, {
            timeoutMs: BOOT_INVOKE_TIMEOUT_MS,
            withTimeout,
          });
          if (!raw?.trim()) return;
          const o = JSON.parse(raw) as LlmTranslationResult;
          const tx = o.translatedText?.trim();
          if (!tx) return;
          state.messageTranslations[`${m.messageId}|${targetLang}`] = repairUtf8Mojibake(tx);
        } catch {
          /* cache absent ou JSON invalide */
        }
      })
    );
  }
  render();
}

async function llmTranslateMessageUi(messageId: string, forceRefresh = false) {
  const threadId = state.selectedThreadId?.trim();
  const mid = messageId.trim();
  if (!threadId || !mid) {
    toast("Ouvre un message dans un fil.");
    return;
  }
  if (!isAiFeatureEnabled(state.appPrefs.ai, "featureMessageTranslateEnabled")) {
    toast("Traduction par message désactivée — activez-la dans Paramètres IA ou le panneau « IA ».");
    return;
  }
  if (!isTauriRuntime()) {
    toast("Traduire un message : lancez Tauri.");
    return;
  }
  const targetLang = state.appPrefs.general.motherLanguage?.trim() || "fr";
  const msg = state.selectedThread?.messages.find((m) => m.messageId === mid);
  if (!forceRefresh && msg && !shouldOfferPerMessageTranslate(msg, targetLang)) {
    toast("Message déjà dans la langue mère — traduction inutile.");
    return;
  }
  const seg = await aiCacheKeySegment();
  const ck = `translate:v2:${seg}:p${AI_CACHE_PROMPT_REVISION}:msg:${mid}:${targetLang}`;
  const mapKey = `${mid}|${targetLang}`;
  state.messageTranslationBusy[mid] = true;
  render();
  try {
    let cached: string | null = null;
    if (!forceRefresh) {
      cached = await invokeAiCacheGet(ck, {
        timeoutMs: BOOT_INVOKE_TIMEOUT_MS,
        withTimeout,
      });
    }
    if (cached?.trim()) {
      try {
        const o = JSON.parse(cached) as LlmTranslationResult;
        const tx = o.translatedText?.trim();
        if (tx) {
          state.messageTranslations[mapKey] = repairUtf8Mojibake(tx);
          toast("Traduction du message (cache locale).");
          return;
        }
      } catch {
        /* requête LLM */
      }
    }
    const res = await withTimeout(
      invoke<LlmTranslationResult>("llm_translate_message", { threadId, messageId: mid, targetLang }),
      LLM_INVOKE_TIMEOUT_MS
    );
    const tx = res.translatedText?.trim();
    if (tx) state.messageTranslations[mapKey] = repairUtf8Mojibake(tx);
    toast("Message traduit.");
  } catch (e) {
    toast(tauriErrorMessage(e));
  } finally {
    delete state.messageTranslationBusy[mid];
    render();
  }
}

async function llmQuickRepliesThreadUi() {
  const threadId = state.selectedThreadId?.trim();
  if (!threadId) {
    toast("Ouvre un fil.");
    return;
  }
  if (threadIsAutoMail(state.selectedThread, threadId)) {
    toast("Réponses rapides désactivées pour les messages automatiques / newsletters.");
    return;
  }
  if (!isAiFeatureEnabled(state.appPrefs.ai, "featureQuickReplyThreadEnabled")) {
    toast("Réponses rapides (fil) désactivées — activez-les dans Paramètres IA ou le panneau « IA ».");
    return;
  }
  if (!isTauriRuntime()) return void toast("Réponses rapides : Tauri requis.");
  const ran = await withLlmQueue("Réponses rapides", async (signal) => {
    if (signal.aborted) return;
    state.aiOpen = true;
    state.aiOutput = "";
    state.quickReplySuggestions = [];
    render();
    const res = await withTimeout(
      invoke<{ suggestions: Array<{ text: string; tone: string; rationale?: string }> }>("llm_quick_reply_thread", { threadId }),
      LLM_INVOKE_TIMEOUT_MS
    );
    if (signal.aborted) return;
    state.quickReplySuggestions = res.suggestions ?? [];
    state.aiThreadScope = String(threadId);
    toast("Réponses rapides prêtes.");
    render();
  });
  if (ran === null) return;
}

async function llmQuickRepliesComposeUi() {
  if (state.view !== "compose") {
    toast("Ouvre le compositeur pour les réponses rapides.");
    return;
  }
  if (!isAiFeatureEnabled(state.appPrefs.ai, "featureQuickReplyComposeEnabled")) {
    toast("Réponses rapides (compositeur) désactivées — activez-les dans Paramètres IA.");
    return;
  }
  if (!isTauriRuntime()) return void toast("Réponses rapides : Tauri requis.");
  const ran = await withLlmQueue("Réponses rapides", async (signal) => {
    if (signal.aborted) return;
    toast("Génération des suggestions…");
    const res = await withTimeout(
      invoke<{ suggestions: Array<{ text: string; tone: string; rationale?: string }> }>("llm_quick_reply_compose", {}),
      LLM_INVOKE_TIMEOUT_MS
    );
    if (signal.aborted) return;
    const first = res.suggestions?.[0]?.text?.trim();
    if (!first) {
      toast("Aucune suggestion.");
      return;
    }
    const add = `${first}\n\n`;
    state.composeBody = `${add}${state.composeBody}`;
    state.composeCanonicalBody = state.composeBody;
    const ta = document.querySelector<HTMLTextAreaElement>("#compose-body");
    if (ta) ta.value = state.composeBody;
    void computePreview();
    toast("Suggestion insérée — modifiez avant envoi.");
    render();
  });
  if (ran === null) return;
}

async function llmQaThreadUi() {
  const threadId = state.selectedThreadId?.trim();
  if (!threadId) {
    toast("Ouvre un fil.");
    return;
  }
  if (!isAiFeatureEnabled(state.appPrefs.ai, "featureThreadQaEnabled")) {
    toast("Q&A fil désactivé — activez-le dans Paramètres IA.");
    return;
  }
  if (!isTauriRuntime()) return void toast("Q&A fil : Tauri requis.");
  const qaInput = document.querySelector<HTMLTextAreaElement>("#thread-qa-input");
  const question = (qaInput?.value ?? state.threadQaDraft).trim();
  if (!question) {
    toast("Saisissez une question.");
    return;
  }
  state.threadQaDraft = question;
  const ran = await withLlmQueue("Q&A fil", async (signal) => {
    state.aiOpen = true;
    state.threadQaAnswer = null;
    state.threadQaStreamText = "Réponse en cours…";
    render();
    const done = await runLlmStreamJob({
      command: "llm_stream_qa_thread",
      args: { threadId, question },
      signal,
      onChunk: (acc) => {
        const preview = extractPartialJsonStringField(acc, "answer");
        state.threadQaStreamText = preview || "Réponse en cours…";
        if (preview) paintThreadQaStreamDom(preview);
      },
    });
    state.threadQaStreamText = "";
    if (done === "cancelled") {
      toast("Question annulée.");
      render();
      return;
    }
    if (done.qa?.answer?.trim()) {
      state.threadQaAnswer = {
        answer: repairUtf8Mojibake(done.qa.answer),
        evidenceMessageIds: done.qa.evidenceMessageIds ?? [],
      };
      state.aiThreadScope = String(threadId);
      toast("Réponse prête.");
    } else {
      toast("Réponse IA illisible — réessayez.");
    }
    render();
  });
  if (ran === null) return;
}

async function llmInboxDigestUi() {
  if (!isMailboxDigestFeatureEnabled()) return;
  if (!isTauriRuntime()) return void toast("Brief d’action : Tauri requis.");
  if (!currentAccount()?.id?.trim()) return void toast("Sélectionne un compte.");
  if (!mailboxDigestPanelEligible()) {
    toast("Ouvre la liste d’un dossier IMAP pour le brief d’action.");
    return;
  }
  openMailboxDigestPanel(true);
}

async function composeAiRewrite(styleRaw: string) {
  if (state.view !== "compose") {
    toast("Ouvre le compositeur pour réécrire.");
    return;
  }
  if (!isAiFeatureEnabled(state.appPrefs.ai, "featureComposeRewriteEnabled")) {
    toast("Réécriture IA désactivée — activez-la dans Paramètres IA ou le panneau « IA ».");
    return;
  }
  const ta = document.querySelector<HTMLTextAreaElement>("#compose-body");
  const src = ta?.value ?? state.composeBody;
  const style = styleRaw.trim() || "Neutral";
  if (!isTauriRuntime()) return void toast("Réécriture IA : Tauri requis.");
  const ran = await withLlmQueue(`Réécriture ${style}`, async (signal) => {
    if (signal.aborted) return;
    toast(`Réécriture « ${style} »…`);
    const res = await withTimeout(invoke<{ text: string }>("llm_rewrite_compose", { text: src, style }), LLM_INVOKE_TIMEOUT_MS);
    if (signal.aborted) return;
    state.composeCanonicalBody = res.text ?? src;
    state.composeBody = res.text ?? src;
    if (ta) ta.value = res.text ?? src;
    toast("Texte réécrit.");
    render();
    void computePreview();
  });
  if (ran === null) return;
}

async function composeAiGrammar() {
  if (state.view !== "compose") {
    toast("Ouvre le compositeur.");
    return;
  }
  if (!isAiFeatureEnabled(state.appPrefs.ai, "featureComposeGrammarEnabled")) {
    toast("Correction grammaticale désactivée — activez-la dans Paramètres IA ou le panneau « IA ».");
    return;
  }
  const ta = document.querySelector<HTMLTextAreaElement>("#compose-body");
  const src = ta?.value ?? state.composeBody;
  if (!isTauriRuntime()) return void toast("Correction (LLM) : Tauri requis.");
  const ran = await withLlmQueue("Orthographe", async (signal) => {
    if (signal.aborted) return;
    try {
      const res = await withTimeout(
        invoke<{ suggestions: Array<{ reason: string; replacement: string; original: string }> }>("llm_grammar_compose", { text: src }),
        LLM_INVOKE_TIMEOUT_MS
      );
      if (signal.aborted) return;
      const n = res.suggestions?.length ?? 0;
      state.composeGrammarSuggestions = res.suggestions ?? [];
      toast(n ? `${n} suggestion(s) — voir le panneau Correction entre la barre d’outils et le texte.` : "Aucune suggestion.");
    } catch (e) {
      state.composeGrammarSuggestions = null;
      toast(tauriErrorMessage(e));
    }
    render();
  });
  if (ran === null) return;
}

async function searchNlAssist() {
  if (!isAiFeatureEnabled(state.appPrefs.ai, "featureSearchNlEnabled")) {
    toast("Recherche en langage naturel désactivée — activez-la dans Paramètres IA ou le panneau « IA ».");
    return;
  }
  if (!isTauriRuntime()) return void toast("Recherche NL : Tauri requis.");
  const phrase =
    (
      await openTextPromptModal({
        title: "Recherche en langage naturel",
        body: "Décrivez ce que vous cherchez ; la requête sera traduite puis appliquée à la barre de recherche.",
        label: "Description",
        defaultValue: "",
      })
    )?.trim() ?? "";
  if (!phrase) return;
  const accountId = state.selectedAccountId?.trim();
  if (!accountId) {
    toast("Sélectionnez un compte avant la recherche en langage naturel.");
    return;
  }
  const ran = await withLlmQueue("Recherche NL", async (signal) => {
    if (signal.aborted) return;
    const sq = await withTimeout(
      invoke<{
        text?: string | null;
        sender?: string | null;
        senders?: string[];
        tags?: Tag[];
        mode?: string | null;
        accountId?: string | null;
        mailbox?: string | null;
        language?: string | null;
      }>("llm_search_nl", { accountId, phrase }),
      LLM_INVOKE_TIMEOUT_MS
    );
    if (signal.aborted) return;
    applySearchQueryFromNl(sq);
    if (!state.search.trim() && !state.searchSenders.length && !state.searchTags.length && phrase) {
      const fb = extractNlSearchFallbackText(phrase);
      if (fb) {
        state.search = fb;
        state.searchDraft = fb;
        state.searchNlMode = "lexical";
      }
    }
    if (
      !state.search.trim() &&
      !state.searchSenders.length &&
      !state.searchTags.length &&
      !state.searchLanguageFilter?.trim()
    ) {
      toast(
        "Recherche NL : aucun critère exploitable. Reformulez avec des mots-clés (ex. facture, Amazon) ou un expéditeur."
      );
      return;
    }
    await searchThreads();
    const n = threadsVisibleInList().length;
    const bits = [
      state.search ? `texte: ${state.search}` : "",
      state.searchSenders.length ? `de: ${state.searchSenders.join(", ")}` : "",
      state.searchTags.length ? `${state.searchTags.length} tag(s)` : "",
      state.searchNlMode ? `mode: ${state.searchNlMode}` : "",
      state.searchLanguageFilter ? `langue: ${state.searchLanguageFilter}` : "",
    ].filter(Boolean);
    if (n === 0) {
      toast(
        bits.length
          ? `Aucun résultat — ${bits.join(" · ")}. Essayez un mot plus court (ex. facture) ou #compte.`
          : "Aucun résultat pour cette recherche NL."
      );
    } else {
      toast(bits.length ? `Recherche appliquée — ${bits.join(" · ")}` : "Recherche appliquée.");
    }
  });
  if (ran === null) return;
}

type MicActionOpts = {
  /** Démarrage via maintenir la touche PTT : annuler si elle est relâchée avant le micro. */
  fromPushToTalk?: boolean;
  target?: MicDictationTarget;
};

async function micAction(opts?: MicActionOpts) {
  if (state.micState === "idle") {
    micDictationTarget = micTargetFromView(opts?.target);
    if (!isTauriRuntime()) {
      toast("Dictée : l’app bureau Tauri est requise.");
      return;
    }
    if (!state.appPrefs.ai.dictationEnabled) {
      toast("Activez la dictée dans Paramètres → IA & dictée.");
      return;
    }
    const backend = state.appPrefs.ai.dictationBackend;
    if (backend === "cloud" && !state.dictationApiKeySet) {
      toast("Clé API absente : Paramètres → IA & dictée.");
      return;
    }
    if (
      backend === "whisper_cpp" &&
      state.appPrefs.ai.whisperCloudFallback &&
      !state.dictationApiKeySet
    ) {
      toast("Repli cloud activé : enregistrez une clé API, ou désactivez le repli.");
      return;
    }
    if (backend === "local_http" && !state.appPrefs.ai.localCompanionBaseUrl.trim()) {
      toast("Indiquez l’URL du compagnon local (Paramètres → IA & dictée).");
      return;
    }
    try {
      micStream = await requestMicStream();
      if (opts?.fromPushToTalk && !micPttKeyHeld) {
        micStream.getTracks().forEach((t) => t.stop());
        micStream = null;
        render();
        return;
      }
      micChunks = [];
      const mimeOpt =
        typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
          ? "audio/webm;codecs=opus"
          : "audio/webm";
      micMediaRecorder = new MediaRecorder(micStream, { mimeType: mimeOpt });
      micMediaRecorder.ondataavailable = (ev) => {
        if (ev.data && ev.data.size > 0) micChunks.push(ev.data);
      };
      if (opts?.fromPushToTalk && !micPttKeyHeld) {
        micStream.getTracks().forEach((t) => t.stop());
        micStream = null;
        micMediaRecorder = null;
        render();
        return;
      }
      micMediaRecorder.start(250);
      state.micState = "recording";
      state.micSeconds = 0;
      const maxRec = state.appPrefs.ai.whisperMaxRecordSeconds;
      micTimer = window.setInterval(() => {
        state.micSeconds += 1;
        if (maxRec > 0 && state.micSeconds >= maxRec) {
          void micAction();
          return;
        }
        render();
      }, 1000);
      render();
    } catch (e) {
      toast(micPermissionErrorMessage(e));
      micStream?.getTracks().forEach((t) => t.stop());
      micStream = null;
      micMediaRecorder = null;
    }
    return;
  }
  if (state.micState === "recording") {
    if (micTimer) {
      window.clearInterval(micTimer);
      micTimer = undefined;
    }
    const backend = state.appPrefs.ai.dictationBackend;
    if (!micMediaRecorder) {
      state.micState = "idle";
      state.micSeconds = 0;
      render();
      return;
    }
    state.micState = "processing";
    if (backend === "whisper_cpp" && micDictationTarget === "compose") {
      state.composeMessage =
        "Whisper : téléchargement du modèle HF au premier usage si besoin — patientez.";
    }
    render();
    try {
      const blob: Blob = await new Promise((resolve, reject) => {
        const rec = micMediaRecorder!;
        rec.onerror = () => reject(new Error("Enregistrement interrompu"));
        rec.onstop = () => {
          micStream?.getTracks().forEach((t) => t.stop());
          micStream = null;
          resolve(new Blob(micChunks, { type: rec.mimeType || "audio/webm" }));
        };
        rec.stop();
      });
      micMediaRecorder = null;
      micChunks = [];
      const buf = new Uint8Array(await blob.arrayBuffer());
      const b64 = bytesToBase64(buf);
      const ext = blob.type.includes("wav") ? "wav" : "webm";
      let audioWavBase64: string | undefined;
      if (backend === "whisper_cpp") {
        const wavBytes = await mediaBlobToWav16kMonoPcm16(blob);
        audioWavBase64 = bytesToBase64(wavBytes);
        if (micDictationTarget === "compose") {
          state.composeMessage = "Transcription Whisper en cours…";
          render();
        }
      }
      let text = await withTimeout(
        invoke<string>("transcribe_dictation", {
          args: {
            audioBase64: b64,
            ...(audioWavBase64 ? { audioWavBase64 } : {}),
            fileName: `dictation.${ext}`,
            mimeType: blob.type || "audio/webm",
          },
        }),
        120_000
      );
      if (
        micDictationTarget === "compose" &&
        state.appPrefs.ai.dictationRewriteWithStyle &&
        text.trim()
      ) {
        state.composeMessage = "Réécriture du texte dicté…";
        render();
        text = await rewriteDictatedSegmentWithTone(text);
      }
      applyDictationToTarget(text, micDictationTarget);
      state.composeMessage = "";
    } catch (e) {
      console.error("transcribe_dictation", e);
      const errMsg = tauriErrorMessage(e);
      if (micDictationTarget === "compose") state.composeMessage = errMsg;
      toast(errMsg);
    }
    state.micState = "idle";
    state.micSeconds = 0;
    render();
  }
}

function persistDraft() {
  if (!state.draft) return;
  const shell = document.querySelector(".composer-mail-shell");
  const ta = document.querySelector<HTMLTextAreaElement>("#compose-body");
  if (ta) setComposeFromTextareaValue(ta.value);
  state.draft.markdownBody = state.composeCanonicalBody;
  state.draft.subject =
    shell?.querySelector<HTMLInputElement>("#compose-subject")?.value ??
    document.querySelector<HTMLInputElement>("#compose-subject")?.value ??
    state.draft.subject;
  const sendHtmlEl =
    shell?.querySelector<HTMLInputElement>("#compose-send-html") ??
    document.querySelector<HTMLInputElement>("#compose-send-html");
  if (sendHtmlEl) state.draft.sendHtml = sendHtmlEl.checked;
  const toEl = shell?.querySelector<HTMLInputElement>("#compose-to") ?? document.querySelector<HTMLInputElement>("#compose-to");
  const ccEl = shell?.querySelector<HTMLInputElement>("#compose-cc") ?? document.querySelector<HTMLInputElement>("#compose-cc");
  const bccEl = shell?.querySelector<HTMLInputElement>("#compose-bcc") ?? document.querySelector<HTMLInputElement>("#compose-bcc");
  if (composeChipsTo) state.draft.to = composeChipsTo.getRecipients();
  else if (toEl) state.draft.to = parseEmailList(toEl.value);
  if (composeChipsCc) state.draft.cc = composeChipsCc.getRecipients();
  else if (ccEl) state.draft.cc = parseEmailList(ccEl.value);
  if (composeChipsBcc) state.draft.bcc = composeChipsBcc.getRecipients();
  else if (bccEl) state.draft.bcc = parseEmailList(bccEl.value);
  // Pièces jointes : pilots uniquement par state.draft (+ pick natif / glisser). Ne pas splitter par virgule
  // depuis le champ caché (les virgules sont valides dans les noms fichiers sous Windows → chemins coupés avant envoi).
}

function bindComposerDropzone() {
  composerDropAbort?.abort();
  composerDropAbort = undefined;
  composeDragDepth = 0;
  if (state.view !== "compose") return;
  // Bureau Tauri (surtout Windows) : le drop HTML5 ne reçoit pas les chemins disque ;
  // c’est `getCurrentWebview().onDragDropEvent` qui les fournit (`bindTauriFileDrop`).
  if (isTauriRuntime()) return;
  const shell = document.querySelector<HTMLElement>(".composer-mail-shell");
  const composeBody = document.querySelector<HTMLElement>(".composer-mail-shell .composer-body");
  if (!shell || !composeBody) return;

  composerDropAbort = new AbortController();
  const { signal } = composerDropAbort;

  const clearOverlay = () => {
    composeDragDepth = 0;
    shell.classList.remove("composer-mail-shell--drag-over");
    composeBody.classList.remove("drag-over");
  };

  const bumpOverlay = () => {
    shell.classList.add("composer-mail-shell--drag-over");
    composeBody.classList.add("drag-over");
  };

  const onDragEnter = (event: DragEvent) => {
    event.preventDefault();
    composeDragDepth += 1;
    bumpOverlay();
  };

  const onDragLeave = () => {
    composeDragDepth = Math.max(0, composeDragDepth - 1);
    if (composeDragDepth <= 0) clearOverlay();
  };

  const onDragOver = (event: DragEvent) => {
    event.preventDefault();
    const dt = event.dataTransfer;
    if (dt && Array.from(dt.types).includes("Files")) dt.dropEffect = "copy";
  };

  const onDrop = (event: DragEvent) => {
    event.preventDefault();
    clearOverlay();
    if (!state.draft) return;
    const dropped = extractDroppedPaths(event.dataTransfer);
    if (!dropped.length) {
      toast(
        "Aucun chemin de fichier local lu. Glissez depuis l’explorateur ou le bureau (mode Tauri ou Electron), pas depuis une page web."
      );
      return;
    }
    const merged = Array.from(new Set([...(state.draft.attachmentPaths ?? []), ...dropped]));
    state.draft.attachmentPaths = merged;
    const attachmentsField = document.querySelector<HTMLInputElement>("#compose-attachments");
    if (attachmentsField) attachmentsField.value = attachmentPathsJoinedForHiddenField(merged);
    toast(`${dropped.length} pièce(s) jointe(s) ajoutée(s).`);
    render();
  };

  shell.addEventListener("dragenter", onDragEnter, { signal });
  shell.addEventListener("dragleave", onDragLeave, { signal });
  // Capture : certains enfants (aperçu, zone fichier) peuvent faire échouer le drop sinon.
  shell.addEventListener("dragover", onDragOver, { signal, capture: true });
  shell.addEventListener("drop", onDrop, { signal, capture: true });
}

function extractDroppedPaths(dataTransfer: DataTransfer | null): string[] {
  if (!dataTransfer) return [];
  const files = Array.from(dataTransfer.files ?? []);
  return files
    .map((file) => {
      const localPath = (file as File & { path?: string }).path;
      if (typeof localPath === "string" && localPath.trim()) return localPath.trim();
      return "";
    })
    .filter(Boolean);
}

async function applyMarkdownAction(action: string) {
  const textarea = document.querySelector<HTMLTextAreaElement>("#compose-body");
  if (!textarea) return;

  if (action === "undo") {
    applyMarkdownUndoRedo("undo");
    return;
  }
  if (action === "redo") {
    applyMarkdownUndoRedo("redo");
    return;
  }

  const start = textarea.selectionStart ?? 0;
  const end = textarea.selectionEnd ?? 0;
  const selected = textarea.value.slice(start, end);

  if (action === "link") {
    markdownPushToolbarUndoSnapshot(textarea.value);
    const start = textarea.selectionStart ?? 0;
    const end = textarea.selectionEnd ?? 0;
    const selected = textarea.value.slice(start, end);
    void (async () => {
      const url = await openTextPromptModal({
        title: "Insérer un lien",
        label: "URL",
        defaultValue: "https://",
      });
      if (url == null) {
        markdownPopPendingToolbarSnapshot();
        return;
      }
      const trimmed = url.trim();
      if (!trimmed) {
        markdownPopPendingToolbarSnapshot();
        return;
      }
      const ta = document.querySelector<HTMLTextAreaElement>("#compose-body");
      if (!ta) return;
      const label = selected || "lien";
      const replacement = `[${label}](${trimmed})`;
      ta.setRangeText(replacement, start, end, "end");
      if (!selected) {
        const labelStart = start + 1;
        const labelEnd = labelStart + label.length;
        ta.setSelectionRange(labelStart, labelEnd);
      }
      ta.focus();
      finalizeMarkdownToolbarEdit(ta);
    })();
    return;
  }

  if (action === "image") {
    markdownPushToolbarUndoSnapshot(textarea.value);
    const start = textarea.selectionStart ?? 0;
    const end = textarea.selectionEnd ?? 0;
    const selected = textarea.value.slice(start, end);
    void (async () => {
      const url = await openTextPromptModal({
        title: "Insérer une image",
        label: "URL de l’image",
        defaultValue: "https://",
      });
      if (url == null) {
        markdownPopPendingToolbarSnapshot();
        return;
      }
      const trimmed = url.trim();
      if (!trimmed) {
        markdownPopPendingToolbarSnapshot();
        return;
      }
      const ta = document.querySelector<HTMLTextAreaElement>("#compose-body");
      if (!ta) return;
      const alt = selected || "image";
      const replacement = `![${alt}](${trimmed})`;
      ta.setRangeText(replacement, start, end, "end");
      if (!selected) {
        const altStart = start + 2;
        const altEnd = altStart + alt.length;
        ta.setSelectionRange(altStart, altEnd);
      }
      ta.focus();
      finalizeMarkdownToolbarEdit(ta);
    })();
    return;
  }

  if (action === "table") {
    markdownPushToolbarUndoSnapshot(textarea.value);
    const hdr = "| En-tête 1 ";
    const stub = `\n\n${hdr}| En-tête 2 |\n| --- | --- |\n|  |  |\n\n`;
    textarea.setRangeText(stub, start, end, "end");
    const sliceFrom = Math.min(start, textarea.value.length);
    const hdrPos = textarea.value.indexOf(hdr, sliceFrom);
    if (hdrPos >= 0) {
      const innerStart = hdrPos + 2;
      textarea.setSelectionRange(innerStart, innerStart + "En-tête 1".length);
    }
    textarea.focus();
    finalizeMarkdownToolbarEdit(textarea);
    return;
  }

  markdownPushToolbarUndoSnapshot(textarea.value);

  if (action === "bold") {
    wrapSelection(textarea, start, end, "**", "**", selected || "texte", { selectInnerWhenEmpty: true });
  } else if (action === "italic") {
    wrapSelection(textarea, start, end, "*", "*", selected || "texte", { selectInnerWhenEmpty: true });
  } else if (action === "underline") {
    wrapSelection(textarea, start, end, "<u>", "</u>", selected || "texte", { selectInnerWhenEmpty: true });
  } else if (action === "h1") {
    markdownToggleHeadingLines(textarea, 1);
  } else if (action === "h2") {
    markdownToggleHeadingLines(textarea, 2);
  } else if (action === "h3") {
    markdownToggleHeadingLines(textarea, 3);
  } else if (action === "ul") {
    markdownToggleBulletLines(textarea, "- ");
  } else if (action === "ol") {
    markdownToggleNumberedLines(textarea);
  } else if (action === "quote") {
    markdownToggleBlockquoteLines(textarea);
  } else if (action === "code") {
    markdownInsertCodeOrFence(textarea, start, end, selected);
  } else {
    markdownPopPendingToolbarSnapshot();
    return;
  }

  finalizeMarkdownToolbarEdit(textarea);
}

function wrapSelection(
  textarea: HTMLTextAreaElement,
  start: number,
  end: number,
  prefix: string,
  suffix: string,
  fallbackText: string,
  options?: { selectInnerWhenEmpty?: boolean }
) {
  const selected = textarea.value.slice(start, end);
  const inner = selected || fallbackText;
  const replacement = `${prefix}${inner}${suffix}`;
  textarea.setRangeText(replacement, start, end, "end");
  if (!selected && options?.selectInnerWhenEmpty) {
    const innerStart = start + prefix.length;
    const innerEnd = innerStart + inner.length;
    textarea.setSelectionRange(innerStart, innerEnd);
  }
  textarea.focus();
}

function parseEmailList(value: string): Array<{ email: string; name?: string | null }> {
  return value
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const m = part.match(/^(.+?)\s*<([^>]+)>$/);
      if (m) {
        const email = m[2].trim();
        const name = m[1].trim().replace(/^["']|["']$/g, "");
        return { email, name: name || null };
      }
      return { email: part };
    });
}

function wireComposeRecipientChips(): void {
  if (composeChipsTo) composeRecipientPendingInput.to = composeChipsTo.getPendingInput();
  if (composeChipsCc) composeRecipientPendingInput.cc = composeChipsCc.getPendingInput();
  if (composeChipsBcc) composeRecipientPendingInput.bcc = composeChipsBcc.getPendingInput();
  composeChipsTo?.detach();
  composeChipsCc?.detach();
  composeChipsBcc?.detach();
  composeChipsTo = composeChipsCc = composeChipsBcc = null;
  if (state.view !== "compose" || !state.draft) {
    delete composeRecipientPendingInput.to;
    delete composeRecipientPendingInput.cc;
    delete composeRecipientPendingInput.bcc;
    return;
  }

  const mountField = (
    hostSel: string,
    field: ComposeRecipientField
  ): ComposeRecipientChipsHandle | null => {
    const host = document.querySelector<HTMLElement>(hostSel);
    if (!host) return null;
    const initial: RecipientChip[] = state.draft![field] ?? [];
    const pendingInput = composeRecipientPendingInput[field];
    return mountComposeRecipientChips({
      container: host,
      field,
      initial,
      pendingInput,
      isTauri: isTauriRuntime(),
      onChange: (recipients) => {
        if (!state.draft) return;
        state.draft[field] = recipients;
        scheduleDraftRevisionSave();
      },
      onPendingInputChange: (raw) => {
        if (raw.trim()) composeRecipientPendingInput[field] = raw;
        else delete composeRecipientPendingInput[field];
      },
    });
  };

  composeChipsTo = mountField("#compose-to-host", "to");
  composeChipsCc = mountField("#compose-cc-host", "cc");
  composeChipsBcc = mountField("#compose-bcc-host", "bcc");
}

function wireAtAutocompleteFields(): void {
  atAutocompleteDetach?.();
  hashAutocompleteDetach?.();
  atAutocompleteDetach = null;
  hashAutocompleteDetach = null;
  if (!isTauriRuntime()) return;
  const accountId = currentAccount()?.id;
  const addressAutocompleteOn = () =>
    isAiFeatureEnabled(state.appPrefs.ai, "featureAddressAutocompleteEnabled");
  const detachers: Array<() => void> = [];
  document.querySelectorAll<HTMLInputElement>("#search-input, #search-modal-input").forEach((searchIn) => {
    detachers.push(
      attachAtAutocomplete({
        input: searchIn,
        accountId,
        mode: "search",
        isTauri: true,
        isFeatureEnabled: addressAutocompleteOn,
        onSearchPick: () => {
          state.searchDraft = searchIn.value;
          syncSearchBarChrome();
        },
      })
    );
    detachers.push(
      attachHashAutocomplete({
        input: searchIn,
        getNewsletterRules: () => state.newsletterRules,
        getMailboxes: () => state.mailboxes,
        getAccounts: () =>
          state.accounts.map((a) => ({
            id: a.id,
            email: a.email,
            displayName: a.displayName,
          })),
        getTags: () =>
          state.searchTagCatalog.map((t) => ({
            family: String(t.family).toLowerCase(),
            value: t.value,
          })),
        onPrefetchTags: () => refreshSearchTagCatalog(),
        onApplyHit: (hit) => {
          applyHashAutocompleteHitToState(hit);
          syncSearchBarChrome();
        },
      })
    );
  });
  if (document.querySelector("#search-input, #search-modal-input")) {
    void refreshSearchTagCatalog();
  }
  const chipSpecs: Array<{
    host: string;
    chips: () => ComposeRecipientChipsHandle | null;
    field: "to" | "cc" | "bcc";
  }> = [
    { host: "#compose-to-host", chips: () => composeChipsTo, field: "to" },
    { host: "#compose-cc-host", chips: () => composeChipsCc, field: "cc" },
    { host: "#compose-bcc-host", chips: () => composeChipsBcc, field: "bcc" },
  ];
  for (const spec of chipSpecs) {
    const el = document
      .querySelector<HTMLElement>(spec.host)
      ?.querySelector<HTMLInputElement>(".compose-recipients-input");
    if (!el) continue;
    detachers.push(
      attachAtAutocomplete({
        input: el,
        accountId,
        mode: "compose",
        isTauri: true,
        isFeatureEnabled: addressAutocompleteOn,
        composeChipMode: true,
        onComposePick: (email, displayName) => {
          const handle = spec.chips();
          handle?.addRecipient(email, displayName);
          if (state.draft) state.draft[spec.field] = handle?.getRecipients() ?? state.draft[spec.field];
          scheduleDraftRevisionSave();
        },
      })
    );
  }
  const composeBody = document.querySelector<HTMLTextAreaElement>("#compose-body");
  if (composeBody) {
    detachers.push(
      attachAtAutocomplete({
        input: composeBody,
        accountId,
        mode: "mention",
        isTauri: true,
        isFeatureEnabled: addressAutocompleteOn,
        onMentionPick: () => {
          scheduleDraftRevisionSave();
        },
      })
    );
  }
  if (detachers.length) {
    atAutocompleteDetach = () => {
      for (const d of detachers) d();
    };
  }
}

function mouseNavBlockedByOverlay(): boolean {
  return Boolean(
    state.quoteFoldModal ||
      state.threadTagsModalOpen ||
      state.closeComposeModal ||
      state.imageModal ||
      state.splitSendConfirm ||
      state.moveOpen ||
      state.mailboxManageOpen ||
      state.searchModalOpen ||
      state.settingsAiModal ||
      textPromptModal ||
      confirmModal
  );
}

function isEditableKeyboardTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  return Boolean(el.closest("input, textarea, select, [contenteditable='true']"));
}

/** Raccourcis lettre / Tab / / — pas Échap ni Ctrl+T (gérés avant). */
function singleKeyShortcutsBlocked(): boolean {
  return mouseNavBlockedByOverlay();
}

function keyboardPlainKey(event: KeyboardEvent): boolean {
  return !event.ctrlKey && !event.metaKey && !event.altKey;
}

/** Boutons latéraux souris (3 = retour, 4 = avant) — comme un navigateur. */
function bindMouseNavigation() {
  const handleMouseNav = (event: MouseEvent) => {
    if (event.button !== 3 && event.button !== 4) return;
    const target = event.target as HTMLElement | null;
    if (target?.closest("input, textarea, select, [contenteditable='true']")) return;
    if (mouseNavBlockedByOverlay()) return;
    event.preventDefault();
    event.stopPropagation();
    if (event.button === 3) void goBack();
    else if (navCanGoForward()) void goForward();
  };

  document.addEventListener("auxclick", handleMouseNav, { capture: true });
  // Secours WebView2 / certains pilotes qui n’émettent pas auxclick.
  document.addEventListener(
    "mouseup",
    (event) => {
      if (event.button !== 3 && event.button !== 4) return;
      if (event.defaultPrevented) return;
      handleMouseNav(event);
    },
    { capture: true }
  );
}

function bindKeyboard() {
  document.addEventListener("keydown", (event) => {
    if ((event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === "t") {
      event.preventDefault();
      if (state.searchModalOpen) closeSearchModal();
      else openSearchModal();
      return;
    }
    if ((event.ctrlKey || event.metaKey) && !event.altKey && event.key === "F5") {
      event.preventDefault();
      if (!isTauriRuntime()) {
        toast("Sync IMAP : disponible dans l’app Tauri.");
        return;
      }
      if (state.syncInProgress) {
        toast("Synchronisation déjà en cours.");
        return;
      }
      void syncInbox({ background: state.view === "thread" });
      return;
    }
    if (event.key === "Escape") {
      if (state.settingsAiModal) {
        event.preventDefault();
        finalizeSettingsAiModalClose();
        state.settingsAiModal = null;
        render();
        return;
      }
      if (state.searchModalOpen) {
        event.preventDefault();
        closeSearchModal();
        return;
      }
      if (state.quoteFoldModal) {
        state.quoteFoldModal = null;
        event.preventDefault();
        render();
        return;
      }
      if (state.threadTagsModalOpen) {
        state.threadTagsModalOpen = false;
        event.preventDefault();
        render();
        return;
      }
      if (navCanGoBack() || state.view !== "list") {
        event.preventDefault();
        if (state.view === "thread") clearThreadAiSummaryState();
        void goBack();
        return;
      }
      if (state.aiOpen || state.aiQuickPanelOpen || state.mailboxDigestPanelOpen) {
        event.preventDefault();
        state.aiOpen = false;
        state.aiQuickPanelOpen = false;
        if (mailboxDigestSlotInList()) dismissMailboxDigestPanel();
        render();
        return;
      }
      return;
    }
    if (isEditableKeyboardTarget(event.target)) return;
    if (singleKeyShortcutsBlocked()) return;
    if (!keyboardPlainKey(event)) return;

    const key = event.key.toLowerCase();
    if (key === "n") {
      event.preventDefault();
      void handleAction("compose");
      return;
    }
    if (key === "r" && state.view === "thread") {
      event.preventDefault();
      void handleAction("reply");
      return;
    }
    if (key === "s" && state.view === "thread") {
      event.preventDefault();
      void handleAction("summarize");
      return;
    }
    if (key === "t" && state.view === "thread") {
      event.preventDefault();
      void handleAction("llm-translate-thread");
      return;
    }
    if (key === "m" && state.view === "compose") {
      event.preventDefault();
      void handleAction("toggle-preview");
      return;
    }
    if (key === "tab" && state.view === "thread") {
      event.preventDefault();
      void handleAction("toggle-ai");
      return;
    }
    if (key === "/") {
      event.preventDefault();
      if (state.view === "thread") clearThreadAiSummaryState();
      state.view = "list";
      render();
      const inboxSearch = document.querySelector<HTMLInputElement>("#search-input");
      if (inboxSearch) inboxSearch.focus();
      else openSearchModal();
    }
  });
}

function fallbackStatus(): AppStatus {
  return {
    appName: "RustyMail",
    version: "0.1.1",
    walEnabled: true,
    vaultKeyLocation: "OS Keyring",
    aiRuntime: "ONNX + whisper.cpp"
  };
}

function fallbackCapabilities(): AppCapabilities {
  return {
    mailCore: true,
    readabilityModules: true,
    aiModules: true,
    dictation: false,
    storage: "browser fallback"
  };
}

/** Tauri peut renvoyer snake_case si une couche serde n’applique pas camelCase — évite « cœur off » à tort. */
function normalizeCapabilities(raw: unknown): AppCapabilities {
  const fb = fallbackCapabilities();
  if (!raw || typeof raw !== "object") return fb;
  const r = raw as Record<string, unknown>;
  const pickBool = (camel: keyof AppCapabilities, snake: string, fallback: boolean): boolean => {
    const v = r[camel] ?? r[snake];
    return typeof v === "boolean" ? v : fallback;
  };
  const storageRaw = r.storage;
  return {
    mailCore: pickBool("mailCore", "mail_core", fb.mailCore),
    readabilityModules: pickBool("readabilityModules", "readability_modules", fb.readabilityModules),
    aiModules: pickBool("aiModules", "ai_modules", fb.aiModules),
    dictation: pickBool("dictation", "dictation", fb.dictation),
    storage: typeof storageRaw === "string" && storageRaw.trim() ? storageRaw : fb.storage
  };
}

function normalizeServerSettings(raw: unknown): Account["imap"] {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const sec = String(r.security ?? r.Security ?? "Tls");
  const security: SecurityMode = sec === "StartTls" ? "StartTls" : "Tls";
  return {
    host: String(r.host ?? "").trim(),
    port: Math.max(1, Math.floor(Number(r.port)) || 993),
    security,
    allowInvalidTls: Boolean(r.allowInvalidTls ?? r.allow_invalid_tls)
  };
}

function normalizeAuthKind(raw: unknown): MailAuthKind | undefined {
  const s = String(raw ?? "").trim();
  if (s === "oauthGoogle" || s === "oauth_google") return "oauthGoogle";
  if (s === "oauthMicrosoft" || s === "oauth_microsoft") return "oauthMicrosoft";
  if (s === "password") return "password";
  return undefined;
}

function normalizeAccountRow(raw: unknown): Account | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const id = String(r.id ?? "").trim();
  const email = String(r.email ?? "").trim();
  if (!id && !email) return null;
  const displayName = String(r.displayName ?? r.display_name ?? email).trim();
  return {
    id: id || email.toLowerCase(),
    displayName: displayName || email,
    email: email || id,
    imap: normalizeServerSettings(r.imap),
    smtp: normalizeServerSettings(r.smtp),
    authKind: normalizeAuthKind(r.authKind ?? r.auth_kind)
  };
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function formatTag(tag?: Tag) {
  if (!tag) return "untagged";
  return `${tag.family.toLowerCase()}:${tag.value}`;
}

function isNoisyTag(tag?: Tag) {
  if (!tag) return false;
  if (tag.family === "Source" && tag.value.toLowerCase() === "imap") return true;
  // Entity tags are AI-derived. By default they should not drive the main UI.
  // Even when AI artifacts are shown, identifier:* is still noisy in practice.
  return tag.family === "Entity" && tag.value.startsWith("identifier:");
}

function composeMicButtonTitle(): string {
  if (state.micState === "recording") {
    const ptt = composePushToTalkTargetCode();
    return ptt
      ? "Enregistrement — relâcher la touche ou cliquer pour transcrire."
      : "Enregistrement — cliquer pour arrêter et transcrire.";
  }
  return composeMicFooterHint();
}

function threadQaMicButtonTitle(): string {
  if (state.micState === "recording") {
    const ptt = composePushToTalkTargetCode();
    return ptt
      ? "Enregistrement — relâcher la touche ou cliquer pour dicter la question."
      : "Enregistrement — cliquer pour arrêter et transcrire la question.";
  }
  return threadQaMicFooterHint();
}

function threadQaMicFooterHint(): string {
  if (state.micState === "processing") {
    const bb = state.appPrefs.ai.dictationBackend;
    if (bb === "whisper_cpp") return "Transcription Whisper de votre question…";
    return "Insertion de la question dictée…";
  }
  if (!isTauriRuntime()) return "Dictée : l’app bureau Tauri est requise.";
  if (!state.appPrefs.ai.dictationEnabled) return "Dictée désactivée — Paramètres → IA & dictée.";
  const b = state.appPrefs.ai.dictationBackend;
  const ptt = composePushToTalkTargetCode();
  const pttFrag = ptt ? ` ou maintenir ${composePushToTalkShortcutLabel()}` : "";
  if (b === "whisper_cpp")
    return ptt
      ? `Whisper : clic micro${pttFrag}, relâcher pour dicter la question.`
      : "Whisper : clic sur le micro pour dicter la question.";
  if (b === "cloud")
    return ptt
      ? `Cloud : clic micro${pttFrag} — relâcher pour dicter la question.`
      : "Cloud : clic sur le micro pour dicter la question.";
  if (b === "local_http")
    return ptt ? `Compagnon : clic micro${pttFrag} — relâcher pour dicter.` : "Compagnon : clic sur le micro.";
  return "Dictée de question";
}

function composeMicFooterHint(): string {
  if (state.composeMessage) return state.composeMessage;
  if (state.micState === "processing") {
    const bb = state.appPrefs.ai.dictationBackend;
    if (bb === "whisper_cpp") return "Dictée Whisper en cours…";
    return "Dictée en cours d’insertion…";
  }
  if (!isTauriRuntime()) return "Dictée : l’app bureau Tauri est requise.";
  if (!state.appPrefs.ai.dictationEnabled) return "Dictée désactivée — Paramètres → IA & dictée.";
  const b = state.appPrefs.ai.dictationBackend;
  const ptt = composePushToTalkTargetCode();
  const pttFrag = ptt ? ` ou maintenir ${composePushToTalkShortcutLabel()}` : "";
  if (b === "whisper_cpp")
    return ptt
      ? `Whisper : clic micro${pttFrag}, relâcher pour transcrire (HF auto).`
      : "Whisper : clic sur le micro pour transcrire (HF auto).";
  if (b === "cloud")
    return ptt
      ? `Cloud : clic micro${pttFrag} (clé API requise) — relâcher pour envoyer.`
      : "Cloud : clic sur le micro (clé API requise).";
  if (b === "local_http")
    return ptt ? `Compagnon : clic micro${pttFrag} — relâcher, audio HTTP.` : "Compagnon : clic sur le micro — audio HTTP.";
  return "Dictée";
}

function micAriaLabel(target: MicDictationTarget = "compose") {
  const ptt = composePushToTalkTargetCode();
  const lbl = composePushToTalkShortcutLabel();
  const qa = target === "thread-qa";
  if (state.micState === "recording") {
    return ptt
      ? `Enregistrement en cours — relâcher ${lbl} ou cliquer pour arrêter`
      : "Enregistrement en cours — cliquer pour arrêter";
  }
  if (state.micState === "processing") return qa ? "Transcription de la question en cours" : "Transcription en cours";
  return ptt
    ? `${qa ? "Dicter la question" : "Dictée"} — clic ou maintenir ${lbl}`
    : qa
      ? "Dicter la question — clic sur le micro"
      : "Dictée — clic sur le micro";
}

function inputValue(id: string) {
  return document.querySelector<HTMLInputElement>(`#${id}`)?.value.trim() ?? "";
}

function numberValue(id: string, fallback: number) {
  const value = Number.parseInt(inputValue(id), 10);
  return Number.isFinite(value) ? value : fallback;
}

function selectValue(id: string, fallback: string) {
  return document.querySelector<HTMLSelectElement>(`#${id}`)?.value ?? fallback;
}

function checkedValue(id: string) {
  return document.querySelector<HTMLInputElement>(`#${id}`)?.checked ?? false;
}

function formatTime(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return `${minutes.toString().padStart(2, "0")}:${rest.toString().padStart(2, "0")}`;
}

function trimUrlTrailingPunct(url: string): { href: string; suffix: string } {
  let href = url;
  let suffix = "";
  while (/[.,;:!?)}\]]$/.test(href)) {
    suffix = href.slice(-1) + suffix;
    href = href.slice(0, -1);
  }
  return { href, suffix };
}

function linkifyPlainSegment(segment: string): string {
  const out: string[] = [];
  const urlRe = /https?:\/\/[^\s<>"']+/gi;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = urlRe.exec(segment)) !== null) {
    out.push(escapeHtml(segment.slice(last, m.index)));
    const { href, suffix } = trimUrlTrailingPunct(m[0]);
    out.push(
      `<a class="ai-qa-link" href="${escapeAttr(href)}" target="_blank" rel="noopener noreferrer">${escapeHtml(href)}</a>${escapeHtml(suffix)}`
    );
    last = m.index + m[0].length;
  }
  out.push(escapeHtml(segment.slice(last)));
  return out.join("");
}

/** Texte IA (Q&A, etc.) : échappement + liens Markdown et URL cliquables. */
function formatPlainTextWithLinks(text: string): string {
  const chunks: string[] = [];
  const mdRe = /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = mdRe.exec(text)) !== null) {
    chunks.push(linkifyPlainSegment(text.slice(last, m.index)));
    const { href } = trimUrlTrailingPunct(m[2]);
    const label = m[1].trim() || href;
    chunks.push(
      `<a class="ai-qa-link" href="${escapeAttr(href)}" target="_blank" rel="noopener noreferrer">${escapeHtml(label)}</a>`
    );
    last = m.index + m[0].length;
  }
  chunks.push(linkifyPlainSegment(text.slice(last)));
  return chunks.join("");
}

const DEFAULT_TOAST_DURATION_MS = 7200;
const MAX_TOAST_STACK = 8;

function toast(message: string, durationMs: number = DEFAULT_TOAST_DURATION_MS) {
  let box = document.querySelector<HTMLDivElement>("#toast-box");
  if (!box) {
    box = document.createElement("div");
    box.id = "toast-box";
    box.className = "toast-box";
    document.body.appendChild(box);
  }
  while (box.children.length >= MAX_TOAST_STACK) {
    box.firstElementChild?.remove();
  }
  const element = document.createElement("div");
  element.className = "toast surface-elevated";
  element.textContent = message;
  box.appendChild(element);
  window.setTimeout(() => element.remove(), durationMs);
}
