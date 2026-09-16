// @ts-nocheck
import {
  app,
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
  clearDiscoveredServerSnap,
  resetNewAccountSetupState,
  clearAccountOAuthWizard,
  withTimeout,
  tauriErrorMessage,
  safeInvoke,
  setSkipAccountIdentityCaptureOnce,
  setAddressBookEditEmail,
  addressBookRowsCache,
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

export async function tryHandleComposeSettings(action: string, element?: HTMLElement): Promise<boolean> {
  switch (action) {
    case "compose":
      state.aiOpen = false;
      (app()["clearThreadAiSummaryState"] as (...a: unknown[]) => unknown)();
      if (
        state.view === "thread" &&
        state.selectedThreadId?.trim() &&
        !(app()["threadIsAutoMail"] as (...a: unknown[]) => unknown)(state.selectedThread, state.selectedThreadId)
      ) {
        void (app()["prepareReply"] as (...a: unknown[]) => unknown)();
        return true;
      }
      (app()["enterComposeView"] as (...a: unknown[]) => unknown)();
      (app()["startNewDraftSession"] as (...a: unknown[]) => unknown)();
      state.draft = {
        id: "draft-local",
        kind: "New",
        to: [],
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
      (app()["syncPreviewOpenFromComposeLayout"] as (...a: unknown[]) => unknown)();
      state.preview = undefined;
      state.composeAdvancedOpen = false;
      state.composeCcBccOpen = false;
      (app()["resetMarkdownEditorHistory"] as (...a: unknown[]) => unknown)();
      (app()["render"] as (...a: unknown[]) => unknown)();
      window.setTimeout(() => void (app()["computePreview"] as (...a: unknown[]) => unknown)(), 0);
      (app()["scheduleDraftRevisionSave"] as (...a: unknown[]) => unknown)(350);
      return true;
    case "settings":
    case "account":
      (app()["openSettingsView"] as (...a: unknown[]) => unknown)();
      return true;
    case "reload-accounts": {
      const ok = await (app()["loadAccountsFromBackend"] as (...a: unknown[]) => unknown)({ silent: false });
      if (ok) {
        state.mailboxes = await safeInvoke<string[]>(
          "list_imap_mailboxes",
          { accountId: (app()["currentAccount"] as (...a: unknown[]) => unknown)()?.id ?? null },
          [],
          BOOT_INVOKE_TIMEOUT_MS
        );
        (app()["ensureValidSelectedMailbox"] as (...a: unknown[]) => unknown)();
        await (app()["loadMailView"] as (...a: unknown[]) => unknown)(false);
        await (app()["loadMailboxUnread"] as (...a: unknown[]) => unknown)();
        toast(`Compte chargé : ${(app()["currentAccount"] as (...a: unknown[]) => unknown)()?.email ?? ""}`);
      }
      (app()["render"] as (...a: unknown[]) => unknown)();
      return true;
    }
    case "settings-tab": {
      const tab = element?.dataset.settingsTab;
      if (
        tab === "accounts" ||
        tab === "general" ||
        tab === "appearance" ||
        tab === "autoSenders" ||
        tab === "ai" ||
        tab === "addressBook" ||
        tab === "storage" ||
        tab === "shortcuts" ||
        tab === "developer"
      ) {
        if (state.view !== "settings") {
          state.view = "settings";
          state.aiOpen = false;
          clearDiscoveredServerSnap();
          state.settingsSelectedAccountId =
            state.selectedAccountId && state.accounts.some((a) => a.id === state.selectedAccountId)
              ? state.selectedAccountId
              : (state.accounts[0]?.id ?? "new");
          accountFieldTouched.serverFields = false;
          state.accountServersPanelOpen = state.settingsSelectedAccountId !== "new";
        }
        state.settingsTab = tab;
        (app()["render"] as (...a: unknown[]) => unknown)();
        if (tab === "autoSenders") void (app()["loadNewsletterRules"] as (...a: unknown[]) => unknown)().then(() => (app()["render"] as (...a: unknown[]) => unknown)());
        if (tab === "ai") void (app()["refreshSemanticEmbeddingCounts"] as (...a: unknown[]) => unknown)();
        if (tab === "addressBook") void (app()["refreshAddressBookList"] as (...a: unknown[]) => unknown)().then(() => (app()["render"] as (...a: unknown[]) => unknown)());
        if (tab === "storage") void (app()["refreshSettingsPathsFromBackend"] as (...a: unknown[]) => unknown)();
      }
      return true;
    }
    case "settings-reload-paths":
      void (app()["refreshSettingsPathsFromBackend"] as (...a: unknown[]) => unknown)();
      return true;
    case "text-prompt-confirm": {
      const raw = document.querySelector<HTMLInputElement>("#text-prompt-input")?.value ?? "";
      finishTextPromptModal(raw);
      return true;
    }
    case "text-prompt-cancel":
      finishTextPromptModal(null);
      return true;
    case "confirm-modal-yes":
      finishConfirmModal(true);
      return true;
    case "confirm-modal-no":
      finishConfirmModal(false);
      return true;
    case "settings-ia-tab": {
      const tab = element?.dataset.iaTab;
      if (tab === "semantic") {
        state.settingsAiModal = "semantic";
        void (app()["refreshSemanticEmbeddingCounts"] as (...a: unknown[]) => unknown)().then(() => (app()["render"] as (...a: unknown[]) => unknown)());
      } else if (tab === "llm") {
        void (app()["openEnginesAiSettingsModal"] as (...a: unknown[]) => unknown)();
      } else if (tab === "dictation") {
        state.settingsAiModal = "dictation";
        (app()["render"] as (...a: unknown[]) => unknown)();
      } else if (tab === "background") {
        state.settingsAiModal = "background";
        (app()["render"] as (...a: unknown[]) => unknown)();
      } else if (tab === "features") {
        state.settingsAiModal = "features-0";
        (app()["render"] as (...a: unknown[]) => unknown)();
      }
      return true;
    }
    case "open-settings-ai-modal": {
      const modal = normalizeSettingsAiModalId(element?.dataset.aiModal);
      if (!modal) return true;
      state.settingsAiModal = modal;
      if (modal === "prompts") {
        void (async () => {
          if (!isTauriRuntime()) {
            state.promptCatalog = null;
            state.promptCatalogLoadError = t("settings.ai.promptsNoCatalog");
            (app()["render"] as (...a: unknown[]) => unknown)();
            return;
          }
          try {
            state.promptCatalog = await invoke<PromptCatalogItem[]>("list_ai_prompt_catalog", {});
            state.promptCatalogLoadError = "";
          } catch (e) {
            state.promptCatalog = null;
            state.promptCatalogLoadError = tauriErrorMessage(e);
          }
          (app()["render"] as (...a: unknown[]) => unknown)();
        })();
      } else if (modal === "semantic") void (app()["refreshSemanticEmbeddingCounts"] as (...a: unknown[]) => unknown)().then(() => (app()["render"] as (...a: unknown[]) => unknown)());
      else if (modal === "engines") void (app()["openEnginesAiSettingsModal"] as (...a: unknown[]) => unknown)();
      else (app()["render"] as (...a: unknown[]) => unknown)();
      return true;
    }
    case "close-settings-ai-modal":
      (app()["finalizeSettingsAiModalClose"] as (...a: unknown[]) => unknown)();
      state.settingsAiModal = null;
      (app()["render"] as (...a: unknown[]) => unknown)();
      return true;
    case "save-default-account-prompt": {
      void (async () => {
        const sel = document.querySelector<HTMLSelectElement>("#default-account-prompt-select");
        const id = (sel?.value ?? "").trim();
        if (!id) {
          toast("Choisissez un compte.");
          return;
        }
        try {
          await (app()["persistDefaultAccountId"] as (...a: unknown[]) => unknown)(id);
          await (app()["switchActiveAccount"] as (...a: unknown[]) => unknown)(id);
          toast("Compte par défaut enregistré.");
          (app()["render"] as (...a: unknown[]) => unknown)();
        } catch (e) {
          toast(tauriErrorMessage(e));
        }
      })();
      return true;
    }
    case "dismiss-default-account-prompt": {
      try {
        window.localStorage.setItem(DEFAULT_ACCOUNT_PROMPT_DISMISS_KEY(), "1");
      } catch {
        /* ignore */
      }
      (app()["render"] as (...a: unknown[]) => unknown)();
      return true;
    }
    case "open-settings-default-account":
      state.view = "settings";
      state.settingsTab = "general";
      (app()["render"] as (...a: unknown[]) => unknown)();
      return true;
    case "save-general-prefs": {
      void (async () => {
        if (!isTauriRuntime()) {
          toast("Enregistrement : lancez l’app Tauri.");
          return;
        }
        const sel = document.querySelector<HTMLSelectElement>("#prefs-mother-language");
        if (sel) {
          state.appPrefs.general.motherLanguage = sel.value.trim() || "fr";
          state.appPrefs.ai.draftLanguage = state.appPrefs.general.motherLanguage;
          setLocale(state.appPrefs.general.motherLanguage);
        }
        const globalCb = document.querySelector<HTMLInputElement>("#prefs-address-book-global");
        state.appPrefs.general.addressBookGlobalScope = Boolean(globalCb?.checked);
        const activityCb = document.querySelector<HTMLInputElement>("#prefs-activity-suggestions");
        state.appPrefs.general.activitySuggestionsEnabled = activityCb?.checked !== false;
        (app()["syncActivityRecordingPrefs"] as (...a: unknown[]) => unknown)();
        if (!state.appPrefs.general.activitySuggestionsEnabled) {
          state.suggestedSavedViews = [];
          clearSuggestionShownKeys();
        } else {
          void (app()["refreshSuggestedSavedViews"] as (...a: unknown[]) => unknown)().then(() => (app()["render"] as (...a: unknown[]) => unknown)());
        }
        const lfSel = document.querySelector<HTMLSelectElement>("#prefs-default-list-filter");
        const lfRaw = lfSel?.value?.trim() ?? "all";
        state.appPrefs.general.defaultListFilter = LIST_FILTER_VALUES().includes(lfRaw as State["listFilter"])
          ? (lfRaw as State["listFilter"])
          : "all";
        const archLayout = document.querySelector<HTMLSelectElement>("#prefs-archive-layout");
        state.appPrefs.general.archiveLayout = archLayout?.value?.trim() || "hierarchical";
        const archRoot = document.querySelector<HTMLInputElement>("#prefs-archive-root");
        state.appPrefs.general.archiveRoot = (archRoot?.value ?? "Archive").trim() || "Archive";
        const staleDays = document.querySelector<HTMLInputElement>("#prefs-stale-inbox-days");
        const staleN = Number(staleDays?.value ?? 90);
        state.appPrefs.general.staleInboxDays = Number.isFinite(staleN) ? Math.max(1, Math.floor(staleN)) : 90;
        const hybridW = document.querySelector<HTMLInputElement>("#prefs-hybrid-weight");
        const hw = Number(hybridW?.value ?? 0.55);
        state.appPrefs.general.hybridLexicalWeight = Number.isFinite(hw)
          ? Math.min(1, Math.max(0, hw))
          : 0.55;
        state.appPrefs.general.autoArchiveEnabled = Boolean(
          document.querySelector<HTMLInputElement>("#prefs-auto-archive-enabled")?.checked,
        );
        const accSel = document.querySelector<HTMLSelectElement>("#prefs-default-account");
        const accVal = (accSel?.value ?? "").trim();
        if (accVal) state.appPrefs.general.defaultAccountId = accVal;
        else delete state.appPrefs.general.defaultAccountId;
        try {
          await withTimeout(invoke("set_app_prefs", { prefs: state.appPrefs }), MAIL_ACTION_TIMEOUT_MS);
          toast(t("toast.prefsSaved"));
        } catch (e) {
          toast(tauriErrorMessage(e));
        }
        if (accVal && state.view === "list") {
          await (app()["switchActiveAccount"] as (...a: unknown[]) => unknown)(accVal);
          (app()["render"] as (...a: unknown[]) => unknown)();
        } else if (
          state.view === "list" &&
          !isSavedDraftsVirtualMailbox(state.selectedMailbox ?? "") &&
          !(app()["isSearchActive"] as (...a: unknown[]) => unknown)() &&
          state.listFilter !== (app()["defaultListFilterFromPrefs"] as (...a: unknown[]) => unknown)()
        ) {
          await (app()["applyListFilter"] as (...a: unknown[]) => unknown)((app()["defaultListFilterFromPrefs"] as (...a: unknown[]) => unknown)());
        } else {
          (app()["render"] as (...a: unknown[]) => unknown)();
        }
      })();
      return true;
    }
    case "save-ai-prefs":
      void (app()["persistAiPrefsFromDom"] as (...a: unknown[]) => unknown)();
      return true;
    case "refresh-llm-runtime-status": {
      void (app()["refreshLlmRuntimeStatus"] as (...a: unknown[]) => unknown)(false).then(() => {
        (app()["render"] as (...a: unknown[]) => unknown)();
        toast("Statut LLM actualisé.");
      });
      return true;
    }
    case "refresh-llm-hardware-rescan": {
      void (app()["refreshLlmRuntimeStatus"] as (...a: unknown[]) => unknown)(true).then(() => {
        (app()["render"] as (...a: unknown[]) => unknown)();
        toast("Mémoire de l’ordinateur : nouvelle analyse effectuée.");
      });
      return true;
    }
    case "llm-apply-recommended-weights": {
      const st = state.llmRuntimeStatus;
      if (!st?.recommendedRepo?.trim()) {
        toast("Aucune recommandation pour l’instant — essayez « Analyser la mémoire ».");
        return true;
      }
      state.appPrefs.ai.localLlmHfRepoId = st.recommendedRepo.trim();
      if (st.recommendedFile?.trim()) {
        state.appPrefs.ai.localLlmGgufFile = st.recommendedFile.trim();
      }
      void (app()["persistAiPrefsFromDom"] as (...a: unknown[]) => unknown)({ silent: true, skipRender: true });
      toast("Modèle recommandé appliqué.");
      (app()["render"] as (...a: unknown[]) => unknown)();
      return true;
    }
    case "llm-setup-recommended": {
      void (async () => {
        if (!isTauriRuntime()) {
          toast("Configuration recommandée : lancez l’app Tauri.");
          return;
        }
        await (app()["refreshLlmRuntimeStatus"] as (...a: unknown[]) => unknown)(true);
        const st = state.llmRuntimeStatus;
        if (st?.recommendedRepo?.trim()) {
          state.appPrefs.ai.localLlmHfRepoId = st.recommendedRepo.trim();
          if (st.recommendedFile?.trim()) {
            state.appPrefs.ai.localLlmGgufFile = st.recommendedFile.trim();
          }
          state.appPrefs.ai.localLlmEnabled = true;
        }
        await (app()["autoDetectLlamaServerBinary"] as (...a: unknown[]) => unknown)({ silent: true, persist: false });
        try {
          await withTimeout(invoke("set_app_prefs", { prefs: state.appPrefs }), MAIL_ACTION_TIMEOUT_MS);
        } catch (e) {
          toast(tauriErrorMessage(e));
          return;
        }
        await (app()["refreshLlmRuntimeStatus"] as (...a: unknown[]) => unknown)(false);
        toast("Configuration recommandée appliquée.");
        (app()["render"] as (...a: unknown[]) => unknown)();
      })();
      return true;
    }
    case "ai-engine-mode": {
      const mode = element?.dataset.engineMode?.trim();
      if (mode !== "local" && mode !== "cloud" && mode !== "hybrid") return true;
      state.aiEngineSettingsTab = mode;
      if (mode === "local") {
        applyEngineConnectionMode(state.appPrefs.ai, "local");
      } else if (mode === "hybrid") {
        applyEngineConnectionMode(state.appPrefs.ai, "hybrid");
      }
      syncLlmEnginePrefsToDom(state.appPrefs.ai);
      (app()["render"] as (...a: unknown[]) => unknown)();
      void (async () => {
        if (mode === "local" || mode === "hybrid") {
          try {
            await withTimeout(invoke("set_app_prefs", { prefs: state.appPrefs }), MAIL_ACTION_TIMEOUT_MS);
          } catch (e) {
            toast(tauriErrorMessage(e));
            return;
          }
        }
        toast(
          mode === "local"
            ? "Mode Sur mon PC."
            : mode === "cloud"
              ? "Mode Cloud."
              : "Mode Hybride enregistré.",
        );
        await (app()["refreshLlmRuntimeStatus"] as (...a: unknown[]) => unknown)(false);
        (app()["render"] as (...a: unknown[]) => unknown)();
      })();
      return true;
    }
    case "cancel-llm-prefetch": {
      if (!isTauriRuntime()) return true;
      void (async () => {
        try {
          await invoke("cancel_prefetch_llm_model", {});
          toast("Téléchargement du modèle annulé.");
        } catch (e) {
          toast(tauriErrorMessage(e));
        }
      })();
      return true;
    }
    case "prefetch-llm-model": {
      if (!isTauriRuntime()) {
        toast("Téléchargement du modèle : ouvrez l’application de bureau (Tauri).");
        return true;
      }
      if (state.llmPrefetchInFlight) {
        toast("Un téléchargement est déjà en cours — utilisez Annuler pour l’arrêter.");
        return true;
      }
      state.llmPrefetchInFlight = true;
      state.llmPrefetchPercent = 0;
      (app()["paintLlmPrefetchProgressDom"] as (...a: unknown[]) => unknown)();
      (app()["paintStatusBarProgressDom"] as (...a: unknown[]) => unknown)();
      toast("Téléchargement du modèle en arrière-plan — vous pouvez continuer à utiliser l’app.");
      void (async () => {
        try {
          const msg = await withTimeout(invoke<string>("prefetch_llm_model", {}), 1_800_000);
          toast(msg || "Fichier modèle prêt.");
        } catch (e) {
          const msg = tauriErrorMessage(e);
          if (!/annulé/i.test(msg)) toast(msg);
        } finally {
          state.llmPrefetchInFlight = false;
          if (state.llmPrefetchPercent == null) {
            (app()["paintLlmPrefetchProgressDom"] as (...a: unknown[]) => unknown)();
            (app()["paintStatusBarProgressDom"] as (...a: unknown[]) => unknown)();
          }
          void (app()["refreshLlmRuntimeStatus"] as (...a: unknown[]) => unknown)(false).then(() => {
            if (state.settingsAiModal === "engines") (app()["render"] as (...a: unknown[]) => unknown)();
          });
        }
      })();
      return true;
    }
    case "prefetch-semantic-minilm": {
      void (async () => {
        if (!isTauriRuntime()) {
          toast("Téléchargement MiniLM : lancez l’app Tauri.");
          return;
        }
        toast("Téléchargement all-MiniLM-L6-v2 (ONNX + tokenizer)…");
        try {
          const msg = await withTimeout(invoke<string>("prefetch_semantic_minilm_model", {}), 900_000);
          toast(msg);
          try {
            state.semanticModelAvailable = await withTimeout(invoke<boolean>("semantic_model_available", {}), MAIL_ACTION_TIMEOUT_MS);
          } catch {
            state.semanticModelAvailable = false;
          }
        } catch (e) {
          toast(tauriErrorMessage(e));
        }
        (app()["render"] as (...a: unknown[]) => unknown)();
      })();
      return true;
    }
    case "reindex-semantic-account": {
      void (async () => {
        if (!isTauriRuntime()) {
          toast("Réindexation : lancez l’app Tauri.");
          return;
        }
        if (!ipcThrottleMs("reindex_semantic_account_ui", 3500)) {
          toast("Une réindexation vient d’être demandée — patiente quelques secondes.");
          return;
        }
        const aid = state.selectedAccountId?.trim() || (app()["currentAccount"] as (...a: unknown[]) => unknown)()?.id?.trim();
        if (!aid) {
          toast("Sélectionne un compte actif avant de réindexer.");
          return;
        }
        if (!state.semanticModelAvailable) {
          toast("Modèle MiniLM absent (model.onnx + tokenizer.json).");
          return;
        }
        try {
          toast("Réindexation sémantique (tout le compte, dossiers présents localement)…");
          const stats = await withTimeout(
            invoke<{ indexed: number; skipped: number; errors: number }>("reindex_semantic_account_cmd", {
              accountId: aid,
            }),
            1_800_000
          );
          toast(`Index sémantique : ${stats.indexed} ligne(s), ${stats.errors} erreur(s).`);
          await (app()["searchThreads"] as (...a: unknown[]) => unknown)();
          await (app()["refreshSemanticEmbeddingCounts"] as (...a: unknown[]) => unknown)();
        } catch (e) {
          toast(tauriErrorMessage(e));
        }
      })();
      return true;
    }
    case "refresh-semantic-embedding-counts": {
      void (app()["refreshSemanticEmbeddingCounts"] as (...a: unknown[]) => unknown)();
      return true;
    }
    case "prefetch-whisper-models": {
      void (async () => {
        if (!isTauriRuntime()) {
          toast("Téléchargement GGML : lancez l’app Tauri.");
          return;
        }
          toast("Téléchargement du GGML Whisper (HF) selon tes réglages…");
        try {
          const msg = await withTimeout(invoke<string>("prefetch_whisper_dictation_model", {}), 900_000);
          toast(msg);
        } catch (e) {
          toast(tauriErrorMessage(e));
        }
        (app()["render"] as (...a: unknown[]) => unknown)();
      })();
      return true;
    }
    case "dictation-test-mic": {
      void (async () => {
        if (!isTauriRuntime()) {
          toast("Test micro : lancez l’app Tauri.");
          return;
        }
        // Enregistre 3s et envoie un WAV 16kHz mono PCM16 au backend Whisper.
        toast("Test micro : enregistrement 3s…");
        let stream: MediaStream | null = null;
        let recorder: MediaRecorder | null = null;
        const chunks: Blob[] = [];
        try {
          stream = await (app()["requestMicStream"] as (...a: unknown[]) => unknown)();
          const mimeOpt =
            typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
              ? "audio/webm;codecs=opus"
              : "audio/webm";
          recorder = new MediaRecorder(stream, { mimeType: mimeOpt });
          recorder.ondataavailable = (ev) => {
            if (ev.data && ev.data.size > 0) chunks.push(ev.data);
          };
          recorder.start(250);
          await new Promise((resolve) => window.setTimeout(resolve, 3000));
          const blob: Blob = await new Promise((resolve, reject) => {
            const r = recorder!;
            r.onerror = () => reject(new Error("Enregistrement interrompu"));
            r.onstop = () => resolve(new Blob(chunks, { type: r.mimeType || "audio/webm" }));
            r.stop();
          });
          stream.getTracks().forEach((t) => t.stop());
          stream = null;
          recorder = null;
          const wavBytes = await (app()["mediaBlobToWav16kMonoPcm16"] as (...a: unknown[]) => unknown)(blob);
          const audioWavBase64 = (app()["bytesToBase64"] as (...a: unknown[]) => unknown)(wavBytes);
          toast("Test micro : transcription…");
          const res = await withTimeout(
            invoke<{ durationS: number; rms: number; elapsedMs: number; text?: string | null; error?: { kind: string; seconds?: number; rms?: number; message?: string } | null }>(
              "dictation_test_run",
              { audioWavBase64 }
            ),
            180_000
          );
          if (res.error) {
            const msg =
              res.error.kind === "audio_too_short"
                ? `Audio trop court (${(res.error.seconds ?? res.durationS).toFixed(2)}s).`
                : res.error.kind === "audio_silent"
                  ? `Audio quasi silencieux (RMS=${(res.error.rms ?? res.rms).toFixed(4)}).`
                  : res.error.message
                    ? res.error.message
                    : "Échec transcription.";
            toast(`Test micro : ${msg}`);
          } else {
            toast(
              `Test micro OK (${res.durationS.toFixed(2)}s, RMS=${res.rms.toFixed(4)}, ${Math.round(res.elapsedMs)}ms) : ${String(res.text ?? "").slice(0, 140)}`
            );
          }
        } catch (e) {
          toast(`Test micro : ${(app()["micPermissionErrorMessage"] as (...a: unknown[]) => unknown)(e)}`);
        } finally {
          try {
            recorder?.stop();
          } catch {
            // ignore
          }
          stream?.getTracks().forEach((t) => t.stop());
        }
        (app()["render"] as (...a: unknown[]) => unknown)();
      })();
      return true;
    }
    case "save-cloud-api-key": {
      void (async () => {
        if (!isTauriRuntime()) {
          toast("Enregistrement : lancez l’app Tauri.");
          return;
        }
        const inp = document.querySelector<HTMLInputElement>("#prefs-cloud-api-key");
        const secret = inp?.value?.trim() ?? "";
        if (!secret) {
          toast("Collez une clé API avant d’enregistrer.");
          return;
        }
        try {
          await withTimeout(invoke("set_openrouter_api_key", { secret }), MAIL_ACTION_TIMEOUT_MS);
          await withTimeout(invoke("set_dictation_api_key", { secret }), MAIL_ACTION_TIMEOUT_MS);
          state.openrouterApiKeySet = true;
          state.dictationApiKeySet = true;
          if (inp) inp.value = "";
          toast("Clé cloud enregistrée (OpenRouter + dictée).");
          void (app()["refreshLlmRuntimeStatus"] as (...a: unknown[]) => unknown)(false).then(() => {
            if (state.settingsAiModal === "engines") (app()["render"] as (...a: unknown[]) => unknown)();
          });
        } catch (e) {
          toast(tauriErrorMessage(e));
        }
      })();
      return true;
    }
    case "clear-cloud-api-key": {
      void (async () => {
        if (!isTauriRuntime()) {
          toast("Lancez l’app Tauri.");
          return;
        }
        try {
          await withTimeout(invoke("clear_openrouter_api_key", {}), MAIL_ACTION_TIMEOUT_MS);
          await withTimeout(invoke("clear_dictation_api_key", {}), MAIL_ACTION_TIMEOUT_MS);
          state.openrouterApiKeySet = false;
          state.dictationApiKeySet = false;
          toast("Clé cloud supprimée.");
          void (app()["refreshLlmRuntimeStatus"] as (...a: unknown[]) => unknown)(false).then(() => {
            if (state.settingsAiModal === "engines") (app()["render"] as (...a: unknown[]) => unknown)();
          });
        } catch (e) {
          toast(tauriErrorMessage(e));
        }
      })();
      return true;
    }
    case "save-dictation-api-key": {
      void (async () => {
        if (!isTauriRuntime()) {
          toast("Enregistrement : lancez l’app Tauri.");
          return;
        }
        const inp = document.querySelector<HTMLInputElement>("#prefs-dictation-api-key");
        const secret = inp?.value?.trim() ?? "";
        if (!secret) {
          toast("Collez une clé API avant d’enregistrer.");
          return;
        }
        try {
          await withTimeout(invoke("set_dictation_api_key", { secret }), MAIL_ACTION_TIMEOUT_MS);
          state.dictationApiKeySet = true;
          if (inp) inp.value = "";
          toast("Clé API enregistrée dans le trousseau.");
        } catch (e) {
          toast(tauriErrorMessage(e));
        }
        (app()["render"] as (...a: unknown[]) => unknown)();
      })();
      return true;
    }
    case "clear-dictation-api-key": {
      void (async () => {
        if (!isTauriRuntime()) {
          toast("Lancez l’app Tauri.");
          return;
        }
        try {
          await withTimeout(invoke("clear_dictation_api_key", {}), MAIL_ACTION_TIMEOUT_MS);
          state.dictationApiKeySet = false;
          toast("Clé API supprimée du trousseau.");
        } catch (e) {
          toast(tauriErrorMessage(e));
        }
        (app()["render"] as (...a: unknown[]) => unknown)();
      })();
      return true;
    }
    case "save-openrouter-api-key": {
      void (async () => {
        if (!isTauriRuntime()) {
          toast("Enregistrement : lancez l’app Tauri.");
          return;
        }
        const inp = document.querySelector<HTMLInputElement>("#prefs-openrouter-api-key");
        const secret = inp?.value?.trim() ?? "";
        if (!secret) {
          toast("Collez une clé OpenRouter avant d’enregistrer.");
          return;
        }
        try {
          await withTimeout(invoke("set_openrouter_api_key", { secret }), MAIL_ACTION_TIMEOUT_MS);
          state.openrouterApiKeySet = true;
          if (inp) inp.value = "";
          toast("Clé OpenRouter enregistrée dans le trousseau.");
          void (app()["refreshLlmRuntimeStatus"] as (...a: unknown[]) => unknown)(false).then(() => (app()["render"] as (...a: unknown[]) => unknown)());
        } catch (e) {
          toast(tauriErrorMessage(e));
        }
        (app()["render"] as (...a: unknown[]) => unknown)();
      })();
      return true;
    }
    case "clear-openrouter-api-key": {
      void (async () => {
        if (!isTauriRuntime()) {
          toast("Lancez l’app Tauri.");
          return;
        }
        try {
          await withTimeout(invoke("clear_openrouter_api_key", {}), MAIL_ACTION_TIMEOUT_MS);
          state.openrouterApiKeySet = false;
          toast("Clé OpenRouter supprimée du trousseau.");
          void (app()["refreshLlmRuntimeStatus"] as (...a: unknown[]) => unknown)(false).then(() => (app()["render"] as (...a: unknown[]) => unknown)());
        } catch (e) {
          toast(tauriErrorMessage(e));
        }
        (app()["render"] as (...a: unknown[]) => unknown)();
      })();
      return true;
    }
    case "save-llama-server-api-key": {
      void (async () => {
        if (!isTauriRuntime()) {
          toast("Enregistrement : lancez l’app Tauri.");
          return;
        }
        const inp = document.querySelector<HTMLInputElement>("#prefs-llama-server-api-key");
        const secret = inp?.value?.trim() ?? "";
        if (!secret) {
          toast("Collez une clé Bearer avant d’enregistrer (ou laissez vide et utilisez « Supprimer »).");
          return;
        }
        try {
          await withTimeout(invoke("set_llama_server_api_key", { secret }), MAIL_ACTION_TIMEOUT_MS);
          state.llamaServerApiKeySet = true;
          if (inp) inp.value = "";
          toast("Clé llama-server enregistrée dans le trousseau.");
          void (app()["refreshLlmRuntimeStatus"] as (...a: unknown[]) => unknown)(false).then(() => (app()["render"] as (...a: unknown[]) => unknown)());
        } catch (e) {
          toast(tauriErrorMessage(e));
        }
        (app()["render"] as (...a: unknown[]) => unknown)();
      })();
      return true;
    }
    case "clear-llama-server-api-key": {
      void (async () => {
        if (!isTauriRuntime()) {
          toast("Lancez l’app Tauri.");
          return;
        }
        try {
          await withTimeout(invoke("clear_llama_server_api_key", {}), MAIL_ACTION_TIMEOUT_MS);
          state.llamaServerApiKeySet = false;
          toast("Clé llama-server supprimée du trousseau.");
          void (app()["refreshLlmRuntimeStatus"] as (...a: unknown[]) => unknown)(false).then(() => (app()["render"] as (...a: unknown[]) => unknown)());
        } catch (e) {
          toast(tauriErrorMessage(e));
        }
        (app()["render"] as (...a: unknown[]) => unknown)();
      })();
      return true;
    }
    case "llama-server-detect": {
      void (async () => {
        if (!isTauriRuntime()) {
          toast("Détection : lancez l’app Tauri.");
          return;
        }
        try {
          const det = await invoke<{
            onPath: boolean;
            wingetInstalled: boolean;
            resolvedPath?: string | null;
          }>("llama_server_detect", {
            binaryHint: state.appPrefs.ai.llamaServerBinaryPath || "llama-server",
          });
          if (det.onPath || det.wingetInstalled) {
            toast(`llama-server détecté${det.resolvedPath ? ` (${det.resolvedPath})` : ""}.`);
          } else {
            toast("llama-server introuvable (PATH et winget).");
          }
        } catch (e) {
          toast(tauriErrorMessage(e));
        }
      })();
      return true;
    }
    case "llama-server-winget-install": {
      void (async () => {
        if (!isTauriRuntime()) {
          toast("winget : lancez l’app Tauri sous Windows.");
          return;
        }
        toast("Installation winget… une fenêtre administrateur peut s’ouvrir.");
        try {
          const res = await invoke<{ success: boolean; message: string }>("llama_server_winget_install", {});
          toast(res.message);
          if (res.success) {
            state.appPrefs.ai.llamaServerEnabled = true;
            state.appPrefs.ai.llamaServerSpawnEnabled = true;
            state.appPrefs.ai.llamaServerBinaryPath = "llama-server";
            state.appPrefs.ai.localLlmEnabled = true;
            await invoke("set_app_prefs", { prefs: state.appPrefs });
            void (app()["refreshLlmRuntimeStatus"] as (...a: unknown[]) => unknown)(false).then(() => (app()["render"] as (...a: unknown[]) => unknown)());
          }
        } catch (e) {
          toast(tauriErrorMessage(e));
        }
        (app()["render"] as (...a: unknown[]) => unknown)();
      })();
      return true;
    }
    case "pick-llama-server-binary-path": {
      void (async () => {
        if (!isTauriRuntime()) {
          toast("Parcourir : lancez l’app Tauri.");
          return;
        }
        try {
          const picked = await withTimeout(
            invoke<string | null>("pick_llama_server_binary_path", {}),
            MAIL_ACTION_TIMEOUT_MS
          );
          if (!picked?.trim()) {
            toast("Aucun fichier sélectionné.");
            return;
          }
          state.appPrefs.ai.llamaServerBinaryPath = picked.trim();
          await withTimeout(invoke("set_app_prefs", { prefs: state.appPrefs }), MAIL_ACTION_TIMEOUT_MS);
          toast("Chemin llama-server enregistré.");
          void (app()["refreshLlmRuntimeStatus"] as (...a: unknown[]) => unknown)(false).then(() => (app()["render"] as (...a: unknown[]) => unknown)());
        } catch (e) {
          toast(tauriErrorMessage(e));
        }
        (app()["render"] as (...a: unknown[]) => unknown)();
      })();
      return true;
    }
    case "newsletter-domain-add": {
      void (async () => {
        const raw = document.querySelector<HTMLInputElement>("#newsletter-domain-input")?.value?.trim() ?? "";
        if (!raw) {
          toast("Indiquez une règle (domaine, *.domaine ou local@domaine).");
          return;
        }
        if (!isTauriRuntime()) {
          toast("Ajout de règles : exécutez l’app Tauri.");
          return;
        }
        try {
          await withTimeout(invoke("add_newsletter_rule", { input: raw }), MAIL_ACTION_TIMEOUT_MS);
          await (app()["loadNewsletterRules"] as (...a: unknown[]) => unknown)();
          const inp = document.querySelector<HTMLInputElement>("#newsletter-domain-input");
          if (inp) inp.value = "";
          toast("Règle enregistrée.");
          (app()["render"] as (...a: unknown[]) => unknown)();
        } catch (error) {
          toast(tauriErrorMessage(error));
        }
      })();
      return true;
    }
    case "newsletter-domain-remove": {
      const dom = (app()["readNlButtonRule"] as (...a: unknown[]) => unknown)(element);
      if (!dom) {
        toast("Règle invalide ou manquante.");
        return true;
      }
      void (async () => {
        if (!isTauriRuntime()) {
          toast("Suppression des règles : lancez l’app bureau Tauri.");
          return;
        }
        try {
          await withTimeout(invoke("remove_newsletter_rule", { input: dom }), MAIL_ACTION_TIMEOUT_MS);
          await (app()["loadNewsletterRules"] as (...a: unknown[]) => unknown)();
          toast("Règle supprimée.");
          (app()["render"] as (...a: unknown[]) => unknown)();
        } catch (error) {
          toast(tauriErrorMessage(error));
        }
      })();
      return true;
    }
    case "newsletter-msg-add-rule": {
      const raw = (app()["readNlButtonRule"] as (...a: unknown[]) => unknown)(element);
      const rule = (app()["normalizeNlRuleInvokeInput"] as (...a: unknown[]) => unknown)(raw);
      if (!rule) {
        toast("Impossible de lire l’adresse (data-rule vide). Réouvrez le fil ou utilisez les paramètres.");
        return true;
      }
      if (!rule.includes("@")) {
        toast("Pour ajouter depuis un message, l’expéditeur doit être une adresse e-mail (avec @).");
        return true;
      }
      void (async () => {
        if (!isTauriRuntime()) {
          toast("Ajout depuis un message : lancez l’app bureau Tauri.");
          return;
        }
        try {
          await withTimeout(invoke("add_newsletter_rule", { input: rule }), MAIL_ACTION_TIMEOUT_MS);
          await (app()["loadNewsletterRules"] as (...a: unknown[]) => unknown)();
          if (state.selectedThreadId) {
            const tid = state.selectedThreadId;
            const refreshed = await (app()["fetchOpenThreadOrNotify"] as (...a: unknown[]) => unknown)(tid);
            if (refreshed) state.selectedThread = refreshed;
          }
          toast(`Règle ajoutée : ${rule}`);
          (app()["render"] as (...a: unknown[]) => unknown)();
        } catch (error) {
          toast(tauriErrorMessage(error));
        }
      })();
      return true;
    }
    case "newsletter-msg-remove-rule": {
      const dom = (app()["readNlButtonRule"] as (...a: unknown[]) => unknown)(element);
      if (!dom) {
        toast("Règle invalide ou manquante.");
        return true;
      }
      void (async () => {
        if (!isTauriRuntime()) {
          toast("Retrait de règle : lancez l’app bureau Tauri.");
          return;
        }
        try {
          await withTimeout(invoke("remove_newsletter_rule", { input: dom }), MAIL_ACTION_TIMEOUT_MS);
          await (app()["loadNewsletterRules"] as (...a: unknown[]) => unknown)();
          if (state.selectedThreadId) {
            const tid = state.selectedThreadId;
            const refreshed = await (app()["fetchOpenThreadOrNotify"] as (...a: unknown[]) => unknown)(tid);
            if (refreshed) state.selectedThread = refreshed;
          }
          toast(`Règle retirée : ${dom}`);
          (app()["render"] as (...a: unknown[]) => unknown)();
        } catch (error) {
          toast(tauriErrorMessage(error));
        }
      })();
      return true;
    }
    case "settings-select-account": {
      const id = element?.dataset.accountId?.trim();
      if (!id) return true;
      setSkipAccountIdentityCaptureOnce(true);
      clearDiscoveredServerSnap();
      state.settingsSelectedAccountId = id;
      accountFieldTouched.serverFields = false;
      state.accountServersPanelOpen = true;
      state.oauthLockedEmail = null;
      state.accountFormOAuthPrefill = null;
      resetNewAccountSetupState();
      (app()["render"] as (...a: unknown[]) => unknown)();
      return true;
    }
    case "settings-new-account":
      setSkipAccountIdentityCaptureOnce(true);
      clearDiscoveredServerSnap();
      state.settingsSelectedAccountId = "new";
      accountFieldTouched.serverFields = false;
      resetNewAccountSetupState();
      (app()["render"] as (...a: unknown[]) => unknown)();
      return true;
    case "discover-mail-servers":
      void (app()["discoverMailServersAction"] as (...a: unknown[]) => unknown)();
      return true;
    case "account-toggle-servers":
      state.accountServersPanelOpen = !state.accountServersPanelOpen;
      (app()["render"] as (...a: unknown[]) => unknown)();
      return true;
    case "oauth-google-connect": {
      void (async () => {
        if (!isTauriRuntime()) {
          toast("OAuth2 : lancez l’application bureau Tauri.");
          return;
        }
        try {
          const o = await withTimeout(
            invoke<OAuthDesktopLoginOutcome>("oauth_google_desktop_login_cmd", {}),
            OAUTH_DESKTOP_LOGIN_TIMEOUT_MS,
          );
          (app()["warnOAuthEphemeralRedirect"] as (...a: unknown[]) => unknown)(o);
          const email = (o.email ?? "").trim();
          if (!email.includes("@")) {
            toast("OAuth Google : adresse e-mail absente ou invalide.");
            return;
          }
          setSkipAccountIdentityCaptureOnce(true);
          await (app()["finishOAuthNewAccountAfterLogin"] as (...a: unknown[]) => unknown)("oauthGoogle", email, (o.displayName ?? "").trim());
        } catch (e) {
          toast(tauriErrorMessage(e));
        }
      })();
      return true;
    }
    case "oauth-microsoft-connect": {
      void (async () => {
        if (!isTauriRuntime()) {
          toast("OAuth2 : lancez l’application bureau Tauri.");
          return;
        }
        try {
          const o = await withTimeout(
            invoke<OAuthDesktopLoginOutcome>("oauth_microsoft_desktop_login_cmd", {}),
            OAUTH_DESKTOP_LOGIN_TIMEOUT_MS,
          );
          (app()["warnOAuthEphemeralRedirect"] as (...a: unknown[]) => unknown)(o);
          const email = (o.email ?? "").trim();
          if (!email.includes("@")) {
            toast("OAuth Microsoft : adresse e-mail absente ou invalide.");
            return;
          }
          setSkipAccountIdentityCaptureOnce(true);
          await (app()["finishOAuthNewAccountAfterLogin"] as (...a: unknown[]) => unknown)("oauthMicrosoft", email, (o.displayName ?? "").trim());
        } catch (e) {
          toast(tauriErrorMessage(e));
        }
      })();
      return true;
    }
    case "account-auth-password-mode":
      clearAccountOAuthWizard();
      state.accountPasswordSetupExpanded = true;
      state.accountFormAuthKind = "password";
      state.oauthLockedEmail = null;
      state.accountFormOAuthPrefill = null;
      state.accountServersPanelOpen = false;
      (app()["render"] as (...a: unknown[]) => unknown)();
      return true;
    case "oauth-wizard-retry": {
      const retry = state.accountOAuthWizardRetry;
      if (!retry || (retry.authKind !== "oauthGoogle" && retry.authKind !== "oauthMicrosoft")) return true;
      clearAccountOAuthWizard();
      void (app()["finishOAuthNewAccountAfterLogin"] as (...a: unknown[]) => unknown)(retry.authKind, retry.email, retry.displayName);
      return true;
    }
    case "delete-settings-account":
      void (app()["deleteSettingsAccount"] as (...a: unknown[]) => unknown)();
      return true;
    default:
      return false;
  }
}