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

export async function tryHandleComposeWire(action: string, element?: HTMLElement): Promise<boolean> {
  switch (action) {
    case "close-compose":
      void finalizeCloseComposeFromUser();
      return true;
    case "close-close-compose-modal":
      state.closeComposeModal = null;
      render();
      return true;
    case "close-compose-without-saving":
      void (async () => {
        state.closeComposeModal = null;
        render();
        await discardCurrentDraftSession();
        await leaveComposeViewAfterClose();
      })();
      return true;
    case "save-and-close-compose": {
      void (async () => {
        state.closeComposeModal = null;
        render();
        const ok = await saveDraftToSavedListNow({ silentToast: true });
        if (ok) {
          toast("Conservé dans « Sauvés », compositeur fermé.");
          clearDraftSession();
          await leaveComposeViewAfterClose();
        }
      })();
      return true;
    }
    case "close-resume-draft-modal":
      state.resumeDraftModal = null;
      render();
      return true;
    case "resume-orphan-draft": {
      const sid = element?.dataset.sessionId ?? "";
      void resumeOrphanDraftSession(sid);
      return true;
    }
    case "dismiss-orphan-draft": {
      const sid = element?.dataset.sessionId ?? "";
      void dismissOrphanDraftSession(sid);
      return true;
    }
    case "refresh-draft-history":
      void refreshDraftRevisions(60);
      return true;
    case "toggle-draft-versions-expanded":
      if (!isTauriRuntime()) return true;
      state.draftVersionsListExpanded = !state.draftVersionsListExpanded;
      render();
      return true;
    case "compare-draft-revision": {
      const revisionId = element?.dataset.revisionId?.trim() ?? "";
      if (!revisionId) return true;
      void computeDraftDiffAgainstRevision(revisionId);
      return true;
    }
    case "toggle-draft-compare-view":
      state.draftDiffView = state.draftDiffView === "preview" ? "diff" : "preview";
      render();
      return true;
    case "restore-draft-revision": {
      if (!isTauriRuntime()) return true;
      const revisionId = element?.dataset.revisionId?.trim() ?? "";
      const accountId = currentAccount()?.id?.trim() ?? "";
      if (!revisionId || !accountId) return true;
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
      return true;
    }
    case "toggle-preview":
      await cycleComposeLayout();
      return true;
    case "set-compose-layout": {
      const raw = element?.dataset.composeLayout?.trim();
      if (raw !== "split" && raw !== "write" && raw !== "preview" && raw !== "historique") return true;
      if (raw === "historique" && !isTauriRuntime()) return true;
      state.composeLayout = raw;
      syncPreviewOpenFromComposeLayout();
      render();
      if (raw === "historique") void refreshDraftRevisions(60);
      if (state.composeLayout !== "write" && state.composeLayout !== "historique") {
        window.setTimeout(() => void computePreview(), 0);
      }
      return true;
    }
    case "toggle-compose-advanced":
      state.composeAdvancedOpen = !state.composeAdvancedOpen;
      render();
      return true;
    case "toggle-compose-cc-bcc": {
      if (draftHasRecipientsExtra(state.draft)) return true;
      state.composeCcBccOpen = !state.composeCcBccOpen;
      render();
      return true;
    }
    case "send":
      await sendDraft();
      return true;
    case "cancel-split-send":
      state.splitSendConfirm = null;
      state.composeMessage = "";
      render();
      return true;
    case "confirm-split-send":
      void confirmAndExecuteSplitSend();
      return true;
    case "pick-attachments":
      await pickAttachments();
      return true;
    case "clear-attachments":
      clearAttachments();
      return true;
    case "remove-attachment":
      removeAttachment(element?.dataset.path ?? "");
      return true;
    case "compose-ai-rewrite": {
      const st = element?.dataset.rewriteStyle ?? "Formal";
      void composeAiRewrite(st);
      return true;
    }
    case "compose-ai-rewrite-selected-tone":
      void composeAiRewrite(composeRewriteStyleFromTone());
      return true;
    case "compose-ai-grammar":
      void composeAiGrammar();
      return true;
    case "compose-grammar-dismiss":
      state.composeGrammarSuggestions = null;
      render();
      return true;
    case "compose-grammar-apply": {
      const gi = Number(element?.dataset.grammarI ?? "");
      const g = state.composeGrammarSuggestions?.[gi];
      if (!g) return true;
      const ta = document.querySelector<HTMLTextAreaElement>("#compose-body");
      const src = ta?.value ?? state.composeBody;
      const o = g.original ?? "";
      const r = g.replacement ?? "";
      if (!o) return true;
      const next = src.replace(o, r);
      state.composeBody = next;
      state.composeCanonicalBody = next;
      if (ta) ta.value = next;
      void computePreview();
      toast("Remplacement appliqué (première occurrence).");
      render();
      return true;
    }
    default:
      return false;
  }
}
