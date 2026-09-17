// @ts-nocheck — bridged app() calls; tighten types incrementally.
/** Event wiring — bridged to application.ts handlers via registerWireEventsBridge(). */
import { invoke } from "@tauri-apps/api/core";
import { ipcThrottleMs } from "../../ipc_bridge";
import { clearSuggestionShownKeys } from "../../activity";
import {
  accountFieldTouched,
  applyDomainPresetIfSafe,
  serverFieldSelectors,
  serverSidesFromPreset,
} from "../../accountSetup";
import { isAtAutocompletePanelOpen } from "../../atAutocomplete";
import { isHashAutocompletePanelOpen } from "../../hashAutocomplete";
import { isAiFeatureEnabled, setAllAiFeatures } from "../../aiFeatures";
import { captureAiFeatureTogglesFromDom, captureAiPrefsFieldsFromDom, persistAiFeaturePrefs, syncLlmEnginePrefsToDom } from "../../aiPrefsPersist";
import { tauriErrorMessage, withTimeout } from "../lib/tauriCommand";
import { setDiscoveredServersFormSnap } from "../account/discoveredServerSnap";
import { defaultEnabledSkillIds } from "../../assistAgent";
import {
  contactsListHasMore,
  getContactDetail,
  getContactsKeywordDraft,
  isContactsListLoading,
  loadContactDetail,
  loadContactProfile,
  loadContactsList,
  setContactsKeywordDraft,
} from "../../contactsView";
import { setLocale, t } from "../../i18n";
import {
  isSavedDraftsVirtualMailbox,
  mailboxKind,
  threadMailboxListLabel,
} from "../../mailboxKinds";
import { saveFolderTreeExpanded } from "../../mailboxTree";
import { navCanGoBack } from "../../navigation";
import {
  orgRetagAccount,
  orgScanAccount,
  orgUndoLast,
} from "../../organizationView";
import { orgV2ScanAccount } from "../../organizationViewV2";
import { normalizeAiPrefsMerged } from "../../prefs_defaults";
import {
  clearThreadsRecentlyRemoved,
  markThreadsRecentlyRemoved,
} from "../../recentlyRemovedThreads";
import {
  applyEngineConnectionMode,
  normalizeSettingsAiModalId,
} from "../../settingsAiPanel";
import { setMailboxLocked } from "../../folderManagerView";
import { composeRewriteStyleFromTone } from "../core/composeTone";
import { MAIL_ACTION_TIMEOUT_MS } from "../core/timeouts";
import { isTauriRuntime } from "../lib/tauriRuntime";
import { currentAccount } from "../core/accountContext";
import { toast } from "../lib/toast";
import {
  dismissMailboxDigestPanel,
  enqueueMailboxDigestRefreshWhenIdle,
  mailboxDigestSlotInList,
} from "../mail/mailboxDigest";
import {
  invalidateIdleAiCachePrefetch,
  scheduleIdleAiCachePrefetch,
} from "../mail/idleAiCachePrefetch";
import {
  finishConfirmModal,
  finishTextPromptModal,
  openConfirmModal,
} from "../modals/promptConfirm";
import { state } from "../state";
import { threadIdsMatch } from "../lib/threadIdsMatch";
import { openThread } from "../mail/openThreadView";
import { onThreadMove, onThreadMoveTo } from "../mail/threadListActions";
import { commitSearchQuery } from "../mail/searchCommitQuery";
import { syncSearchBarChrome } from "../mail/searchBarUi";
import { refreshSearchTagCatalog } from "../mail/searchTagCatalog";
import { wireAtAutocompleteFields } from "../mail/searchAtAutocompleteWire";
import { normalizeMailHrefForOpen, openExternalFromMailHref } from "../mail/mailLinkOpen";
import { render } from "../dispatch";
import { callApp } from "./callApp";
import { app } from "./wireEventsBridge";
export function wireEvents() {
  const composeAbortRef = app()["composeInteractionsAbortRef"] as { current?: AbortController };
  composeAbortRef.current?.abort();
  composeAbortRef.current = new AbortController();
  const composeSig = composeAbortRef.current.signal;
  callApp("wireComposeRecipientChips", );
  wireAtAutocompleteFields();

  document.querySelector<HTMLTextAreaElement>("#thread-qa-input")?.addEventListener(
    "input",
    (ev) => {
      state.threadQaDraft = (ev.currentTarget as HTMLTextAreaElement).value;
    },
    { signal: composeSig }
  );

  document.querySelectorAll<HTMLInputElement>("[data-ai-feature]").forEach((el) => {
    el.addEventListener(
      "change",
      () => {
        captureAiFeatureTogglesFromDom();
        state.appPrefs.ai = normalizeAiPrefsMerged(state.appPrefs.ai);
        void (async () => {
          try {
            await persistAiFeaturePrefs();
          } catch (e) {
            toast(tauriErrorMessage(e));
          }
        })();
      },
      { signal: composeSig }
    );
  });

  document.addEventListener(
    "change",
    (ev: Event) => {
      if (!state.settingsAiModal) return;
      const t = ev.target as HTMLElement | null;
      if (!t?.closest(".settings-ai-modal-body")) return;
      const id = (t as HTMLInputElement | HTMLSelectElement).id ?? "";
      if (id && (app()["AI_PREFS_IMMEDIATE_CHECKBOX_IDS"] as Set<string>).has(id)) {
        if (id === "prefs-openrouter-enabled" && t instanceof HTMLInputElement) {
          const next = t.checked;
          if (!next) {
            applyEngineConnectionMode(state.appPrefs.ai, "local");
            state.aiEngineSettingsTab = "local";
          } else {
            state.appPrefs.ai.openrouterEnabled = true;
          }
          syncLlmEnginePrefsToDom(state.appPrefs.ai);
          void callApp("persistEngineCheckboxToggle", next ? "OpenRouter activé." : "OpenRouter désactivé — bascule PC.");
        } else if (id === "prefs-llama-server-enabled" && t instanceof HTMLInputElement) {
          state.appPrefs.ai.llamaServerEnabled = t.checked;
          void callApp("persistEngineCheckboxToggle", t.checked ? "llama-server activé." : "llama-server désactivé.");
        }
        return;
      }
      if (t.matches('select[id^="prefs-"]')) {
        if (id === "prefs-dictation-backend" && t instanceof HTMLSelectElement) {
          const raw = t.value.trim();
          state.appPrefs.ai.dictationBackend =
            raw === "cloud" || raw === "local_http" ? raw : "whisper_cpp";
          captureAiPrefsFieldsFromDom(state.appPrefs);
          callApp("schedulePersistAiPrefsFromDom", { skipDomCapture: true });
          render();
          return;
        }
        if (id === "prefs-openrouter-model-preset" && t instanceof HTMLSelectElement) {
          const v = t.value.trim();
          if (v && v !== "__custom__") {
            state.appPrefs.ai.openrouterModel = v;
            const inp = document.querySelector<HTMLInputElement>("#prefs-openrouter-model");
            if (inp) inp.value = v;
          }
          captureAiPrefsFieldsFromDom(state.appPrefs);
          callApp("schedulePersistAiPrefsFromDom", { skipDomCapture: true });
          return;
        }
        if (id === "prefs-local-gguf-preset" && t instanceof HTMLSelectElement) {
          const v = t.value.trim();
          if (v && v !== "__custom__") {
            const sep = v.indexOf("|");
            if (sep > 0) {
              const repo = v.slice(0, sep);
              const file = v.slice(sep + 1);
              state.appPrefs.ai.localLlmHfRepoId = repo;
              state.appPrefs.ai.localLlmGgufFile = file;
              state.appPrefs.ai.localLlmEnabled = true;
              const repoEl = document.querySelector<HTMLInputElement>("#prefs-local-llm-repo");
              const fileEl = document.querySelector<HTMLInputElement>("#prefs-local-llm-file");
              if (repoEl) repoEl.value = repo;
              if (fileEl) fileEl.value = file;
            }
          }
          captureAiPrefsFieldsFromDom(state.appPrefs);
          callApp("schedulePersistAiPrefsFromDom", { skipDomCapture: true });
          return;
        }
        captureAiPrefsFieldsFromDom(state.appPrefs);
        callApp("schedulePersistAiPrefsFromDom", { skipDomCapture: true });
        return;
      }
      if (t instanceof HTMLInputElement && t.type === "checkbox" && id.startsWith("prefs-")) {
        captureAiPrefsFieldsFromDom(state.appPrefs);
        callApp("schedulePersistAiPrefsFromDom", { skipDomCapture: true });
        return;
      }
      if (t.matches("[data-ai-feature]")) return;
      if (
        t instanceof HTMLInputElement &&
        t.classList.contains("settings-ctl") &&
        t.id?.startsWith("prefs-") &&
        t.type !== "password" &&
        t.type !== "checkbox"
      ) {
        if (id === "prefs-local-llm-ctx-range") {
          callApp("applyContextSliderIndex", Number.parseInt(t.value, 10));
        }
        captureAiPrefsFieldsFromDom(state.appPrefs);
        callApp("schedulePersistAiPrefsFromDom", { skipDomCapture: true });
      }
    },
    { signal: composeSig }
  );

  document.addEventListener(
    "input",
    (ev: Event) => {
      if (!state.settingsAiModal) return;
      const t = ev.target as HTMLElement | null;
      if (!(t instanceof HTMLInputElement) || t.id !== "prefs-local-llm-ctx-range") return;
      if (!t.closest(".settings-ai-modal-body")) return;
      callApp("applyContextSliderIndex", Number.parseInt(t.value, 10));
      captureAiPrefsFieldsFromDom(state.appPrefs);
      callApp("schedulePersistAiPrefsFromDom", { skipDomCapture: true });
    },
    { signal: composeSig }
  );

  const actionHosts = document.querySelectorAll<HTMLElement>("[data-action]");
  let contactsSearchDebounce: ReturnType<typeof setTimeout> | undefined;
  document.querySelector<HTMLInputElement>("#contacts-list-search")?.addEventListener(
    "input",
    (ev) => {
      const q = (ev.currentTarget as HTMLInputElement).value;
      const acc = currentAccount();
      if (!acc?.id) return;
      if (contactsSearchDebounce) clearTimeout(contactsSearchDebounce);
      contactsSearchDebounce = window.setTimeout(() => {
        void loadContactsList(acc.id!, { reset: true, query: q }).then(() => render());
      }, 280);
    },
    { signal: composeSig }
  );

  const contactsListEl = document.querySelector<HTMLElement>("#contacts-thread-list");
  contactsListEl?.addEventListener(
    "scroll",
    () => {
      if (state.view !== "contacts" || isContactsListLoading() || !contactsListHasMore()) return;
      const el = contactsListEl;
      const nearBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 120;
      if (!nearBottom) return;
      const acc = currentAccount();
      if (!acc?.id) return;
      void loadContactsList(acc.id).then(() => render());
    },
    { signal: composeSig, passive: true }
  );

  actionHosts.forEach((host) => {
    host.addEventListener("click", (ev: MouseEvent) => {
      const cur = ev.currentTarget as HTMLElement | null;
      const el = cur ?? host;
      const action = (el.dataset.action ?? "").trim();
      void handleAction(action, el);
    });
  });

  document.addEventListener(
    "change",
    (ev: Event) => {
      const t = ev.target as HTMLElement | null;
      if (t?.dataset.action === "agent-toggle-skill") {
        const skill = t.dataset.skill as AssistSkillId | undefined;
        const s = state.agentSession;
        if (!skill || !s || s.busy) return;
        const checked = (t as HTMLInputElement).checked;
        const set = new Set(s.enabledSkills);
        if (checked) set.add(skill);
        else set.delete(skill);
        if (!set.has("analyzeIntent")) set.add("analyzeIntent");
        if (!set.has("draftReply")) set.add("draftReply");
        s.enabledSkills = [...set];
        void callApp("agentRefreshPlanFromDraft", ).then(() => render());
        return;
      }
      if (t?.dataset.action === "mailbox-brief-mode") {
        const v = (t as HTMLSelectElement).value as "auto" | "quick" | "decision" | "deep";
        if (v === state.mailboxBriefMode) return;
        state.mailboxBriefMode = v;
        if (mailboxDigestSlotInList()) {
          void enqueueMailboxDigestRefreshWhenIdle(true);
        }
        render();
        return;
      }
      if (t?.dataset.action !== "agent-set-mode") return;
      const mode = (t as HTMLSelectElement).value as AssistMode;
      const s = state.agentSession;
      if (!s || s.busy) return;
      s.assistMode = mode;
      s.enabledSkills = defaultEnabledSkillIds(mode);
      void callApp("agentRefreshPlanFromDraft", ).then(() => render());
    },
    { signal: composeSig },
  );

  document
    .querySelector<HTMLInputElement>("#prefs-llama-server-cpu-override")
    ?.addEventListener(
      "change",
      (ev) => {
        const next = Boolean((ev.currentTarget as HTMLInputElement | null)?.checked);
        state.appPrefs.ai.llamaServerAllowCpuOverride = next;
        if (!isTauriRuntime()) return;
        void (async () => {
          try {
            await withTimeout(invoke("set_app_prefs", { prefs: state.appPrefs }), MAIL_ACTION_TIMEOUT_MS);
            toast(next ? "Override CPU autorisé (llama-server)." : "Override CPU désactivé.");
            void callApp("refreshLlmRuntimeStatus", false).then(() => {
              if (state.settingsAiModal === "engines") render();
            });
          } catch (e) {
            toast(tauriErrorMessage(e));
          }
        })();
      },
      { signal: composeSig }
    );

  document
    .querySelector<HTMLInputElement>("#prefs-llama-server-spawn-enabled")
    ?.addEventListener(
      "change",
      (ev) => {
        const next = Boolean((ev.currentTarget as HTMLInputElement | null)?.checked);
        state.appPrefs.ai.llamaServerSpawnEnabled = next;
        if (!isTauriRuntime()) return;
        void (async () => {
          try {
            await withTimeout(invoke("set_app_prefs", { prefs: state.appPrefs }), MAIL_ACTION_TIMEOUT_MS);
            toast(next ? "Lancement llama-server par l’app activé." : "Lancement llama-server par l’app désactivé.");
            void callApp("refreshLlmRuntimeStatus", false).then(() => {
              if (state.settingsAiModal === "engines") render();
            });
          } catch (e) {
            toast(tauriErrorMessage(e));
          }
        })();
      },
      { signal: composeSig }
    );

  const persistAiImmediate = (): void => {
    if (!isTauriRuntime()) return;
    void (async () => {
      try {
        await withTimeout(invoke("set_app_prefs", { prefs: state.appPrefs }), MAIL_ACTION_TIMEOUT_MS);
        toast("Réglage IA enregistré.");
      } catch (e) {
        toast(tauriErrorMessage(e));
      }
    })();
  };

  document.querySelector<HTMLInputElement>("#prefs-bg-auto-semantic")?.addEventListener(
    "change",
    (ev) => {
      state.appPrefs.ai.aiBackgroundAutoSemanticIndex = Boolean(
        (ev.currentTarget as HTMLInputElement)?.checked
      );
      persistAiImmediate();
    },
    { signal: composeSig }
  );

  document.querySelector<HTMLInputElement>("#prefs-bg-llm-prefetch")?.addEventListener(
    "change",
    (ev) => {
      state.appPrefs.ai.aiBackgroundLlmPrefetch = Boolean(
        (ev.currentTarget as HTMLInputElement)?.checked
      );
      persistAiImmediate();
    },
    { signal: composeSig }
  );

  document.querySelector<HTMLInputElement>("#prefs-bg-idle-ai-cache")?.addEventListener(
    "change",
    (ev) => {
      state.appPrefs.ai.aiBackgroundIdleLlmCachePrefetch = Boolean(
        (ev.currentTarget as HTMLInputElement)?.checked
      );
      if (!state.appPrefs.ai.aiBackgroundIdleLlmCachePrefetch) invalidateIdleAiCachePrefetch();
      persistAiImmediate();
      if (state.appPrefs.ai.aiBackgroundIdleLlmCachePrefetch) scheduleIdleAiCachePrefetch();
    },
    { signal: composeSig }
  );

  document.querySelector<HTMLInputElement>("#prefs-ai-cloud-fallback")?.addEventListener(
    "change",
    (ev) => {
      state.appPrefs.ai.aiCloudLlmFallback = Boolean((ev.currentTarget as HTMLInputElement)?.checked);
      persistAiImmediate();
    },
    { signal: composeSig }
  );

  document.querySelector<HTMLInputElement>("#prefs-semantic-search")?.addEventListener(
    "change",
    (ev) => {
      const el = ev.currentTarget as HTMLInputElement;
      if (el.disabled) return;
      state.appPrefs.ai.semanticSearchEnabled = Boolean(el.checked);
      persistAiImmediate();
    },
    { signal: composeSig }
  );

  document.querySelectorAll<HTMLElement>("[data-toast]").forEach((element) => {
    element.addEventListener("click", () => toast(element.dataset.toast ?? "Not implemented yet"));
  });
  document.querySelectorAll<HTMLButtonElement>("[data-mailbox]").forEach((el) => {
    el.addEventListener("click", () => {
      // Boutons avec data-action (fm-select, org-open-mailbox, …) : handleAction uniquement.
      if (el.dataset.action?.trim()) return;
      void (async () => {
        await callApp("switchMailbox", el.dataset.mailbox || "INBOX");
      })();
    });
  });
  document.querySelectorAll<HTMLElement>(".thread-row-main[data-open-thread]").forEach((element) => {
    element.addEventListener("click", () => {
      const tid = element.dataset.threadId ?? "";
      const preserveAi = Boolean(
        state.aiOutput?.trim() && threadIdsMatch(state.aiThreadScope, tid)
      );
      void openThread(tid, { preserveAi });
    });
  });
  document.querySelectorAll<HTMLButtonElement>(".digest-open-thread[data-thread-id]").forEach((element) => {
    element.addEventListener("click", (e) => {
      e.preventDefault();
      void openThread(element.dataset.threadId ?? "");
    });
  });
  document.querySelectorAll<HTMLButtonElement>("[data-mv=trash][data-thread-id]").forEach((el) => {
    el.addEventListener("click", (e) => {
      e.stopPropagation();
      void onThreadMove("trash", el.dataset.threadId ?? "", el.dataset.sourceMailbox);
    });
  });
  document.querySelectorAll<HTMLButtonElement>("[data-mv=archive][data-thread-id]").forEach((el) => {
    el.addEventListener("click", (e) => {
      e.stopPropagation();
      void onThreadMove("archive", el.dataset.threadId ?? "", el.dataset.sourceMailbox);
    });
  });
  document.querySelectorAll<HTMLButtonElement>('[data-action="org-delete-mailbox-one"]').forEach((el) => {
    el.addEventListener(
      "click",
      (e) => {
        e.stopPropagation();
        e.preventDefault();
        const mb = el.dataset.mailbox?.trim();
        const refId = el.dataset.mailboxRefId?.trim();
        if (mb && refId) void callApp("onOrgDeleteMailboxOne", mb, refId);
      },
      { signal: composeSig },
    );
  });
  document.querySelectorAll<HTMLButtonElement>('[data-action="org-sync-mailbox"]').forEach((el) => {
    el.addEventListener(
      "click",
      (e) => {
        e.stopPropagation();
        e.preventDefault();
        const mb = el.dataset.mailbox?.trim();
        if (mb) void callApp("onOrgSyncMailbox", mb);
      },
      { signal: composeSig },
    );
  });
  document.querySelectorAll<HTMLButtonElement>('[data-action="org-v2-ignore-mailbox"]').forEach((el) => {
    el.addEventListener(
      "click",
      (e) => {
        e.stopPropagation();
        e.preventDefault();
        const mb = el.dataset.mailbox?.trim();
        if (mb) void callApp("onOrgV2IgnoreMailboxUi", mb);
      },
      { signal: composeSig },
    );
  });
  document.querySelectorAll<HTMLButtonElement>('[data-action="org-v2-unignore-mailbox"]').forEach((el) => {
    el.addEventListener(
      "click",
      (e) => {
        e.stopPropagation();
        e.preventDefault();
        const mb = el.dataset.mailbox?.trim();
        if (mb) void callApp("onOrgV2UnignoreMailboxUi", mb);
      },
      { signal: composeSig },
    );
  });
  document.querySelectorAll<HTMLSelectElement>("select.inbox-thread-folder-move").forEach((el) => {
    el.addEventListener("mousedown", (e) => e.stopPropagation());
    el.addEventListener("click", (e) => e.stopPropagation());
    el.addEventListener("change", (e) => {
      e.stopPropagation();
      const dest = el.value.trim();
      const tid = el.dataset.threadId ?? "";
      if (!dest || !tid) return;
      el.value = "";
      void onThreadMoveTo(tid, dest);
    });
  });
  document.querySelector<HTMLSelectElement>("#move-target-select")?.addEventListener("change", (event) => {
    state.moveTargetMailbox = (event.currentTarget as HTMLSelectElement).value || state.moveTargetMailbox;
  });
  document.querySelectorAll<HTMLButtonElement>("[data-att-download][data-msg-id]").forEach((el) => {
    el.addEventListener("click", (e) => {
      e.stopPropagation();
      void callApp("onAttachmentAction", "download", el.dataset.msgId ?? "", el.dataset.attDownload ?? "");
    });
  });
  document.querySelectorAll<HTMLButtonElement>("[data-att-open][data-msg-id]").forEach((el) => {
    el.addEventListener("click", (e) => {
      e.stopPropagation();
      void callApp("onAttachmentAction", "open", el.dataset.msgId ?? "", el.dataset.attOpen ?? "", el.dataset.attName ?? "");
    });
  });
  if (state.view === "thread") {
    callApp("hydrateEmailHtml", );
  }
  document.querySelectorAll(".modal-shell-stop-prop").forEach((shell) => {
    shell.addEventListener("click", (e) => e.stopPropagation());
  });
  const orgTrashCheck = document.querySelector<HTMLInputElement>("#org-trash-check");
  const orgTrashConfirm = document.querySelector<HTMLButtonElement>("#org-trash-confirm-btn");
  if (orgTrashCheck && orgTrashConfirm) {
    const syncTrashConfirm = () => {
      orgTrashConfirm.disabled = !orgTrashCheck.checked;
    };
    syncTrashConfirm();
    orgTrashCheck.addEventListener("change", syncTrashConfirm, { signal: composeSig });
  }
  const orgDelMbCheck = document.querySelector<HTMLInputElement>("#org-delete-mailbox-check");
  const orgDelMbConfirm = document.querySelector<HTMLButtonElement>("#org-delete-mailbox-confirm-btn");
  if (orgDelMbCheck && orgDelMbConfirm) {
    const syncDelMbConfirm = () => {
      orgDelMbConfirm.disabled = !orgDelMbCheck.checked;
    };
    syncDelMbConfirm();
    orgDelMbCheck.addEventListener("change", syncDelMbConfirm, { signal: composeSig });
  }
  const orgV2TrashCheck = document.querySelector<HTMLInputElement>("#org-v2-trash-check");
  const orgV2TrashConfirm = document.querySelector<HTMLButtonElement>("#org-v2-trash-confirm-btn");
  if (orgV2TrashCheck && orgV2TrashConfirm) {
    const syncV2Trash = () => {
      orgV2TrashConfirm.disabled = !orgV2TrashCheck.checked;
    };
    syncV2Trash();
    orgV2TrashCheck.addEventListener("change", syncV2Trash, { signal: composeSig });
  }
  const orgV2DelMbCheck = document.querySelector<HTMLInputElement>("#org-v2-delete-mailbox-check");
  const orgV2DelMbConfirm = document.querySelector<HTMLButtonElement>("#org-v2-delete-mailbox-confirm-btn");
  if (orgV2DelMbCheck && orgV2DelMbConfirm) {
    const syncV2DelMb = () => {
      orgV2DelMbConfirm.disabled = !orgV2DelMbCheck.checked;
    };
    syncV2DelMb();
    orgV2DelMbCheck.addEventListener("change", syncV2DelMb, { signal: composeSig });
  }
  document.querySelectorAll<HTMLButtonElement>("[data-tone]").forEach((button) => {
    button.addEventListener("click", () => {
      state.tone = (button.dataset.tone as Tone) ?? state.tone;
      render();
    });
  });

  document.querySelector<HTMLElement>(".composer-body .preview")?.addEventListener(
    "click",
    (ev) => {
      const t = ev.target as HTMLElement | null;
      if (!t) return;
      const a = t.closest("a[href]") as HTMLAnchorElement | null;
      if (a) {
        const raw = a.getAttribute("href")?.trim() ?? "";
        const normalized = normalizeMailHrefForOpen(raw);
        if (normalized) {
          ev.preventDefault();
          void openExternalFromMailHref(normalized);
        }
        return;
      }
      if (t.tagName !== "IMG") return;
      const img = t as HTMLImageElement;
      const src = callApp("pickImgSrcForLightbox", img);
      if (!src) return;
      const alt = (img.getAttribute("alt") || "").trim();
      void callApp("resolveSrcForMailImageLightbox", src, null).then((resolved) => {
        state.imageModal = { src: resolved.src, alt, revokeObjectUrl: resolved.revokeObjectUrl ?? null };
        render();
      });
    },
    { signal: composeSig }
  );
  document.querySelectorAll<HTMLInputElement>("#search-input, #search-modal-input").forEach((searchInputEl) => {
    const fromModal = searchInputEl.id === "search-modal-input";
    searchInputEl.addEventListener(
      "focus",
      () => {
        void refreshSearchTagCatalog();
      },
      { signal: composeSig }
    );
    searchInputEl.addEventListener(
      "input",
      (event) => {
        state.searchDraft = (event.currentTarget as HTMLInputElement).value;
        syncSearchBarChrome();
        if (/#(?:tag|source|kind|entity|state)/i.test(state.searchDraft)) {
          void refreshSearchTagCatalog();
        }
      },
      { signal: composeSig }
    );
    searchInputEl.addEventListener(
      "keydown",
      (event) => {
        if (event.key === "Tab") return;
        if (event.key !== "Enter") return;
        if (isHashAutocompletePanelOpen() || isAtAutocompletePanelOpen()) return;
        event.preventDefault();
        commitSearchQuery({ fromModal });
      },
      { signal: composeSig }
    );
    searchInputEl.addEventListener(
      "search",
      () => {
        commitSearchQuery({ fromModal });
      },
      { signal: composeSig }
    );
  });
  document.querySelector<HTMLSelectElement>("#account-select")?.addEventListener("change", (event) => {
    void (async () => {
      const id = (event.currentTarget as HTMLSelectElement).value || state.accounts[0]?.id || "";
      await callApp("switchActiveAccount", id);
      render();
    })();
  });
  document.querySelector<HTMLTextAreaElement>("#compose-body")?.addEventListener(
    "input",
    (event) => {
      callApp("setComposeFromTextareaValue", (event.currentTarget as HTMLTextAreaElement).value);
      callApp("schedulePreviewUpdate", );
      callApp("scheduleDraftRevisionSave", );
    },
    { signal: composeSig }
  );
  document.querySelector<HTMLTextAreaElement>("#compose-body")?.addEventListener(
    "paste",
    (event) => {
    const e = event as ClipboardEvent;
    const textarea = e.currentTarget as HTMLTextAreaElement | null;
    if (!textarea) return;
    const items = Array.from(e.clipboardData?.items ?? []);
    const imgItem = items.find((it) => it.kind === "file" && (it.type || "").startsWith("image/"));
    if (!imgItem) return;
    const file = imgItem.getAsFile();
    if (!file) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = typeof reader.result === "string" ? reader.result : "";
      if (!dataUrl.startsWith("data:image/")) return;
      const start = textarea.selectionStart ?? textarea.value.length;
      const end = textarea.selectionEnd ?? textarea.value.length;
      const nlBefore = start > 0 && textarea.value[start - 1] !== "\n" ? "\n" : "";
      const nlAfter = end < textarea.value.length && textarea.value[end] !== "\n" ? "\n" : "";
      const stamp = new Date().toLocaleString();
      const snippet = `${nlBefore}![Capture ${stamp}](${dataUrl})${nlAfter}\n`;
      textarea.setRangeText(snippet, start, end, "end");
      callApp("loadComposeMarkdownIntoEditor", textarea.value);
      textarea.value = state.composeBody;
      callApp("schedulePreviewUpdate", 0);
      textarea.focus();
    };
    reader.readAsDataURL(file);
    },
    { signal: composeSig }
  );
  document.querySelector<HTMLInputElement>("#compose-subject")?.addEventListener(
    "input",
    () => {
      callApp("scheduleDraftRevisionSave", );
    },
    { signal: composeSig }
  );
  document.querySelector<HTMLTextAreaElement>("#compose-body")?.addEventListener(
    "keydown",
    (event) => {
      const evk = event as KeyboardEvent;
      if (!(evk.ctrlKey || evk.metaKey)) return;
      const key = evk.key.toLowerCase();
      if (key === "b") {
        evk.preventDefault();
        void callApp("applyMarkdownAction", "bold");
      } else if (key === "i") {
        evk.preventDefault();
        void callApp("applyMarkdownAction", "italic");
      } else if (key === "k") {
        evk.preventDefault();
        void callApp("applyMarkdownAction", "link");
      } else if (key === "u") {
        evk.preventDefault();
        void callApp("applyMarkdownAction", "underline");
      }
    },
    { signal: composeSig }
  );
  document.querySelectorAll<HTMLButtonElement>("[data-md]").forEach((button) => {
    button.addEventListener(
      "click",
      () => {
        void callApp("applyMarkdownAction", button.dataset.md ?? "");
      },
      { signal: composeSig }
    );
  });
  callApp("bindComposerDropzone", );
  document.querySelector<HTMLInputElement>("[data-quick-reply]")?.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      void callApp("sendQuickReply", "reply");
    }
  });

  // Account creation helpers.
  document.querySelector<HTMLInputElement>("#account-email")?.addEventListener("input", (event) => {
    const value = (event.currentTarget as HTMLInputElement).value;
    applyDomainPresetIfSafe(value, {
      onApplied(domain, preset) {
        setDiscoveredServersFormSnap(serverSidesFromPreset(preset));
        state.accountMessage = `Préréglage local pour « ${domain} ».`;
        accountFieldTouched.serverFields = false;
        render();
      },
    });
  });
  for (const selector of serverFieldSelectors()) {
    document.querySelector<HTMLElement>(selector)?.addEventListener("input", () => {
      accountFieldTouched.serverFields = true;
    });
    document.querySelector<HTMLElement>(selector)?.addEventListener("change", () => {
      accountFieldTouched.serverFields = true;
    });
  }
}


export { handleAction } from "./wireEvents/handleAction";
