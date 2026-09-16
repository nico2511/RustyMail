import type { Account, MailAuthKind, OAuthAccountWizardPhase } from "../../accountSetup";
import type { AppPrefs } from "../../prefs_defaults";
import type { SettingsAiModalId } from "../../settingsAiPanel";
import type { StatusBarProgressJob } from "../../statusBarProgress";
import type { SavedSearchListItem } from "../../savedSearches";
import type { SuggestedSavedView } from "../../activity";
import type { OrganizationViewState } from "../../organizationView";
import type { OrganizationV2ViewState } from "../../organizationViewV2";
import type { FolderManagerViewState } from "../../folderManagerView";
import type { PromptCatalogItem } from "../../promptsSettingsPanel";
import type {
  AssistMode,
  AssistFactsSnapshot,
  AssistRecommendation,
  AssistRoutingPlan,
  AssistRunStep,
  AssistSkillId,
} from "../../assistAgent";
import type { AppView } from "../../navigation";
import type { Tag } from "./tags";
import type {
  ThreadListItem,
  DiscussionThreadView,
  Draft,
  DraftPreview,
  DraftRevisionListItem,
  DraftDiffLine,
  DraftCompareView,
  ActionBriefResult,
  SplitPlan,
  NewsletterRuleRow,
  InboxFilterCounts,
  SemanticEmbeddingCountsSnapshot,
  LlmRuntimeStatus,
  AppStatus,
  AppCapabilities,
  AppPathsView,
} from "./mail";
import type { CloseComposeModal, OrphanDraftSessionItem, ResumeDraftModal } from "./modals";

export type View = AppView;
export type ComposeLayout = "split" | "write" | "preview" | "historique";
export type MicState = "idle" | "recording" | "processing";
export type Tone = "Professional" | "Casual" | "Assertive" | "Empathetic";
export type MessageViewMode = "clean" | "original";
export type MicDictationTarget = "compose" | "thread-qa";
export type SearchViewBatchJob = {
  phase: "create" | "move";
  done: number;
  total: number;
  target: string;
};

export type State = {
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
  /** `#last:Nd` */
  searchRelativeDays: number | null;
  /** `#pj` / `has:attachment` */
  searchHasAttachment: boolean | null;
  /** `#security:N` */
  searchMinSecurityScore: number | null;
  /** `#archive` → `mailbox_prefix` */
  searchMailboxPrefix: string | null;
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
  /** Modale reprise : sessions orphelines après crash / fermeture brutale. */
  resumeDraftModal: ResumeDraftModal;
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
