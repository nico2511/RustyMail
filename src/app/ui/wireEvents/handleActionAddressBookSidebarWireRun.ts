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

export async function tryHandleAddressBookSidebarWire(action: string, element?: HTMLElement): Promise<boolean> {
  switch (action) {
    case "address-book-refresh":
      void refreshAddressBookList().then(() => render());
      return true;
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
      return true;
    }
    case "address-book-edit": {
      setAddressBookEditEmail(element?.dataset.email?.trim() ?? null);
      render();
      return true;
    }
    case "address-book-cancel-edit":
      setAddressBookEditEmail(null);
      render();
      return true;
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
          setAddressBookEditEmail(null);
          await refreshAddressBookList();
          toast("Contact enregistré.");
          render();
        } catch (e) {
          toast(tauriErrorMessage(e));
        }
      })();
      return true;
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
      return true;
    }
    case "address-book-toggle-fav": {
      void (async () => {
        const acc = currentAccount();
        const email = element?.dataset.email?.trim();
        const row = addressBookRowsCache().find((r) => r.email === email);
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
      return true;
    }
    default:
      return false;
  }
}
