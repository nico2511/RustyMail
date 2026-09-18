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

export async function tryHandleThreadNavWire(action: string, element?: HTMLElement): Promise<boolean> {
  switch (action) {
    case "back":
    case "nav-back":
      void goBack();
      return true;
    case "nav-crumb": {
      const raw = element?.dataset.navIndex ?? "";
      const idx = Number.parseInt(raw, 10);
      if (Number.isNaN(idx)) return true;
      void navigateToBreadcrumbIndex(idx);
      return true;
    }
    case "nav-inbox":
      navigateToInbox();
      return true;
    case "toggle-sidebar":
      if (state.view === "compose") return true;
      state.sidebarCollapsed = !state.sidebarCollapsed;
      writeSidebarCollapsedPreference(state.sidebarCollapsed);
      render();
      return true;
    case "leave-saved-drafts-mailbox":
      void (async () => {
        await switchMailbox(pickImapMailboxFallback());
      })();
      return true;
    default:
      return false;
  }
}
