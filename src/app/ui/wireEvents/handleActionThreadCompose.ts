// @ts-nocheck
import { callApp } from "./callApp";
import {
  currentAccount,
  loadMailView,
  loadMailboxUnread,
  render,
  goBack,
  navigateToInbox,
  navigateToBreadcrumbIndex,
  persistAiFeaturePrefs,
  enterComposeView,
  startNewDraftSession,
  syncPreviewOpenFromComposeLayout,
  refreshAddressBookList,
  loadAddressBookSidebarCount,
  saveDraftToSavedListNow,
  applyListFilter,
  threadIdsMatch,
  state,
  toast,
  invoke,
  t,
  isTauriRuntime,
  MAIL_ACTION_TIMEOUT_MS,
  BOOT_INVOKE_TIMEOUT_MS,
  OAUTH_DESKTOP_LOGIN_TIMEOUT_MS,
  openConfirmModal,
  finishConfirmModal,
  finishTextPromptModal,
  accountFieldTouched,
  setAllAiFeatures,
  normalizeAiPrefsMerged,
  navCanGoBack,
  composeRewriteStyleFromTone,
  mailboxDigestSlotInList,
  dismissMailboxDigestPanel,
  enqueueMailboxDigestRefreshWhenIdle,
  ipcThrottleMs,
  clearSuggestionShownKeys,
  setLocale,
  isSavedDraftsVirtualMailbox,
  captureAiPrefsFieldsFromDom,
  syncLlmEnginePrefsToDom,
  applyEngineConnectionMode,
  normalizeSettingsAiModalId,
  defaultEnabledSkillIds,
  invalidateIdleAiCachePrefetch,
  scheduleIdleAiCachePrefetch,
  loadContactsList,
  isContactsListLoading,
  contactsListHasMore,
  getContactDetail,
  getContactsKeywordDraft,
  setContactsKeywordDraft,
  loadContactDetail,
  loadContactProfile,
  isAiFeatureEnabled,
  markThreadsRecentlyRemoved,
  clearThreadsRecentlyRemoved,
  mailboxKind,
  threadMailboxListLabel,
  saveFolderTreeExpanded,
  setMailboxLocked,
  orgV2ScanAccount,
  orgUndoLast,
  orgScanAccount,
  orgRetagAccount,
  safeInvoke,
  withTimeout,
  tauriErrorMessage,
  setSkipAccountIdentityCaptureOnce,
  setAddressBookEditEmail,
  addressBookRowsCache,
  commitSearchQuery,
  closeSearchModal,
  openSearchModal,
  launchTagMailSearchFromRawFamily,
  searchNlAssist,
  DEFAULT_ACCOUNT_PROMPT_DISMISS_KEY,
  LIST_FILTER_VALUES,
  ENABLE_CLEAN_MESSAGE_VIEW,
  type OAuthDesktopLoginOutcome,
  type Draft,
  type Tone,
  type PromptCatalogItem,
  type AssistMode,
  type AssistSkillId,
  type State,
} from "./deps";

export async function tryHandleThreadCompose(action: string, element?: HTMLElement): Promise<boolean> {
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
    case "toggle-ai-quick-panel":
      state.aiQuickPanelOpen = !state.aiQuickPanelOpen;
      render();
      return true;
    case "toggle-thread-quick-reply": {
      state.threadQuickReplyOpen = !state.threadQuickReplyOpen;
      render();
      if (state.threadQuickReplyOpen) {
        window.setTimeout(() => {
          document.querySelector<HTMLInputElement>("[data-quick-reply]")?.focus();
        }, 340);
      }
      return true;
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
      return true;
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
      return true;
    case "toggle-ai": {
      if (mailboxDigestSlotInList()) {
        dismissMailboxDigestPanel();
        return true;
      }
      if (state.aiOpen) state.aiOpen = false;
      else if (state.view === "thread" || state.view === "list") state.aiOpen = true;
      render();
      return true;
    }
    case "open-quote-fold": {
      const mid = element?.dataset.msgId?.trim();
      if (!mid || !state.selectedThread) return true;
      const msg = state.selectedThread.messages.find((x) => x.messageId === mid);
      const raw = msg?.collapsedQuotes ?? [];
      if (!raw.length) return true;
      const merged = callApp("groupCollapsedQuotesByAttribution", raw);
      if (!merged.length) return true;
      state.quoteFoldModal = {
        senderLabel: (msg?.sender ?? "").trim() || mid,
        blocks: merged,
        foldedLines: raw.length
      };
      render();
      return true;
    }
    case "close-quote-fold":
      state.quoteFoldModal = null;
      render();
      return true;
    case "open-thread-tags":
      if (state.view === "thread" && state.selectedThread) {
        state.threadTagsModalOpen = !state.threadTagsModalOpen;
        render();
      }
      return true;
    case "close-thread-tags":
      state.threadTagsModalOpen = false;
      render();
      return true;
    case "search-from-tag": {
      const family = element?.dataset.tagFamily?.trim();
      const value = element?.dataset.tagValue?.trim();
      if (!family || !value) return true;
      launchTagMailSearchFromRawFamily(family, value);
      return true;
    }
    case "close-image-modal":
      if (state.imageModal?.revokeObjectUrl) URL.revokeObjectURL(state.imageModal.revokeObjectUrl);
      state.imageModal = null;
      render();
      return true;
    case "toggle-message-view":
      if (!ENABLE_CLEAN_MESSAGE_VIEW) return true;
      state.messageViewMode = state.messageViewMode === "clean" ? "original" : "clean";
      render();
      return true;
    case "reply":
      await callApp("prepareReply");
      return true;
    case "reply-one":
      await callApp("prepareReplyToMessage", element?.dataset.msgId ?? "");
      return true;
    case "reply-all":
      await callApp("prepareReplyAll");
      return true;
    case "forward":
      await callApp("prepareForward");
      return true;
    case "forward-one":
      await callApp("prepareForwardToMessage", element?.dataset.msgId ?? "");
      return true;
    case "download-all-attachments": {
      const mid = element?.dataset.msgId?.trim();
      if (mid) void callApp("downloadAllAttachmentsForMessage", mid);
      return true;
    }
    case "contacts-entity-open": {
      const href = element?.dataset.href?.trim();
      if (href) void callApp("openExternalFromMailHref", href);
      return true;
    }
    case "contacts-entity-mailto": {
      const email = element?.dataset.email?.trim();
      if (email) void callApp("openExternalFromMailHref", `mailto:${email}`);
      return true;
    }
    case "mail-unsubscribe-open": {
      const href = callApp("decodeHtmlEntitiesLoose", element?.dataset.href?.trim() ?? "");
      const normalized = callApp("normalizeMailHrefForOpen", href);
      if (normalized) void callApp("openExternalFromMailHref", normalized);
      else toast("Lien de désabonnement invalide.");
      return true;
    }
    case "security-mark-newsletter": {
      const email = element?.dataset.senderEmail?.trim() ?? "";
      if (!email.includes("@") || !isTauriRuntime()) return true;
      void (async () => {
        try {
          await withTimeout(invoke("add_newsletter_rule", { input: email }), MAIL_ACTION_TIMEOUT_MS);
          await callApp("loadNewsletterRules");
          toast(t("toast.newsletterRuleAdded"));
          render();
        } catch (e) {
          toast(tauriErrorMessage(e));
        }
      })();
      return true;
    }
    case "security-move-junk": {
      const tid = element?.dataset.threadId?.trim() ?? "";
      const source = element?.dataset.sourceMailbox?.trim() || state.selectedMailbox || "INBOX";
      if (!tid || !isTauriRuntime()) return true;
      void (async () => {
        const spam = state.mailboxes.find((m) => mailboxKind(m) === "spam");
        if (!spam) {
          toast(t("toast.junkFolderMissing"));
          return;
        }
        const account = currentAccount();
        if (!account?.id) return;
        try {
          markThreadsRecentlyRemoved([tid]);
          await withTimeout(
            invoke<string>("move_thread_mailbox", {
              accountId: account.id,
              mailbox: source,
              threadId: tid,
              destMailbox: spam,
            }),
            MAIL_ACTION_TIMEOUT_MS,
          );
          toast(t("toast.movedToJunk"));
          state.threads = state.threads.filter((t) => String(t.id) !== tid);
          if (state.selectedThreadId === tid) {
            state.selectedThreadId = undefined;
            state.selectedThread = undefined;
            state.view = "list";
          }
          await loadMailboxUnread();
          render();
        } catch (e) {
          clearThreadsRecentlyRemoved([tid]);
          toast(tauriErrorMessage(e));
        }
      })();
      return true;
    }
    case "security-filter-search": {
      state.searchDraft = ((state.searchDraft || "") + " #security:50").trim();
      state.searchModalOpen = true;
      toast("Filtre #security:50 ajouté — lancez la recherche.");
      render();
      return true;
    }
    case "close-compose":
      void callApp("finalizeCloseComposeFromUser");
      return true;
    case "close-close-compose-modal":
      state.closeComposeModal = null;
      render();
      return true;
    case "close-compose-without-saving":
      void (async () => {
        state.closeComposeModal = null;
        render();
        await callApp("discardCurrentDraftSession");
        await callApp("leaveComposeViewAfterClose");
      })();
      return true;
    case "save-and-close-compose": {
      void (async () => {
        state.closeComposeModal = null;
        render();
        const ok = await callApp("saveDraftToSavedListNow", { silentToast: true });
        if (ok) {
          toast("Conservé dans « Sauvés », compositeur fermé.");
          callApp("clearDraftSession");
          await callApp("leaveComposeViewAfterClose");
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
      void callApp("resumeOrphanDraftSession", sid);
      return true;
    }
    case "dismiss-orphan-draft": {
      const sid = element?.dataset.sessionId ?? "";
      void callApp("dismissOrphanDraftSession", sid);
      return true;
    }
    case "toggle-sidebar":
      if (state.view === "compose") return true;
      state.sidebarCollapsed = !state.sidebarCollapsed;
      callApp("writeSidebarCollapsedPreference", state.sidebarCollapsed);
      render();
      return true;
    case "leave-saved-drafts-mailbox":
      void (async () => {
        await callApp("switchMailbox", callApp("pickImapMailboxFallback"));
      })();
      return true;
    case "refresh-draft-history":
      void callApp("refreshDraftRevisions", 60);
      return true;
    case "toggle-draft-versions-expanded":
      if (!isTauriRuntime()) return true;
      state.draftVersionsListExpanded = !state.draftVersionsListExpanded;
      render();
      return true;
    case "compare-draft-revision": {
      const revisionId = element?.dataset.revisionId?.trim() ?? "";
      if (!revisionId) return true;
      void callApp("computeDraftDiffAgainstRevision", revisionId);
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
          callApp("loadComposeMarkdownIntoEditor", restored.markdownBody);
          enterComposeView({ skipHistory: true });
          state.composeLayout = wasHistoriqueLayout ? "historique" : "split";
          syncPreviewOpenFromComposeLayout();
          callApp("resetMarkdownEditorHistory");
          render();
          if (wasHistoriqueLayout) {
            void callApp("refreshDraftRevisions", 60);
            void callApp("computeDraftDiffAgainstRevision", revisionId);
          } else {
            window.setTimeout(() => void callApp("computePreview"), 0);
          }
          callApp("scheduleDraftRevisionSave", 450);
        } catch (error) {
          console.error("draft_revision_restore", error);
          toast(`Restauration impossible: ${tauriErrorMessage(error)}`);
        }
      })();
      return true;
    }
    case "toggle-preview":
      await callApp("cycleComposeLayout");
      return true;
    case "set-compose-layout": {
      const raw = element?.dataset.composeLayout?.trim();
      if (raw !== "split" && raw !== "write" && raw !== "preview" && raw !== "historique") return true;
      if (raw === "historique" && !isTauriRuntime()) return true;
      state.composeLayout = raw;
      syncPreviewOpenFromComposeLayout();
      render();
      if (raw === "historique") void callApp("refreshDraftRevisions", 60);
      if (state.composeLayout !== "write" && state.composeLayout !== "historique") {
        window.setTimeout(() => void callApp("computePreview"), 0);
      }
      return true;
    }
    case "toggle-compose-advanced":
      state.composeAdvancedOpen = !state.composeAdvancedOpen;
      render();
      return true;
    case "toggle-compose-cc-bcc": {
      if (callApp("draftHasRecipientsExtra", state.draft)) return true;
      state.composeCcBccOpen = !state.composeCcBccOpen;
      render();
      return true;
    }
    case "send":
      await callApp("sendDraft");
      return true;
    case "cancel-split-send":
      state.splitSendConfirm = null;
      state.composeMessage = "";
      render();
      return true;
    case "confirm-split-send":
      void callApp("confirmAndExecuteSplitSend");
      return true;
    case "pick-attachments":
      await callApp("pickAttachments");
      return true;
    case "clear-attachments":
      callApp("clearAttachments");
      return true;
    case "remove-attachment":
      callApp("removeAttachment", element?.dataset.path ?? "");
      return true;
    case "quick-reply-send":
      await callApp("sendQuickReply", "reply");
      return true;
    case "quick-reply-send-all":
      await callApp("sendQuickReply", "reply-all");
      return true;
    case "quick-reply-compose": {
      const qrRaw = element?.dataset.qrIndex;
      if (qrRaw !== undefined && qrRaw !== "") {
        const idx = Number(qrRaw);
        const s = state.quickReplySuggestions[idx];
        if (!s?.text) return true;
        state.composeGrammarSuggestions = null;
        await callApp("prepareReply");
        const add = `${s.text.trim()}\n\n`;
        state.composeBody = `${add}${state.composeBody}`;
        state.composeCanonicalBody = state.composeBody;
        const ta = document.querySelector<HTMLTextAreaElement>("#compose-body");
        if (ta) ta.value = state.composeBody;
        void callApp("computePreview");
        toast("Texte inséré dans le compositeur.");
        render();
      } else {
        await callApp("prepareReply");
      }
      return true;
    }
    case "summarize":
      await callApp("summarizeThread");
      return true;
    case "llm-translate-thread":
      void callApp("llmTranslateThreadUi");
      return true;
    case "llm-translate-message": {
      const mid = element?.dataset.msgId?.trim();
      if (mid) void callApp("llmTranslateMessageUi", mid, element?.dataset.llmTranslateRefresh === "1");
      return true;
    }
    case "llm-quick-replies-thread":
      void callApp("llmQuickRepliesThreadUi");
      return true;
    case "llm-inbox-digest":
      void callApp("llmInboxDigestUi");
      return true;
    case "demo-reset-playground": {
      if (!isTauriRuntime()) {
        toast("Démo : lance l’app via Tauri (`npm run tauri:dev`), pas le navigateur seul.");
        return true;
      }
      try {
        const msg = await invoke<string>("demo_reset_playground_mailbox");
        toast(msg);
        const ok = await callApp("loadAccountsFromBackend", { silent: false });
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
      return true;
    }
    case "demo-remove-playground": {
      if (!isTauriRuntime()) {
        toast("Démo : lance l’app via Tauri (`npm run tauri:dev`), pas le navigateur seul.");
        return true;
      }
      const confirmed = await openConfirmModal({
        title: "Supprimer la boîte démo ?",
        body:
          "Le compte playground@demo.rustymail.app et toutes ses données locales seront effacés (messages, cache, index sémantique pour ce compte, mot de passe factice dans le trousseau). Vous pourrez ensuite configurer un compte IMAP réel dans Paramètres → Comptes. Les modèles IA téléchargés (MiniLM, GGUF) restent sur disque.",
        danger: true,
        confirmLabel: "Supprimer la démo",
      });
      if (!confirmed) return true;
      try {
        const msg = await invoke<string>("demo_remove_playground_mailbox");
        toast(msg);
        const DEMO = "playground@demo.rustymail.app";
        const ok = await callApp("loadAccountsFromBackend", { silent: false });
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
      return true;
    }
    case "toggle-mailbox-digest-panel":
      if (mailboxDigestSlotInList()) {
        dismissMailboxDigestPanel();
      } else {
        void callApp("llmInboxDigestUi");
      }
      return true;
    case "compose-ai-rewrite": {
      const st = element?.dataset.rewriteStyle ?? "Formal";
      void callApp("composeAiRewrite", st);
      return true;
    }
    case "compose-ai-rewrite-selected-tone":
      void callApp("composeAiRewrite", composeRewriteStyleFromTone());
      return true;
    case "compose-ai-grammar":
      void callApp("composeAiGrammar");
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
      void callApp("computePreview");
      toast("Remplacement appliqué (première occurrence).");
      render();
      return true;
    }
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
    case "llm-cancel-job":
      callApp("cancelLlmQueueJob");
      toast("Annulation demandée…");
      return true;
    case "llm-qa-thread":
      void callApp("llmQaThreadUi");
      return true;
    case "llm-qa-clear":
      state.threadQaAnswer = null;
      state.threadQaStreamText = "";
      render();
      return true;
    case "qa-open-message": {
      const mid = element?.dataset.msgId?.trim();
      if (mid) callApp("scrollToThreadMessage", mid);
      return true;
    }
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