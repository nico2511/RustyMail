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
      const merged = (app()["groupCollapsedQuotesByAttribution"] as (...a: unknown[]) => unknown)(raw);
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
      await (app()["prepareReply"] as (...a: unknown[]) => unknown)();
      return true;
    case "reply-one":
      await (app()["prepareReplyToMessage"] as (...a: unknown[]) => unknown)(element?.dataset.msgId ?? "");
      return true;
    case "reply-all":
      await (app()["prepareReplyAll"] as (...a: unknown[]) => unknown)();
      return true;
    case "forward":
      await (app()["prepareForward"] as (...a: unknown[]) => unknown)();
      return true;
    case "forward-one":
      await (app()["prepareForwardToMessage"] as (...a: unknown[]) => unknown)(element?.dataset.msgId ?? "");
      return true;
    case "download-all-attachments": {
      const mid = element?.dataset.msgId?.trim();
      if (mid) void (app()["downloadAllAttachmentsForMessage"] as (...a: unknown[]) => unknown)(mid);
      return true;
    }
    case "contacts-entity-open": {
      const href = element?.dataset.href?.trim();
      if (href) void (app()["openExternalFromMailHref"] as (...a: unknown[]) => unknown)(href);
      return true;
    }
    case "contacts-entity-mailto": {
      const email = element?.dataset.email?.trim();
      if (email) void (app()["openExternalFromMailHref"] as (...a: unknown[]) => unknown)(`mailto:${email}`);
      return true;
    }
    case "mail-unsubscribe-open": {
      const href = (app()["decodeHtmlEntitiesLoose"] as (...a: unknown[]) => unknown)(element?.dataset.href?.trim() ?? "");
      const normalized = (app()["normalizeMailHrefForOpen"] as (...a: unknown[]) => unknown)(href);
      if (normalized) void (app()["openExternalFromMailHref"] as (...a: unknown[]) => unknown)(normalized);
      else toast("Lien de désabonnement invalide.");
      return true;
    }
    case "security-mark-newsletter": {
      const email = element?.dataset.senderEmail?.trim() ?? "";
      if (!email.includes("@") || !isTauriRuntime()) return true;
      void (async () => {
        try {
          await withTimeout(invoke("add_newsletter_rule", { input: email }), MAIL_ACTION_TIMEOUT_MS);
          await (app()["loadNewsletterRules"] as (...a: unknown[]) => unknown)();
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
      void (app()["finalizeCloseComposeFromUser"] as (...a: unknown[]) => unknown)();
      return true;
    case "close-close-compose-modal":
      state.closeComposeModal = null;
      render();
      return true;
    case "close-compose-without-saving":
      void (async () => {
        state.closeComposeModal = null;
        render();
        await (app()["discardCurrentDraftSession"] as (...a: unknown[]) => unknown)();
        await (app()["leaveComposeViewAfterClose"] as (...a: unknown[]) => unknown)();
      })();
      return true;
    case "save-and-close-compose": {
      void (async () => {
        state.closeComposeModal = null;
        render();
        const ok = await (app()["saveDraftToSavedListNow"] as (...a: unknown[]) => unknown)({ silentToast: true });
        if (ok) {
          toast("Conservé dans « Sauvés », compositeur fermé.");
          (app()["clearDraftSession"] as (...a: unknown[]) => unknown)();
          await (app()["leaveComposeViewAfterClose"] as (...a: unknown[]) => unknown)();
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
      void (app()["resumeOrphanDraftSession"] as (...a: unknown[]) => unknown)(sid);
      return true;
    }
    case "dismiss-orphan-draft": {
      const sid = element?.dataset.sessionId ?? "";
      void (app()["dismissOrphanDraftSession"] as (...a: unknown[]) => unknown)(sid);
      return true;
    }
    case "toggle-sidebar":
      if (state.view === "compose") return true;
      state.sidebarCollapsed = !state.sidebarCollapsed;
      (app()["writeSidebarCollapsedPreference"] as (...a: unknown[]) => unknown)(state.sidebarCollapsed);
      render();
      return true;
    case "leave-saved-drafts-mailbox":
      void (async () => {
        await (app()["switchMailbox"] as (...a: unknown[]) => unknown)((app()["pickImapMailboxFallback"] as (...a: unknown[]) => unknown)());
      })();
      return true;
    case "refresh-draft-history":
      void (app()["refreshDraftRevisions"] as (...a: unknown[]) => unknown)(60);
      return true;
    case "toggle-draft-versions-expanded":
      if (!isTauriRuntime()) return true;
      state.draftVersionsListExpanded = !state.draftVersionsListExpanded;
      render();
      return true;
    case "compare-draft-revision": {
      const revisionId = element?.dataset.revisionId?.trim() ?? "";
      if (!revisionId) return true;
      void (app()["computeDraftDiffAgainstRevision"] as (...a: unknown[]) => unknown)(revisionId);
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
          (app()["loadComposeMarkdownIntoEditor"] as (...a: unknown[]) => unknown)(restored.markdownBody);
          enterComposeView({ skipHistory: true });
          state.composeLayout = wasHistoriqueLayout ? "historique" : "split";
          syncPreviewOpenFromComposeLayout();
          (app()["resetMarkdownEditorHistory"] as (...a: unknown[]) => unknown)();
          render();
          if (wasHistoriqueLayout) {
            void (app()["refreshDraftRevisions"] as (...a: unknown[]) => unknown)(60);
            void (app()["computeDraftDiffAgainstRevision"] as (...a: unknown[]) => unknown)(revisionId);
          } else {
            window.setTimeout(() => void (app()["computePreview"] as (...a: unknown[]) => unknown)(), 0);
          }
          (app()["scheduleDraftRevisionSave"] as (...a: unknown[]) => unknown)(450);
        } catch (error) {
          console.error("draft_revision_restore", error);
          toast(`Restauration impossible: ${tauriErrorMessage(error)}`);
        }
      })();
      return true;
    }
    case "toggle-preview":
      await (app()["cycleComposeLayout"] as (...a: unknown[]) => unknown)();
      return true;
    case "set-compose-layout": {
      const raw = element?.dataset.composeLayout?.trim();
      if (raw !== "split" && raw !== "write" && raw !== "preview" && raw !== "historique") return true;
      if (raw === "historique" && !isTauriRuntime()) return true;
      state.composeLayout = raw;
      syncPreviewOpenFromComposeLayout();
      render();
      if (raw === "historique") void (app()["refreshDraftRevisions"] as (...a: unknown[]) => unknown)(60);
      if (state.composeLayout !== "write" && state.composeLayout !== "historique") {
        window.setTimeout(() => void (app()["computePreview"] as (...a: unknown[]) => unknown)(), 0);
      }
      return true;
    }
    case "toggle-compose-advanced":
      state.composeAdvancedOpen = !state.composeAdvancedOpen;
      render();
      return true;
    case "toggle-compose-cc-bcc": {
      if ((app()["draftHasRecipientsExtra"] as (...a: unknown[]) => unknown)(state.draft)) return true;
      state.composeCcBccOpen = !state.composeCcBccOpen;
      render();
      return true;
    }
    case "send":
      await (app()["sendDraft"] as (...a: unknown[]) => unknown)();
      return true;
    case "cancel-split-send":
      state.splitSendConfirm = null;
      state.composeMessage = "";
      render();
      return true;
    case "confirm-split-send":
      void (app()["confirmAndExecuteSplitSend"] as (...a: unknown[]) => unknown)();
      return true;
    case "pick-attachments":
      await (app()["pickAttachments"] as (...a: unknown[]) => unknown)();
      return true;
    case "clear-attachments":
      (app()["clearAttachments"] as (...a: unknown[]) => unknown)();
      return true;
    case "remove-attachment":
      (app()["removeAttachment"] as (...a: unknown[]) => unknown)(element?.dataset.path ?? "");
      return true;
    case "quick-reply-send":
      await (app()["sendQuickReply"] as (...a: unknown[]) => unknown)("reply");
      return true;
    case "quick-reply-send-all":
      await (app()["sendQuickReply"] as (...a: unknown[]) => unknown)("reply-all");
      return true;
    case "quick-reply-compose": {
      const qrRaw = element?.dataset.qrIndex;
      if (qrRaw !== undefined && qrRaw !== "") {
        const idx = Number(qrRaw);
        const s = state.quickReplySuggestions[idx];
        if (!s?.text) return true;
        state.composeGrammarSuggestions = null;
        await (app()["prepareReply"] as (...a: unknown[]) => unknown)();
        const add = `${s.text.trim()}\n\n`;
        state.composeBody = `${add}${state.composeBody}`;
        state.composeCanonicalBody = state.composeBody;
        const ta = document.querySelector<HTMLTextAreaElement>("#compose-body");
        if (ta) ta.value = state.composeBody;
        void (app()["computePreview"] as (...a: unknown[]) => unknown)();
        toast("Texte inséré dans le compositeur.");
        render();
      } else {
        await (app()["prepareReply"] as (...a: unknown[]) => unknown)();
      }
      return true;
    }
    case "summarize":
      await (app()["summarizeThread"] as (...a: unknown[]) => unknown)();
      return true;
    case "llm-translate-thread":
      void (app()["llmTranslateThreadUi"] as (...a: unknown[]) => unknown)();
      return true;
    case "llm-translate-message": {
      const mid = element?.dataset.msgId?.trim();
      if (mid) void (app()["llmTranslateMessageUi"] as (...a: unknown[]) => unknown)(mid, element?.dataset.llmTranslateRefresh === "1");
      return true;
    }
    case "llm-quick-replies-thread":
      void (app()["llmQuickRepliesThreadUi"] as (...a: unknown[]) => unknown)();
      return true;
    case "llm-inbox-digest":
      void (app()["llmInboxDigestUi"] as (...a: unknown[]) => unknown)();
      return true;
    case "demo-reset-playground": {
      if (!isTauriRuntime()) {
        toast("Démo : lance l’app via Tauri (`npm run tauri:dev`), pas le navigateur seul.");
        return true;
      }
      try {
        const msg = await invoke<string>("demo_reset_playground_mailbox");
        toast(msg);
        const ok = await (app()["loadAccountsFromBackend"] as (...a: unknown[]) => unknown)({ silent: false });
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
        const ok = await (app()["loadAccountsFromBackend"] as (...a: unknown[]) => unknown)({ silent: false });
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
        void (app()["llmInboxDigestUi"] as (...a: unknown[]) => unknown)();
      }
      return true;
    case "compose-ai-rewrite": {
      const st = element?.dataset.rewriteStyle ?? "Formal";
      void (app()["composeAiRewrite"] as (...a: unknown[]) => unknown)(st);
      return true;
    }
    case "compose-ai-rewrite-selected-tone":
      void (app()["composeAiRewrite"] as (...a: unknown[]) => unknown)(composeRewriteStyleFromTone());
      return true;
    case "compose-ai-grammar":
      void (app()["composeAiGrammar"] as (...a: unknown[]) => unknown)();
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
      void (app()["computePreview"] as (...a: unknown[]) => unknown)();
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
      (app()["cancelLlmQueueJob"] as (...a: unknown[]) => unknown)();
      toast("Annulation demandée…");
      return true;
    case "llm-qa-thread":
      void (app()["llmQaThreadUi"] as (...a: unknown[]) => unknown)();
      return true;
    case "llm-qa-clear":
      state.threadQaAnswer = null;
      state.threadQaStreamText = "";
      render();
      return true;
    case "qa-open-message": {
      const mid = element?.dataset.msgId?.trim();
      if (mid) (app()["scrollToThreadMessage"] as (...a: unknown[]) => unknown)(mid);
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