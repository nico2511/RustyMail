// @ts-nocheck
import {
  currentAccount,
  loadMailView,
  searchThreads,
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
  openThread,
  clearSearchAndReloadInbox,
  resetManualSearchNlFilters,
  isSearchActive,
  saveCurrentSearchView,
  applySavedSearchView,
  deleteSavedSearchView,
  markActiveSavedSearchSeen,
  acceptSuggestedSavedView,
  dismissSuggestedSavedView,
  bulkMarkReadSearchViewThreads,
  bulkArchiveSearchViewThreads,
  runFluxAffinerFromSearchView,
  bulkTrashVisibleThreads,
  launchDomainMailSearch,
  launchContactMailSearch,
  usesSearchContextLoader,
  loadThreadsForSearchContext,
  render,
  goBack,
  navigateToInbox,
  onEmptyTrashMailbox,
  onThreadMove,
  onThreadSeen,
  onThreadToggleFollow,
  openMoveDialog,
  confirmMoveDialog,
  syncInbox,
  mailboxManageAction,
  agentPrepareReplyStart,
  agentPrepareReplyContinue,
  stopAgentTelemetry,
  agentInsertDraftIntoCompose,
  summarizeSenderThreadsLight,
  llmQuickRepliesComposeUi,
  micAction,
  saveAccount,
  enterComposeView,
  startNewDraftSession,
  syncPreviewOpenFromComposeLayout,
  openContactDetailView,
  openOrganizationV2View,
  loadAddressBookSidebarCount,
  refreshAddressBookList,
  saveDraftToSavedListNow,
  refreshSavedDraftsMailboxCount,
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

export async function tryHandleInboxSearch(action: string, element?: HTMLElement): Promise<boolean> {
  switch (action) {
    case "contacts-back-list":
      if (navCanGoBack()) void goBack();
      else {
        state.view = "contacts";
        state.selectedContactEmail = undefined;
        render();
      }
      return true;
    case "contacts-back-inbox":
      navigateToInbox();
      return true;
    case "contacts-refresh-list": {
      const acc = currentAccount();
      if (acc?.id) {
        void loadContactsList(acc.id, { reset: true })
          .then(() => loadAddressBookSidebarCount())
          .then(() => render());
      }
      return true;
    }
    case "contacts-load-more": {
      const acc = currentAccount();
      if (acc?.id) void loadContactsList(acc.id).then(() => render());
      return true;
    }
    case "contacts-open-detail": {
      const email = element?.dataset.email?.trim();
      if (email) void openContactDetailView(email);
      return true;
    }
    case "contacts-open-thread": {
      const tid = element?.dataset.threadId?.trim();
      if (tid) void openThread(tid);
      return true;
    }
    case "contacts-compose": {
      const d = getContactDetail();
      const to = d?.email || state.selectedContactEmail;
      if (!to) return true;
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
      return true;
    }
    case "contacts-toggle-fav": {
      const acc = currentAccount();
      const email = element?.dataset.email?.trim() || state.selectedContactEmail;
      const d = getContactDetail();
      if (!acc?.id || !email || !d) return true;
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
      return true;
    }
    case "contacts-llm-profile": {
      if (!isAiFeatureEnabled(state.appPrefs.ai, "featureContactProfileEnabled")) {
        toast("Activez « Profil IA contact » dans les réglages IA.");
        return true;
      }
      const acc = currentAccount();
      const email = element?.dataset.email?.trim() || state.selectedContactEmail;
      if (!acc?.id || !email) return true;
      void (async () => {
        await loadContactProfile(acc.id!, email);
        render();
        toast("Profil IA chargé.");
      })();
      return true;
    }
    case "contacts-search-domain": {
      const domain = element?.dataset.domain?.trim();
      if (domain) void launchDomainMailSearch(domain);
      return true;
    }
    case "contacts-search-all":
    case "contacts-search-unread":
    case "contacts-search-focused":
    case "contacts-search-auto":
    case "contacts-search-keyword":
    case "contacts-search-hybrid": {
      const email = state.selectedContactEmail || getContactDetail()?.email;
      if (!email) return true;
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
      return true;
    }
    case "address-book-export-vcard": {
      const acc = currentAccount();
      if (!acc?.id) {
        toast("Sélectionnez un compte.");
        return true;
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
      return true;
    }
    case "address-book-import-vcard": {
      const acc = currentAccount();
      if (!acc?.id) {
        toast("Sélectionnez un compte.");
        return true;
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
      return true;
    }
    case "agent-prepare-start":
      void agentPrepareReplyStart();
      return true;
    case "agent-prepare-continue":
      void agentPrepareReplyContinue();
      return true;
    case "agent-prepare-cancel":
      void stopAgentTelemetry().then(() => {
        state.agentSession = null;
        render();
      });
      return true;
    case "agent-insert-compose":
      void agentInsertDraftIntoCompose();
      return true;
    case "agent-append-slot": {
      const slot = element?.dataset.slot?.trim();
      if (slot) void agentInsertDraftIntoCompose(slot);
      return true;
    }
    case "agent-append-all-slots": {
      const s = state.agentSession;
      if (s?.slots.length) void agentInsertDraftIntoCompose(s.slots.join("\n"));
      return true;
    }
    case "summarize-sender-threads":
      void summarizeSenderThreadsLight();
      return true;
    case "llm-quick-replies-compose":
      void llmQuickRepliesComposeUi();
      return true;
    case "mic":
      await micAction({ target: "compose" });
      return true;
    case "mic-thread-qa":
      await micAction({ target: "thread-qa" });
      return true;
    case "save-account":
      await saveAccount();
      return true;
    case "sync-inbox":
      void syncInbox({ background: state.view === "thread" });
      return true;
    case "empty-trash-mailbox":
      void onEmptyTrashMailbox();
      return true;
    case "bulk-trash-visible":
      void bulkTrashVisibleThreads();
      return true;
    case "save-saved-search":
      void saveCurrentSearchView();
      return true;
    case "clear-search-exit":
      void clearSearchAndReloadInbox();
      return true;
    case "apply-saved-search": {
      const sid = element?.dataset.savedSearchId?.trim();
      if (sid) void applySavedSearchView(sid);
      return true;
    }
    case "delete-saved-search": {
      const sid = element?.dataset.savedSearchId?.trim();
      if (sid) void deleteSavedSearchView(sid);
      return true;
    }
    case "search-view-mark-read":
      void bulkMarkReadSearchViewThreads();
      return true;
    case "search-view-archive":
      void bulkArchiveSearchViewThreads();
      return true;
    case "search-view-open-organizer":
      void openOrganizationV2View();
      return true;
    case "search-view-affiner":
      void runFluxAffinerFromSearchView();
      return true;
    case "accept-view-suggestion": {
      const email = element?.dataset.senderEmail?.trim();
      if (email) void acceptSuggestedSavedView(email);
      return true;
    }
    case "dismiss-view-suggestion": {
      const email = element?.dataset.senderEmail?.trim();
      if (email) void dismissSuggestedSavedView(email, "dismiss");
      return true;
    }
    case "snooze-view-suggestion": {
      const email = element?.dataset.senderEmail?.trim();
      if (email) void dismissSuggestedSavedView(email, "snooze");
      return true;
    }
    case "saved-search-mark-seen":
      void markActiveSavedSearchSeen({ toast: true });
      return true;
    case "load-more":
      if (usesSearchContextLoader()) await loadThreadsForSearchContext(true);
      else await loadMailView(true);
      render();
      return true;
    case "clear-search-text":
      state.search = "";
      state.searchDraft = "";
      if (!isSearchActive()) {
        void clearSearchAndReloadInbox();
      } else {
        void loadThreadsForSearchContext(false).then(() => render());
      }
      return true;
    case "clear-search-list-filter":
      state.listFilter = "all";
      if (state.search.trim()) {
        void searchThreads();
      } else if (isSearchActive()) {
        void loadThreadsForSearchContext(false).then(() => render());
      } else {
        render();
      }
      return true;
    case "clear-search-nl-filters":
      resetManualSearchNlFilters();
      if (!isSearchActive()) {
        void clearSearchAndReloadInbox();
      } else if (state.search.trim()) {
        void searchThreads();
      } else {
        void loadThreadsForSearchContext(false).then(() => render());
      }
      return true;
    case "clear-search-sender":
      state.searchSenders = [];
      if (!isSearchActive()) {
        void clearSearchAndReloadInbox();
      } else if (state.search.trim() || state.searchTags.length > 0) {
        void searchThreads();
      } else {
        void loadThreadsForSearchContext(false).then(() => render());
      }
      return true;
    case "clear-search-sender-one": {
      const email = element?.dataset.email?.trim().toLowerCase();
      if (email) state.searchSenders = state.searchSenders.filter((s) => s.toLowerCase() !== email);
      if (!isSearchActive()) void clearSearchAndReloadInbox();
      else if (state.search.trim() || state.searchSenders.length || state.searchTags.length) void searchThreads();
      else void loadThreadsForSearchContext(false).then(() => render());
      return true;
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
      return true;
    case "clear-search-account":
      state.searchAccountOverrideId = null;
      if (!isSearchActive()) void clearSearchAndReloadInbox();
      else if (state.search.trim() || state.searchSenders.length || state.searchTags.length) void searchThreads();
      else void loadThreadsForSearchContext(false).then(() => render());
      return true;
    case "clear-search-tag-one": {
      const raw = element?.dataset.tag?.trim().toLowerCase();
      if (raw) {
        state.searchTags = state.searchTags.filter((t) => `${String(t.family).toLowerCase()}:${t.value}`.toLowerCase() !== raw);
      }
      if (!isSearchActive()) void clearSearchAndReloadInbox();
      else if (state.search.trim() || state.searchSenders.length || state.searchTags.length) void searchThreads();
      else void loadThreadsForSearchContext(false).then(() => render());
      return true;
    }
    case "clear-search-newsletter-rule":
      state.searchNewsletterRule = null;
      if (state.search.trim()) {
        void searchThreads();
      } else {
        void loadThreadsForSearchContext(false).then(() => render());
      }
      return true;
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
      return true;
    case "list-filter-all":
      void applyListFilter("all");
      return true;
    case "list-filter-unread":
      void applyListFilter("unread");
      return true;
    case "list-filter-starred":
      void applyListFilter("starred");
      return true;
    case "list-filter-focused":
      void applyListFilter("focused");
      return true;
    case "list-filter-auto":
      void applyListFilter("auto");
      return true;
    case "clear-mailbox-digest":
    case "dismiss-mailbox-digest":
      dismissMailboxDigestPanel();
      return true;
    case "quick-reply-copy": {
      const idx = Number(element?.dataset.qrIndex ?? "");
      const s = state.quickReplySuggestions[idx];
      const t = s?.text?.trim();
      if (!t) return true;
      void navigator.clipboard.writeText(t).then(
        () => toast("Copié dans le presse-papiers."),
        () => toast("Copie impossible (permission navigateur).")
      );
      return true;
    }
    case "thread-trash-cur":
      if (state.selectedThreadId) void onThreadMove("trash", state.selectedThreadId);
      return true;
    case "thread-archive-cur":
      if (state.selectedThreadId) void onThreadMove("archive", state.selectedThreadId);
      return true;
    case "thread-unarchive-cur": {
      const tid = state.selectedThreadId?.trim();
      const acc = currentAccount();
      if (!tid || !acc?.id) return true;
      if (!isTauriRuntime()) {
        toast("Désarchivage : disponible dans l’app Tauri.");
        return true;
      }
      void (async () => {
        try {
          const { moveThreadUnarchive } = await import("../../organizationView");
          const out = await withTimeout(moveThreadUnarchive(acc.id, tid), MAIL_ACTION_TIMEOUT_MS);
          toast(out.message || "Désarchivé vers Inbox.");
          await openThread(tid, { skipHistory: true, preserveAi: true });
          render();
        } catch (err) {
          toast(tauriErrorMessage(err));
        }
      })();
      return true;
    }
    case "retag-thread": {
      const tid = element?.dataset.threadId?.trim() || state.selectedThreadId?.trim() || "";
      const accountId = state.selectedAccountId?.trim() || "";
      if (!tid || !accountId) return true;
      if (!isTauriRuntime()) {
        toast("Recalcul des tags : disponible dans l’app Tauri.");
        return true;
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
      return true;
    }
    case "toggle-thread-seen": {
      const tid = element?.dataset.threadId?.trim() ?? "";
      if (!tid) return true;
      const row = state.threads.find((t) => String(t.id) === tid);
      void onThreadSeen(row?.unread ? "read" : "unread", tid);
      return true;
    }
    case "toggle-thread-follow": {
      const tid = element?.dataset.threadId?.trim() ?? "";
      if (!tid) return true;
      void onThreadToggleFollow(tid);
      return true;
    }
    case "toggle-thread-seen-cur": {
      const tid = state.selectedThreadId;
      if (!tid) return true;
      const row = state.threads.find((t) => String(t.id) === tid);
      const unreadNow = Boolean(row?.unread ?? state.selectedThread?.unread);
      void onThreadSeen(unreadNow ? "read" : "unread", tid);
      return true;
    }
    case "thread-move-cur":
      if (state.selectedThreadId) openMoveDialog(state.selectedThreadId);
      return true;
    case "close-move":
      state.moveOpen = false;
      state.moveThreadId = undefined;
      render();
      return true;
    case "confirm-move":
      await confirmMoveDialog();
      return true;
    case "open-mailbox-manage":
      state.mailboxManageOpen = true;
      render();
      return true;
    case "close-mailbox-manage":
      state.mailboxManageOpen = false;
      render();
      return true;
    case "mb-create":
      await mailboxManageAction("create");
      return true;
    case "mb-rename":
      await mailboxManageAction("rename");
      return true;
    case "mb-delete":
      await mailboxManageAction("delete");
      return true;
    case "mb-subscribe":
      await mailboxManageAction("subscribe");
      return true;
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
      return true;
    }
    case "delete-saved-draft": {
      const sid = element?.dataset.savedDraftId?.trim() ?? "";
      if (!sid) return true;
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
      return true;
    }
    default:
      return false;
  }
}