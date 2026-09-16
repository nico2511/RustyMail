import type { Tag, Entity } from "./tags";
import type { MicDictationTarget } from "./appState";

export type SearchViewBatchJob = {
  phase: "create" | "move";
  done: number;
  total: number;
  target: string;
};

export type ThreadListItem = {
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
  /** Compte propriétaire (liste unifiée). */
  accountId?: string;
  /** Nombre total de pièces jointes sur le fil (Tauri / JSON camelCase). */
  attachmentCount?: number;
  /** Fil détecté comme expéditeur automatique (règles newsletter). */
  isNewsletterThread?: boolean;
  /** Entrée « Sauvés » : nombre de révisions `draft_revisions` pour la session. */
  savedRevisionCount?: number;
  /** ISO création (ligne `saved_drafts`). */
  savedCreatedAt?: string;
};

export type MailSecuritySeverity = "ok" | "attention" | "suspicion";
export type MailSecurityFindingSeverity = "info" | "attention" | "suspicion";

export type MailSecurityFindingKind = "heuristic" | "llmIntent";

export type MailSecurityFinding = {
  kind?: MailSecurityFindingKind;
  code: string;
  severity: MailSecurityFindingSeverity;
  messageFr: string;
};

export type TokenBudgetSnapshot = {
  nCtx?: number;
  inputTokens?: number;
  outputTokens?: number;
  truncated?: boolean;
  strategy?: string;
  itemsIn?: number;
  itemsUsed?: number;
};

export type MailSecuritySignals = {
  severity: MailSecuritySeverity;
  summaryFr: string;
  findings: MailSecurityFinding[];
  llmBudget?: TokenBudgetSnapshot | null;
};

/** Réponses `llm_translate_*` — camelCase Tauri. */
export type LlmTranslationResult = {
  sourceMessageId: string;
  sourceLang: string;
  targetLang: string;
  translatedText: string;
  preservedEntityIds: string[];
};

export type HtmlCleaningProviderKind = "generic" | "amazon" | "deblock" | "github";

export type CleanedMessageView = {
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

export type DiscussionThreadView = {
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

export type Draft = {
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

export type DraftPreview = {
  textPlain: string;
  html: string;
};

export type DraftRevisionListItem = {
  id: string;
  createdAt: string;
};

export type SavedDraftListItem = {
  id: string;
  sessionId: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  revisionCount: number;
};

export type SavedDraftOpenPayload = {
  draft: Draft;
  sessionId: string;
  savedDraftId: string;
};

export type DraftDiffLine = { kind: "eq" | "add" | "del"; text: string };
export type DraftCompareView = "preview" | "diff";

export type SummaryResult = {
  title: string;
  bullets: string[];
  sourceMessageIds: string[];
  budget?: TokenBudgetSnapshot | null;
};

export type AppStatus = {
  appName: string;
  version: string;
  walEnabled: boolean;
  vaultKeyLocation: string;
  aiRuntime: string;
};

export type AppPathsView = {
  dbPath: string;
  prefsPath: string;
  modelsDir: string;
  llmModelsDir: string;
};

/** Aligné sur `LlmStatusPayload` (infra) — camelCase Tauri. */
export type LlmRuntimeStatus = {
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

export type AppCapabilities = {
  mailCore: boolean;
  readabilityModules: boolean;
  aiModules: boolean;
  dictation: boolean;
  storage: string;
};

export type MailboxFolderStatsRow = {
  mailbox: string;
  unreadCount: number;
  totalThreads: number;
};

export type InboxFilterCounts = {
  all: number;
  unread: number;
  starred: number;
  focused: number;
  auto: number;
};

/** Aligné sur `SemanticEmbeddingCountsSnapshot` (infra) — invoke camelCase. */
export type SemanticEmbeddingCountsSnapshot = {
  accountId: string;
  mailbox: string;
  modelId: string;
  embeddingsTotalForAccount: number;
  embeddingsInMailbox: number;
  messagesInMailboxCached: number;
};

/** Règle « expéditeur automatique » : suffixe `domain` + `localPart` exact, ou `*` = toute locale sur ce domaine. */
export type NewsletterRuleRow = { domain: string; localPart: string };

/** Réponse `llm_inbox_digest` (Brief d'action) — camelCase Tauri. */
export type ActionBriefEvidenceLink = {
  threadId: string;
  messageIds: string[];
  label?: string | null;
};
export type ActionBriefChange = {
  id: string;
  summary: string;
  sinceLastBrief: boolean;
  evidenceLinks: ActionBriefEvidenceLink[];
};
export type ActionBriefDecision = {
  rank: number;
  title: string;
  impact: string;
  optionsHint: string[];
  evidenceLinks: ActionBriefEvidenceLink[];
};
export type ActionBriefRecommendedAction = {
  rank: number;
  action: string;
  suggestedOwner: string;
  suggestedDue?: string | null;
  priority: string;
  evidenceLinks: ActionBriefEvidenceLink[];
};
export type ActionBriefRisk = {
  label: string;
  severity: string;
  detail: string;
  evidenceLinks: ActionBriefEvidenceLink[];
};
export type ActionBriefAmbiguity = {
  question: string;
  whyItMatters: string;
  evidenceLinks: ActionBriefEvidenceLink[];
};
export type ActionBriefResult = {
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


export type FluxAffinerResult = {
  folderTitle: string;
  confidence: number;
  rationale: string;
};

export type MailUnsubscribeLink = { href: string; label: string };

export type InlineAttachPayload = { mimeType: string; dataBase64: string };

export type ThreadParticipantLink = { name: string; email: string };

export type ThreadRecipientPresenceEvents = {
  added: Array<{ name?: string | null; email: string }>;
  removed: Array<{ name?: string | null; email: string }>;
};

export type AddressBookRow = {
  accountId: string;
  email: string;
  displayName: string;
  messageCount: number;
  isFavorite: boolean;
  notes: string;
  source: string;
};

export type ShortcutRow = {
  keys: string;
  summary: string;
  detail?: string;
  scope?: string;
};

export type SendDraftOutcome = {
  imapNotice?: string | null;
};

export type SplitChunk = {
  paths: string[];
  totalBytes: number;
  oversized: boolean;
  displayNames: string[];
};

export type SplitPlan = {
  chunks: SplitChunk[];
  budgetBytes: number;
  serverTargetBytes: number;
  encodedOverhead: number;
  hasOversized: boolean;
};

export type SplitSendResult = {
  messageIds: string[];
  imapNotices?: Array<string | null | undefined>;
  failedChunkIndex?: number | null;
  errorMessage?: string | null;
};

export type MicActionOpts = {
  /** Démarrage via maintenir la touche PTT : annuler si elle est relâchée avant le micro. */
  fromPushToTalk?: boolean;
  target?: MicDictationTarget;
};
