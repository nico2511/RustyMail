import {
  currentAccount,
  loadMailView,
  loadMailboxUnread,
  render,
  goBack,
  navigateToInbox,
  navigateToBreadcrumbIndex,
  state,
  toast,
  invoke,
  t,
  isTauriRuntime,
  MAIL_ACTION_TIMEOUT_MS,
  openConfirmModal,
  withTimeout,
  tauriErrorMessage,
  setAddressBookEditEmail,
  addressBookRowsCache,
} from "./depsCore";
import {
  commitSearchQuery,
  closeSearchModal,
  openSearchModal,
  launchTagMailSearchFromRawFamily,
  searchNlAssist,
  dismissMailboxDigestPanel,
  mailboxDigestSlotInList,
  saveDraftToSavedListNow,
  refreshAddressBookList,
  loadAddressBookSidebarCount,
  enterComposeView,
  syncPreviewOpenFromComposeLayout,
} from "./depsSearchMail";
import {
  decodeHtmlEntitiesLoose,
  normalizeMailHrefForOpen,
  openExternalFromMailHref,
  prepareForward,
  prepareForwardToMessage,
  prepareReply,
  prepareReplyAll,
  prepareReplyToMessage,
  groupCollapsedQuotesByAttribution,
  downloadAllAttachmentsForMessage,
  loadNewsletterRules,
  sendQuickReply,
  writeSidebarCollapsedPreference,
  scrollToThreadMessage,
  draftHasRecipientsExtra,
  pickImapMailboxFallback,
  switchMailbox,
  finalizeCloseComposeFromUser,
  discardCurrentDraftSession,
  leaveComposeViewAfterClose,
  clearDraftSession,
  cycleComposeLayout,
  removeAttachment,
  clearAttachments,
  cancelLlmQueueJob,
  sendDraft,
  resumeOrphanDraftSession,
  dismissOrphanDraftSession,
  refreshDraftRevisions,
  computeDraftDiffAgainstRevision,
  loadComposeMarkdownIntoEditor,
  resetMarkdownEditorHistory,
  computePreview,
  scheduleDraftRevisionSave,
  pickAttachments,
  confirmAndExecuteSplitSend,
  summarizeThread,
  llmTranslateThreadUi,
  llmTranslateMessageUi,
  llmQuickRepliesThreadUi,
  llmInboxDigestUi,
  loadAccountsFromBackend,
  composeAiRewrite,
  composeAiGrammar,
  llmQaThreadUi,
  persistAiFeaturePrefs,
  setAllAiFeatures,
  normalizeAiPrefsMerged,
  composeRewriteStyleFromTone,
  markThreadsRecentlyRemoved,
  clearThreadsRecentlyRemoved,
  mailboxKind,
  ENABLE_CLEAN_MESSAGE_VIEW,
} from "./depsComposeThread";
import type { CleanedMessageView, Draft, ThreadListItem } from "../../types";
import type { Account } from "../../../accountSetup";

export async function tryHandleSearchModalWire(action: string, element?: HTMLElement): Promise<boolean> {
  switch (action) {
    case "open-search-modal":
      openSearchModal();
      return true;
    case "close-search-modal":
      closeSearchModal();
      return true;
    case "search-modal-commit":
      commitSearchQuery({ fromModal: true });
      return true;
    case "search-nl-assist":
      void searchNlAssist();
      return true;
    default:
      return false;
  }
}
