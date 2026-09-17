import type { Account } from "../../../accountSetup";
import type {
  AddressBookRow,
  CleanedMessageView,
  Draft,
  MailSecurityFinding,
  MailSecuritySignals,
  MailUnsubscribeLink,
  MessageViewMode,
  MicDictationTarget,
  State,
  Tag,
  ThreadListItem,
  ThreadParticipantLink,
  ThreadRecipientPresenceEvents,
} from "../../types";
import type { SavedSearchListItem } from "../../../savedSearches";
import type { StatusBarProgressJob } from "../../../statusBarProgress";
import type { SettingsAiPanelDeps } from "../../../settingsAiPanel";
import type { AssistSkillId } from "../../../assistAgent";

/** Callbacks laissés dans application.ts pour éviter les imports circulaires depuis les modules render. */
export type RenderDeps = {
  navCurrentBreadcrumbSegment: () => string | null;
  normalizeThreadSenderLabel: (sender: string) => string;
  formatThreadReadingWhen: (receivedAt: string) => string;
  sortMessagesByReceivedDescending: (messages: CleanedMessageView[]) => CleanedMessageView[];
  effectiveSearchMailboxPath: () => string | null;
  inboxSearchContextActive: () => boolean;
  canSaveSearchView: () => boolean;
  canSaveSearchViewInModal: () => boolean;
  searchDraftDiffersFromCommitted: () => boolean;
  activeSavedSearchItem: () => SavedSearchListItem | undefined;
  searchViewCanOpenOrganizer: () => boolean;
  searchViewCanAffinerFlux: () => boolean;
  sourceMailboxForThread: (threadId: string) => string;
  gatherStatusBarProgressJobs: () => StatusBarProgressJob[];
  currentAccount: () => Account | undefined;
  activeMessageTranslationJobCount: () => number;
  activeSecurityLlmAugmentCount: () => number;
  renderThread: () => string;
  renderComposer: () => string;
  renderSettings: () => string;
  renderContactsListPage: (accountTitle: string) => string;
  renderContactDetailPage: () => string;
  renderOrganizationPage: () => string;
  renderOrganizationV2Page: () => string;
  renderFolderManagerPage: () => string;
  renderList: (mode?: "full" | "threads-only" | "filters-only") => string;
  threadsVisibleInList: () => ThreadListItem[];
  isSearchActive: () => boolean;
  searchViewBatchJobStatusText: () => string;
  folderManagerPanelMailbox: () => string | null;
  threadParticipantsWithEmails: (messages: CleanedMessageView[]) => ThreadParticipantLink[];
  threadQuickReplyTargetName: (msgs: CleanedMessageView[]) => string;
  threadParticipantFirstMessageIds: (messages: CleanedMessageView[]) => Set<string>;
  threadRecipientPresenceEventsByMessageId: (
    messages: CleanedMessageView[],
  ) => Map<string, ThreadRecipientPresenceEvents>;
  threadAiSummaryShownInZen: () => boolean;
  threadIsAutoMail: (thread?: { isNewsletterThread?: boolean } | null, threadId?: string | null) => boolean;
  threadListFollowed: (thread: ThreadListItem) => boolean;
  shouldOfferPerMessageTranslate: (
    message: CleanedMessageView,
    targetLang: string,
    threadTags?: Tag[],
  ) => boolean;
  threadTreeLaneRight: (
    thread: { messages: CleanedMessageView[] },
    message: CleanedMessageView,
  ) => { isRoot: boolean; laneRight: boolean };
  isOwnSender: (sender: string) => boolean;
  senderAccentVars: (sender: string) => string;
  receivedAtIsoDatetime: (receivedAt: string) => string;
  effectiveMessageViewMode: (message: CleanedMessageView, userMode: MessageViewMode) => MessageViewMode;
  threadSuppressAutoEnvelopeMeta: (
    thread: { isNewsletterThread?: boolean },
    message: CleanedMessageView,
    nlListedHere: boolean,
  ) => boolean;
  messageHtmlForDisplay: (message: CleanedMessageView, mode: MessageViewMode) => string | null;
  extractUnsubscribeLinksFromHtml: (raw: string) => MailUnsubscribeLink[];
  threadMessageAnchorId: (messageId: string, index: number) => string;
  normalizedMailSecurity: (message: CleanedMessageView) => MailSecuritySignals;
  mailSecurityTierClass: (ms: MailSecuritySignals) => string;
  mailSecurityFindingsForDisplay: (
    message: CleanedMessageView,
    ms: MailSecuritySignals,
  ) => MailSecurityFinding[];
  zenSummaryHtmlFragments: (text: string) => string;
  parseMaybeDate: (value: string) => Date | null;
  dayKey: (date: Date) => string;
  unsubscribeHrefScore: (hrefRaw: string) => number;
  isSecurityLlmAugmentPending: (messageId: string) => boolean;
  draftHasRecipientsExtra: (draft?: Draft) => boolean;
  attachmentPathsJoinedForHiddenField: (paths: string[]) => string;
  composeKindTitle: (kind?: Draft["kind"]) => string;
  composeMicButtonTitle: () => string;
  micAriaLabel: (target?: MicDictationTarget) => string;
  formatDraftRevisionStamp: (iso: string) => string;
  sanitizeEmailHtml: (
    input: string,
    opts?: { allowRemoteImages?: boolean; relocateUnsubscribe?: boolean; stripOutlookNoise?: boolean },
  ) => { html: string; unsubscribeLinks: MailUnsubscribeLink[] };
  settingsDraftProfile: () => Account | undefined;
  mergedProfileForAccountsForm: () => Account | undefined;
  buildSettingsAiPanelDeps: () => SettingsAiPanelDeps;
  addressBookRowsCache: () => AddressBookRow[];
  addressBookEditEmail: () => string | null;
  addressBookListQuery: () => string;
  accountsFormIdentityScratch: () => { displayName: string; email: string } | undefined;
  threadQaMicButtonTitle: () => string;
  threadAiSummaryForCurrentThread: () => boolean;
  threadIdsMatch: (a: string | null | undefined, b: string | null | undefined) => boolean;
  agentStepProgressLabel: (session: NonNullable<State["agentSession"]>) => string;
  agentSkillEnabled: (skill: AssistSkillId) => boolean;
  agentOfferSlotsStep: (session: NonNullable<State["agentSession"]>) => boolean;
  shouldOfferThreadTranslate: (
    thread: { messages: CleanedMessageView[]; tags?: Tag[] },
    motherLangRaw: string,
  ) => boolean;
  sortUnsubscribeLinks: (links: string[]) => string[];
};

let deps: RenderDeps | null = null;

export function registerRenderDeps(next: RenderDeps): void {
  deps = next;
}

export function renderDeps(): RenderDeps {
  if (!deps) {
    throw new Error("renderDeps: registerRenderDeps() must run before render modules are used");
  }
  return deps;
}
