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
import { captureAiPrefsFieldsFromDom, syncLlmEnginePrefsToDom } from "../../aiPrefsPersist";
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
import { app } from "./wireEventsBridge";
export function wireEvents() {
  const composeAbortRef = app()["composeInteractionsAbortRef"] as { current?: AbortController };
  composeAbortRef.current?.abort();
  composeAbortRef.current = new AbortController();
  const composeSig = composeAbortRef.current.signal;
  (app()["wireComposeRecipientChips"] as (...a: unknown[]) => unknown)();
  (app()["wireAtAutocompleteFields"] as (...a: unknown[]) => unknown)();

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
        (app()["captureAiFeatureTogglesFromDom"] as (...a: unknown[]) => unknown)();
        state.appPrefs.ai = normalizeAiPrefsMerged(state.appPrefs.ai);
        void (async () => {
          try {
            await (app()["persistAiFeaturePrefs"] as (...a: unknown[]) => unknown)();
          } catch (e) {
            toast((app()["tauriErrorMessage"] as (...a: unknown[]) => unknown)(e));
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
          void (app()["persistEngineCheckboxToggle"] as (...a: unknown[]) => unknown)(next ? "OpenRouter activé." : "OpenRouter désactivé — bascule PC.");
        } else if (id === "prefs-llama-server-enabled" && t instanceof HTMLInputElement) {
          state.appPrefs.ai.llamaServerEnabled = t.checked;
          void (app()["persistEngineCheckboxToggle"] as (...a: unknown[]) => unknown)(t.checked ? "llama-server activé." : "llama-server désactivé.");
        }
        return;
      }
      if (t.matches('select[id^="prefs-"]')) {
        if (id === "prefs-dictation-backend" && t instanceof HTMLSelectElement) {
          const raw = t.value.trim();
          state.appPrefs.ai.dictationBackend =
            raw === "cloud" || raw === "local_http" ? raw : "whisper_cpp";
          captureAiPrefsFieldsFromDom(state.appPrefs);
          (app()["schedulePersistAiPrefsFromDom"] as (...a: unknown[]) => unknown)({ skipDomCapture: true });
          (app()["render"] as (...a: unknown[]) => unknown)();
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
          (app()["schedulePersistAiPrefsFromDom"] as (...a: unknown[]) => unknown)({ skipDomCapture: true });
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
          (app()["schedulePersistAiPrefsFromDom"] as (...a: unknown[]) => unknown)({ skipDomCapture: true });
          return;
        }
        captureAiPrefsFieldsFromDom(state.appPrefs);
        (app()["schedulePersistAiPrefsFromDom"] as (...a: unknown[]) => unknown)({ skipDomCapture: true });
        return;
      }
      if (t instanceof HTMLInputElement && t.type === "checkbox" && id.startsWith("prefs-")) {
        captureAiPrefsFieldsFromDom(state.appPrefs);
        (app()["schedulePersistAiPrefsFromDom"] as (...a: unknown[]) => unknown)({ skipDomCapture: true });
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
          (app()["applyContextSliderIndex"] as (...a: unknown[]) => unknown)(Number.parseInt(t.value, 10));
        }
        captureAiPrefsFieldsFromDom(state.appPrefs);
        (app()["schedulePersistAiPrefsFromDom"] as (...a: unknown[]) => unknown)({ skipDomCapture: true });
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
      (app()["applyContextSliderIndex"] as (...a: unknown[]) => unknown)(Number.parseInt(t.value, 10));
      captureAiPrefsFieldsFromDom(state.appPrefs);
      (app()["schedulePersistAiPrefsFromDom"] as (...a: unknown[]) => unknown)({ skipDomCapture: true });
    },
    { signal: composeSig }
  );

  const actionHosts = document.querySelectorAll<HTMLElement>("[data-action]");
  let contactsSearchDebounce: ReturnType<typeof setTimeout> | undefined;
  document.querySelector<HTMLInputElement>("#contacts-list-search")?.addEventListener(
    "input",
    (ev) => {
      const q = (ev.currentTarget as HTMLInputElement).value;
      const acc = (app()["currentAccount"] as (...a: unknown[]) => unknown)();
      if (!acc?.id) return;
      if (contactsSearchDebounce) clearTimeout(contactsSearchDebounce);
      contactsSearchDebounce = window.setTimeout(() => {
        void loadContactsList(acc.id!, { reset: true, query: q }).then(() => (app()["render"] as (...a: unknown[]) => unknown)());
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
      const acc = (app()["currentAccount"] as (...a: unknown[]) => unknown)();
      if (!acc?.id) return;
      void loadContactsList(acc.id).then(() => (app()["render"] as (...a: unknown[]) => unknown)());
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
        void (app()["agentRefreshPlanFromDraft"] as (...a: unknown[]) => unknown)().then(() => (app()["render"] as (...a: unknown[]) => unknown)());
        return;
      }
      if (t?.dataset.action === "mailbox-brief-mode") {
        const v = (t as HTMLSelectElement).value as "auto" | "quick" | "decision" | "deep";
        if (v === state.mailboxBriefMode) return;
        state.mailboxBriefMode = v;
        if (mailboxDigestSlotInList()) {
          void enqueueMailboxDigestRefreshWhenIdle(true);
        }
        (app()["render"] as (...a: unknown[]) => unknown)();
        return;
      }
      if (t?.dataset.action !== "agent-set-mode") return;
      const mode = (t as HTMLSelectElement).value as AssistMode;
      const s = state.agentSession;
      if (!s || s.busy) return;
      s.assistMode = mode;
      s.enabledSkills = defaultEnabledSkillIds(mode);
      void (app()["agentRefreshPlanFromDraft"] as (...a: unknown[]) => unknown)().then(() => (app()["render"] as (...a: unknown[]) => unknown)());
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
            await (app()["withTimeout"] as (...a: unknown[]) => unknown)(invoke("set_app_prefs", { prefs: state.appPrefs }), MAIL_ACTION_TIMEOUT_MS);
            toast(next ? "Override CPU autorisé (llama-server)." : "Override CPU désactivé.");
            void (app()["refreshLlmRuntimeStatus"] as (...a: unknown[]) => unknown)(false).then(() => {
              if (state.settingsAiModal === "engines") (app()["render"] as (...a: unknown[]) => unknown)();
            });
          } catch (e) {
            toast((app()["tauriErrorMessage"] as (...a: unknown[]) => unknown)(e));
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
            await (app()["withTimeout"] as (...a: unknown[]) => unknown)(invoke("set_app_prefs", { prefs: state.appPrefs }), MAIL_ACTION_TIMEOUT_MS);
            toast(next ? "Lancement llama-server par l’app activé." : "Lancement llama-server par l’app désactivé.");
            void (app()["refreshLlmRuntimeStatus"] as (...a: unknown[]) => unknown)(false).then(() => {
              if (state.settingsAiModal === "engines") (app()["render"] as (...a: unknown[]) => unknown)();
            });
          } catch (e) {
            toast((app()["tauriErrorMessage"] as (...a: unknown[]) => unknown)(e));
          }
        })();
      },
      { signal: composeSig }
    );

  const persistAiImmediate = (): void => {
    if (!isTauriRuntime()) return;
    void (async () => {
      try {
        await (app()["withTimeout"] as (...a: unknown[]) => unknown)(invoke("set_app_prefs", { prefs: state.appPrefs }), MAIL_ACTION_TIMEOUT_MS);
        toast("Réglage IA enregistré.");
      } catch (e) {
        toast((app()["tauriErrorMessage"] as (...a: unknown[]) => unknown)(e));
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
        await (app()["switchMailbox"] as (...a: unknown[]) => unknown)(el.dataset.mailbox || "INBOX");
      })();
    });
  });
  document.querySelectorAll<HTMLElement>(".thread-row-main[data-open-thread]").forEach((element) => {
    element.addEventListener("click", () => {
      const tid = element.dataset.threadId ?? "";
      const preserveAi = Boolean(
        state.aiOutput?.trim() && (app()["threadIdsMatch"] as (...a: unknown[]) => unknown)(state.aiThreadScope, tid)
      );
      void (app()["openThread"] as (...a: unknown[]) => unknown)(tid, { preserveAi });
    });
  });
  document.querySelectorAll<HTMLButtonElement>(".digest-open-thread[data-thread-id]").forEach((element) => {
    element.addEventListener("click", (e) => {
      e.preventDefault();
      void (app()["openThread"] as (...a: unknown[]) => unknown)(element.dataset.threadId ?? "");
    });
  });
  document.querySelectorAll<HTMLButtonElement>("[data-mv=trash][data-thread-id]").forEach((el) => {
    el.addEventListener("click", (e) => {
      e.stopPropagation();
      void (app()["onThreadMove"] as (...a: unknown[]) => unknown)("trash", el.dataset.threadId ?? "", el.dataset.sourceMailbox);
    });
  });
  document.querySelectorAll<HTMLButtonElement>("[data-mv=archive][data-thread-id]").forEach((el) => {
    el.addEventListener("click", (e) => {
      e.stopPropagation();
      void (app()["onThreadMove"] as (...a: unknown[]) => unknown)("archive", el.dataset.threadId ?? "", el.dataset.sourceMailbox);
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
        if (mb && refId) void (app()["onOrgDeleteMailboxOne"] as (...a: unknown[]) => unknown)(mb, refId);
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
        if (mb) void (app()["onOrgSyncMailbox"] as (...a: unknown[]) => unknown)(mb);
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
        if (mb) void (app()["onOrgV2IgnoreMailboxUi"] as (...a: unknown[]) => unknown)(mb);
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
        if (mb) void (app()["onOrgV2UnignoreMailboxUi"] as (...a: unknown[]) => unknown)(mb);
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
      void (app()["onThreadMoveTo"] as (...a: unknown[]) => unknown)(tid, dest);
    });
  });
  document.querySelector<HTMLSelectElement>("#move-target-select")?.addEventListener("change", (event) => {
    state.moveTargetMailbox = (event.currentTarget as HTMLSelectElement).value || state.moveTargetMailbox;
  });
  document.querySelectorAll<HTMLButtonElement>("[data-att-download][data-msg-id]").forEach((el) => {
    el.addEventListener("click", (e) => {
      e.stopPropagation();
      void (app()["onAttachmentAction"] as (...a: unknown[]) => unknown)("download", el.dataset.msgId ?? "", el.dataset.attDownload ?? "");
    });
  });
  document.querySelectorAll<HTMLButtonElement>("[data-att-open][data-msg-id]").forEach((el) => {
    el.addEventListener("click", (e) => {
      e.stopPropagation();
      void (app()["onAttachmentAction"] as (...a: unknown[]) => unknown)("open", el.dataset.msgId ?? "", el.dataset.attOpen ?? "", el.dataset.attName ?? "");
    });
  });
  if (state.view === "thread") {
    (app()["hydrateEmailHtml"] as (...a: unknown[]) => unknown)();
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
      (app()["render"] as (...a: unknown[]) => unknown)();
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
        const normalized = (app()["normalizeMailHrefForOpen"] as (...a: unknown[]) => unknown)(raw);
        if (normalized) {
          ev.preventDefault();
          void (app()["openExternalFromMailHref"] as (...a: unknown[]) => unknown)(normalized);
        }
        return;
      }
      if (t.tagName !== "IMG") return;
      const img = t as HTMLImageElement;
      const src = (app()["pickImgSrcForLightbox"] as (...a: unknown[]) => unknown)(img);
      if (!src) return;
      const alt = (img.getAttribute("alt") || "").trim();
      void (app()["resolveSrcForMailImageLightbox"] as (...a: unknown[]) => unknown)(src, null).then((resolved) => {
        state.imageModal = { src: resolved.src, alt, revokeObjectUrl: resolved.revokeObjectUrl ?? null };
        (app()["render"] as (...a: unknown[]) => unknown)();
      });
    },
    { signal: composeSig }
  );
  document.querySelectorAll<HTMLInputElement>("#search-input, #search-modal-input").forEach((searchInputEl) => {
    const fromModal = searchInputEl.id === "search-modal-input";
    searchInputEl.addEventListener(
      "focus",
      () => {
        void (app()["refreshSearchTagCatalog"] as (...a: unknown[]) => unknown)();
      },
      { signal: composeSig }
    );
    searchInputEl.addEventListener(
      "input",
      (event) => {
        state.searchDraft = (event.currentTarget as HTMLInputElement).value;
        (app()["syncSearchBarChrome"] as (...a: unknown[]) => unknown)();
        if (/#(?:tag|source|kind|entity|state)/i.test(state.searchDraft)) {
          void (app()["refreshSearchTagCatalog"] as (...a: unknown[]) => unknown)();
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
        (app()["commitSearchQuery"] as (...a: unknown[]) => unknown)({ fromModal });
      },
      { signal: composeSig }
    );
    searchInputEl.addEventListener(
      "search",
      () => {
        (app()["commitSearchQuery"] as (...a: unknown[]) => unknown)({ fromModal });
      },
      { signal: composeSig }
    );
  });
  document.querySelector<HTMLSelectElement>("#account-select")?.addEventListener("change", (event) => {
    void (async () => {
      const id = (event.currentTarget as HTMLSelectElement).value || state.accounts[0]?.id || "";
      await (app()["switchActiveAccount"] as (...a: unknown[]) => unknown)(id);
      (app()["render"] as (...a: unknown[]) => unknown)();
    })();
  });
  document.querySelector<HTMLTextAreaElement>("#compose-body")?.addEventListener(
    "input",
    (event) => {
      (app()["setComposeFromTextareaValue"] as (...a: unknown[]) => unknown)((event.currentTarget as HTMLTextAreaElement).value);
      (app()["schedulePreviewUpdate"] as (...a: unknown[]) => unknown)();
      (app()["scheduleDraftRevisionSave"] as (...a: unknown[]) => unknown)();
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
      (app()["loadComposeMarkdownIntoEditor"] as (...a: unknown[]) => unknown)(textarea.value);
      textarea.value = state.composeBody;
      (app()["schedulePreviewUpdate"] as (...a: unknown[]) => unknown)(0);
      textarea.focus();
    };
    reader.readAsDataURL(file);
    },
    { signal: composeSig }
  );
  document.querySelector<HTMLInputElement>("#compose-subject")?.addEventListener(
    "input",
    () => {
      (app()["scheduleDraftRevisionSave"] as (...a: unknown[]) => unknown)();
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
        void (app()["applyMarkdownAction"] as (...a: unknown[]) => unknown)("bold");
      } else if (key === "i") {
        evk.preventDefault();
        void (app()["applyMarkdownAction"] as (...a: unknown[]) => unknown)("italic");
      } else if (key === "k") {
        evk.preventDefault();
        void (app()["applyMarkdownAction"] as (...a: unknown[]) => unknown)("link");
      } else if (key === "u") {
        evk.preventDefault();
        void (app()["applyMarkdownAction"] as (...a: unknown[]) => unknown)("underline");
      }
    },
    { signal: composeSig }
  );
  document.querySelectorAll<HTMLButtonElement>("[data-md]").forEach((button) => {
    button.addEventListener(
      "click",
      () => {
        void (app()["applyMarkdownAction"] as (...a: unknown[]) => unknown)(button.dataset.md ?? "");
      },
      { signal: composeSig }
    );
  });
  (app()["bindComposerDropzone"] as (...a: unknown[]) => unknown)();
  document.querySelector<HTMLInputElement>("[data-quick-reply]")?.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      void (app()["sendQuickReply"] as (...a: unknown[]) => unknown)("reply");
    }
  });

  // Account creation helpers.
  document.querySelector<HTMLInputElement>("#account-email")?.addEventListener("input", (event) => {
    const value = (event.currentTarget as HTMLInputElement).value;
    applyDomainPresetIfSafe(value, {
      onApplied(domain, preset) {
        (app()["discoveredServersFormSnapRef"] as { current: unknown }).current = serverSidesFromPreset(preset);
        state.accountMessage = `Préréglage local pour « ${domain} ».`;
        accountFieldTouched.serverFields = false;
        (app()["render"] as (...a: unknown[]) => unknown)();
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

export async function handleAction(action: string, element?: HTMLElement) {
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
        break;
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
      break;
    case "settings":
    case "account":
      (app()["openSettingsView"] as (...a: unknown[]) => unknown)();
      break;
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
      break;
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
          (app()["clearDiscoveredServerSnap"] as (...a: unknown[]) => unknown)();
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
      break;
    }
    case "settings-reload-paths":
      void (app()["refreshSettingsPathsFromBackend"] as (...a: unknown[]) => unknown)();
      break;
    case "text-prompt-confirm": {
      const raw = document.querySelector<HTMLInputElement>("#text-prompt-input")?.value ?? "";
      finishTextPromptModal(raw);
      break;
    }
    case "text-prompt-cancel":
      finishTextPromptModal(null);
      break;
    case "confirm-modal-yes":
      finishConfirmModal(true);
      break;
    case "confirm-modal-no":
      finishConfirmModal(false);
      break;
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
      break;
    }
    case "open-settings-ai-modal": {
      const modal = normalizeSettingsAiModalId(element?.dataset.aiModal);
      if (!modal) break;
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
            state.promptCatalogLoadError = (app()["tauriErrorMessage"] as (...a: unknown[]) => unknown)(e);
          }
          (app()["render"] as (...a: unknown[]) => unknown)();
        })();
      } else if (modal === "semantic") void (app()["refreshSemanticEmbeddingCounts"] as (...a: unknown[]) => unknown)().then(() => (app()["render"] as (...a: unknown[]) => unknown)());
      else if (modal === "engines") void (app()["openEnginesAiSettingsModal"] as (...a: unknown[]) => unknown)();
      else (app()["render"] as (...a: unknown[]) => unknown)();
      break;
    }
    case "close-settings-ai-modal":
      (app()["finalizeSettingsAiModalClose"] as (...a: unknown[]) => unknown)();
      state.settingsAiModal = null;
      (app()["render"] as (...a: unknown[]) => unknown)();
      break;
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
          toast((app()["tauriErrorMessage"] as (...a: unknown[]) => unknown)(e));
        }
      })();
      break;
    }
    case "dismiss-default-account-prompt": {
      try {
        window.localStorage.setItem(DEFAULT_ACCOUNT_PROMPT_DISMISS_KEY, "1");
      } catch {
        /* ignore */
      }
      (app()["render"] as (...a: unknown[]) => unknown)();
      break;
    }
    case "open-settings-default-account":
      state.view = "settings";
      state.settingsTab = "general";
      (app()["render"] as (...a: unknown[]) => unknown)();
      break;
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
        state.appPrefs.general.defaultListFilter = LIST_FILTER_VALUES.includes(lfRaw as State["listFilter"])
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
          await (app()["withTimeout"] as (...a: unknown[]) => unknown)(invoke("set_app_prefs", { prefs: state.appPrefs }), MAIL_ACTION_TIMEOUT_MS);
          toast(t("toast.prefsSaved"));
        } catch (e) {
          toast((app()["tauriErrorMessage"] as (...a: unknown[]) => unknown)(e));
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
      break;
    }
    case "save-ai-prefs":
      void (app()["persistAiPrefsFromDom"] as (...a: unknown[]) => unknown)();
      break;
    case "refresh-llm-runtime-status": {
      void (app()["refreshLlmRuntimeStatus"] as (...a: unknown[]) => unknown)(false).then(() => {
        (app()["render"] as (...a: unknown[]) => unknown)();
        toast("Statut LLM actualisé.");
      });
      break;
    }
    case "refresh-llm-hardware-rescan": {
      void (app()["refreshLlmRuntimeStatus"] as (...a: unknown[]) => unknown)(true).then(() => {
        (app()["render"] as (...a: unknown[]) => unknown)();
        toast("Mémoire de l’ordinateur : nouvelle analyse effectuée.");
      });
      break;
    }
    case "llm-apply-recommended-weights": {
      const st = state.llmRuntimeStatus;
      if (!st?.recommendedRepo?.trim()) {
        toast("Aucune recommandation pour l’instant — essayez « Analyser la mémoire ».");
        break;
      }
      state.appPrefs.ai.localLlmHfRepoId = st.recommendedRepo.trim();
      if (st.recommendedFile?.trim()) {
        state.appPrefs.ai.localLlmGgufFile = st.recommendedFile.trim();
      }
      void (app()["persistAiPrefsFromDom"] as (...a: unknown[]) => unknown)({ silent: true, skipRender: true });
      toast("Modèle recommandé appliqué.");
      (app()["render"] as (...a: unknown[]) => unknown)();
      break;
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
          await (app()["withTimeout"] as (...a: unknown[]) => unknown)(invoke("set_app_prefs", { prefs: state.appPrefs }), MAIL_ACTION_TIMEOUT_MS);
        } catch (e) {
          toast((app()["tauriErrorMessage"] as (...a: unknown[]) => unknown)(e));
          return;
        }
        await (app()["refreshLlmRuntimeStatus"] as (...a: unknown[]) => unknown)(false);
        toast("Configuration recommandée appliquée.");
        (app()["render"] as (...a: unknown[]) => unknown)();
      })();
      break;
    }
    case "ai-engine-mode": {
      const mode = element?.dataset.engineMode?.trim();
      if (mode !== "local" && mode !== "cloud" && mode !== "hybrid") break;
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
            await (app()["withTimeout"] as (...a: unknown[]) => unknown)(invoke("set_app_prefs", { prefs: state.appPrefs }), MAIL_ACTION_TIMEOUT_MS);
          } catch (e) {
            toast((app()["tauriErrorMessage"] as (...a: unknown[]) => unknown)(e));
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
      break;
    }
    case "cancel-llm-prefetch": {
      if (!isTauriRuntime()) break;
      void (async () => {
        try {
          await invoke("cancel_prefetch_llm_model", {});
          toast("Téléchargement du modèle annulé.");
        } catch (e) {
          toast((app()["tauriErrorMessage"] as (...a: unknown[]) => unknown)(e));
        }
      })();
      break;
    }
    case "prefetch-llm-model": {
      if (!isTauriRuntime()) {
        toast("Téléchargement du modèle : ouvrez l’application de bureau (Tauri).");
        break;
      }
      if (state.llmPrefetchInFlight) {
        toast("Un téléchargement est déjà en cours — utilisez Annuler pour l’arrêter.");
        break;
      }
      state.llmPrefetchInFlight = true;
      state.llmPrefetchPercent = 0;
      (app()["paintLlmPrefetchProgressDom"] as (...a: unknown[]) => unknown)();
      (app()["paintStatusBarProgressDom"] as (...a: unknown[]) => unknown)();
      toast("Téléchargement du modèle en arrière-plan — vous pouvez continuer à utiliser l’app.");
      void (async () => {
        try {
          const msg = await (app()["withTimeout"] as (...a: unknown[]) => unknown)(invoke<string>("prefetch_llm_model", {}), 1_800_000);
          toast(msg || "Fichier modèle prêt.");
        } catch (e) {
          const msg = (app()["tauriErrorMessage"] as (...a: unknown[]) => unknown)(e);
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
      break;
    }
    case "prefetch-semantic-minilm": {
      void (async () => {
        if (!isTauriRuntime()) {
          toast("Téléchargement MiniLM : lancez l’app Tauri.");
          return;
        }
        toast("Téléchargement all-MiniLM-L6-v2 (ONNX + tokenizer)…");
        try {
          const msg = await (app()["withTimeout"] as (...a: unknown[]) => unknown)(invoke<string>("prefetch_semantic_minilm_model", {}), 900_000);
          toast(msg);
          try {
            state.semanticModelAvailable = await (app()["withTimeout"] as (...a: unknown[]) => unknown)(invoke<boolean>("semantic_model_available", {}), MAIL_ACTION_TIMEOUT_MS);
          } catch {
            state.semanticModelAvailable = false;
          }
        } catch (e) {
          toast((app()["tauriErrorMessage"] as (...a: unknown[]) => unknown)(e));
        }
        (app()["render"] as (...a: unknown[]) => unknown)();
      })();
      break;
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
          const stats = await (app()["withTimeout"] as (...a: unknown[]) => unknown)(
            invoke<{ indexed: number; skipped: number; errors: number }>("reindex_semantic_account_cmd", {
              accountId: aid,
            }),
            1_800_000
          );
          toast(`Index sémantique : ${stats.indexed} ligne(s), ${stats.errors} erreur(s).`);
          await (app()["searchThreads"] as (...a: unknown[]) => unknown)();
          await (app()["refreshSemanticEmbeddingCounts"] as (...a: unknown[]) => unknown)();
        } catch (e) {
          toast((app()["tauriErrorMessage"] as (...a: unknown[]) => unknown)(e));
        }
      })();
      break;
    }
    case "refresh-semantic-embedding-counts": {
      void (app()["refreshSemanticEmbeddingCounts"] as (...a: unknown[]) => unknown)();
      break;
    }
    case "prefetch-whisper-models": {
      void (async () => {
        if (!isTauriRuntime()) {
          toast("Téléchargement GGML : lancez l’app Tauri.");
          return;
        }
          toast("Téléchargement du GGML Whisper (HF) selon tes réglages…");
        try {
          const msg = await (app()["withTimeout"] as (...a: unknown[]) => unknown)(invoke<string>("prefetch_whisper_dictation_model", {}), 900_000);
          toast(msg);
        } catch (e) {
          toast((app()["tauriErrorMessage"] as (...a: unknown[]) => unknown)(e));
        }
        (app()["render"] as (...a: unknown[]) => unknown)();
      })();
      break;
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
          const res = await (app()["withTimeout"] as (...a: unknown[]) => unknown)(
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
      break;
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
          await (app()["withTimeout"] as (...a: unknown[]) => unknown)(invoke("set_openrouter_api_key", { secret }), MAIL_ACTION_TIMEOUT_MS);
          await (app()["withTimeout"] as (...a: unknown[]) => unknown)(invoke("set_dictation_api_key", { secret }), MAIL_ACTION_TIMEOUT_MS);
          state.openrouterApiKeySet = true;
          state.dictationApiKeySet = true;
          if (inp) inp.value = "";
          toast("Clé cloud enregistrée (OpenRouter + dictée).");
          void (app()["refreshLlmRuntimeStatus"] as (...a: unknown[]) => unknown)(false).then(() => {
            if (state.settingsAiModal === "engines") (app()["render"] as (...a: unknown[]) => unknown)();
          });
        } catch (e) {
          toast((app()["tauriErrorMessage"] as (...a: unknown[]) => unknown)(e));
        }
      })();
      break;
    }
    case "clear-cloud-api-key": {
      void (async () => {
        if (!isTauriRuntime()) {
          toast("Lancez l’app Tauri.");
          return;
        }
        try {
          await (app()["withTimeout"] as (...a: unknown[]) => unknown)(invoke("clear_openrouter_api_key", {}), MAIL_ACTION_TIMEOUT_MS);
          await (app()["withTimeout"] as (...a: unknown[]) => unknown)(invoke("clear_dictation_api_key", {}), MAIL_ACTION_TIMEOUT_MS);
          state.openrouterApiKeySet = false;
          state.dictationApiKeySet = false;
          toast("Clé cloud supprimée.");
          void (app()["refreshLlmRuntimeStatus"] as (...a: unknown[]) => unknown)(false).then(() => {
            if (state.settingsAiModal === "engines") (app()["render"] as (...a: unknown[]) => unknown)();
          });
        } catch (e) {
          toast((app()["tauriErrorMessage"] as (...a: unknown[]) => unknown)(e));
        }
      })();
      break;
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
          await (app()["withTimeout"] as (...a: unknown[]) => unknown)(invoke("set_dictation_api_key", { secret }), MAIL_ACTION_TIMEOUT_MS);
          state.dictationApiKeySet = true;
          if (inp) inp.value = "";
          toast("Clé API enregistrée dans le trousseau.");
        } catch (e) {
          toast((app()["tauriErrorMessage"] as (...a: unknown[]) => unknown)(e));
        }
        (app()["render"] as (...a: unknown[]) => unknown)();
      })();
      break;
    }
    case "clear-dictation-api-key": {
      void (async () => {
        if (!isTauriRuntime()) {
          toast("Lancez l’app Tauri.");
          return;
        }
        try {
          await (app()["withTimeout"] as (...a: unknown[]) => unknown)(invoke("clear_dictation_api_key", {}), MAIL_ACTION_TIMEOUT_MS);
          state.dictationApiKeySet = false;
          toast("Clé API supprimée du trousseau.");
        } catch (e) {
          toast((app()["tauriErrorMessage"] as (...a: unknown[]) => unknown)(e));
        }
        (app()["render"] as (...a: unknown[]) => unknown)();
      })();
      break;
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
          await (app()["withTimeout"] as (...a: unknown[]) => unknown)(invoke("set_openrouter_api_key", { secret }), MAIL_ACTION_TIMEOUT_MS);
          state.openrouterApiKeySet = true;
          if (inp) inp.value = "";
          toast("Clé OpenRouter enregistrée dans le trousseau.");
          void (app()["refreshLlmRuntimeStatus"] as (...a: unknown[]) => unknown)(false).then(() => (app()["render"] as (...a: unknown[]) => unknown)());
        } catch (e) {
          toast((app()["tauriErrorMessage"] as (...a: unknown[]) => unknown)(e));
        }
        (app()["render"] as (...a: unknown[]) => unknown)();
      })();
      break;
    }
    case "clear-openrouter-api-key": {
      void (async () => {
        if (!isTauriRuntime()) {
          toast("Lancez l’app Tauri.");
          return;
        }
        try {
          await (app()["withTimeout"] as (...a: unknown[]) => unknown)(invoke("clear_openrouter_api_key", {}), MAIL_ACTION_TIMEOUT_MS);
          state.openrouterApiKeySet = false;
          toast("Clé OpenRouter supprimée du trousseau.");
          void (app()["refreshLlmRuntimeStatus"] as (...a: unknown[]) => unknown)(false).then(() => (app()["render"] as (...a: unknown[]) => unknown)());
        } catch (e) {
          toast((app()["tauriErrorMessage"] as (...a: unknown[]) => unknown)(e));
        }
        (app()["render"] as (...a: unknown[]) => unknown)();
      })();
      break;
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
          await (app()["withTimeout"] as (...a: unknown[]) => unknown)(invoke("set_llama_server_api_key", { secret }), MAIL_ACTION_TIMEOUT_MS);
          state.llamaServerApiKeySet = true;
          if (inp) inp.value = "";
          toast("Clé llama-server enregistrée dans le trousseau.");
          void (app()["refreshLlmRuntimeStatus"] as (...a: unknown[]) => unknown)(false).then(() => (app()["render"] as (...a: unknown[]) => unknown)());
        } catch (e) {
          toast((app()["tauriErrorMessage"] as (...a: unknown[]) => unknown)(e));
        }
        (app()["render"] as (...a: unknown[]) => unknown)();
      })();
      break;
    }
    case "clear-llama-server-api-key": {
      void (async () => {
        if (!isTauriRuntime()) {
          toast("Lancez l’app Tauri.");
          return;
        }
        try {
          await (app()["withTimeout"] as (...a: unknown[]) => unknown)(invoke("clear_llama_server_api_key", {}), MAIL_ACTION_TIMEOUT_MS);
          state.llamaServerApiKeySet = false;
          toast("Clé llama-server supprimée du trousseau.");
          void (app()["refreshLlmRuntimeStatus"] as (...a: unknown[]) => unknown)(false).then(() => (app()["render"] as (...a: unknown[]) => unknown)());
        } catch (e) {
          toast((app()["tauriErrorMessage"] as (...a: unknown[]) => unknown)(e));
        }
        (app()["render"] as (...a: unknown[]) => unknown)();
      })();
      break;
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
          toast((app()["tauriErrorMessage"] as (...a: unknown[]) => unknown)(e));
        }
      })();
      break;
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
          toast((app()["tauriErrorMessage"] as (...a: unknown[]) => unknown)(e));
        }
        (app()["render"] as (...a: unknown[]) => unknown)();
      })();
      break;
    }
    case "pick-llama-server-binary-path": {
      void (async () => {
        if (!isTauriRuntime()) {
          toast("Parcourir : lancez l’app Tauri.");
          return;
        }
        try {
          const picked = await (app()["withTimeout"] as (...a: unknown[]) => unknown)(
            invoke<string | null>("pick_llama_server_binary_path", {}),
            MAIL_ACTION_TIMEOUT_MS
          );
          if (!picked?.trim()) {
            toast("Aucun fichier sélectionné.");
            return;
          }
          state.appPrefs.ai.llamaServerBinaryPath = picked.trim();
          await (app()["withTimeout"] as (...a: unknown[]) => unknown)(invoke("set_app_prefs", { prefs: state.appPrefs }), MAIL_ACTION_TIMEOUT_MS);
          toast("Chemin llama-server enregistré.");
          void (app()["refreshLlmRuntimeStatus"] as (...a: unknown[]) => unknown)(false).then(() => (app()["render"] as (...a: unknown[]) => unknown)());
        } catch (e) {
          toast((app()["tauriErrorMessage"] as (...a: unknown[]) => unknown)(e));
        }
        (app()["render"] as (...a: unknown[]) => unknown)();
      })();
      break;
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
          await (app()["withTimeout"] as (...a: unknown[]) => unknown)(invoke("add_newsletter_rule", { input: raw }), MAIL_ACTION_TIMEOUT_MS);
          await (app()["loadNewsletterRules"] as (...a: unknown[]) => unknown)();
          const inp = document.querySelector<HTMLInputElement>("#newsletter-domain-input");
          if (inp) inp.value = "";
          toast("Règle enregistrée.");
          (app()["render"] as (...a: unknown[]) => unknown)();
        } catch (error) {
          toast((app()["tauriErrorMessage"] as (...a: unknown[]) => unknown)(error));
        }
      })();
      break;
    }
    case "newsletter-domain-remove": {
      const dom = (app()["readNlButtonRule"] as (...a: unknown[]) => unknown)(element);
      if (!dom) {
        toast("Règle invalide ou manquante.");
        break;
      }
      void (async () => {
        if (!isTauriRuntime()) {
          toast("Suppression des règles : lancez l’app bureau Tauri.");
          return;
        }
        try {
          await (app()["withTimeout"] as (...a: unknown[]) => unknown)(invoke("remove_newsletter_rule", { input: dom }), MAIL_ACTION_TIMEOUT_MS);
          await (app()["loadNewsletterRules"] as (...a: unknown[]) => unknown)();
          toast("Règle supprimée.");
          (app()["render"] as (...a: unknown[]) => unknown)();
        } catch (error) {
          toast((app()["tauriErrorMessage"] as (...a: unknown[]) => unknown)(error));
        }
      })();
      break;
    }
    case "newsletter-msg-add-rule": {
      const raw = (app()["readNlButtonRule"] as (...a: unknown[]) => unknown)(element);
      const rule = (app()["normalizeNlRuleInvokeInput"] as (...a: unknown[]) => unknown)(raw);
      if (!rule) {
        toast("Impossible de lire l’adresse (data-rule vide). Réouvrez le fil ou utilisez les paramètres.");
        break;
      }
      if (!rule.includes("@")) {
        toast("Pour ajouter depuis un message, l’expéditeur doit être une adresse e-mail (avec @).");
        break;
      }
      void (async () => {
        if (!isTauriRuntime()) {
          toast("Ajout depuis un message : lancez l’app bureau Tauri.");
          return;
        }
        try {
          await (app()["withTimeout"] as (...a: unknown[]) => unknown)(invoke("add_newsletter_rule", { input: rule }), MAIL_ACTION_TIMEOUT_MS);
          await (app()["loadNewsletterRules"] as (...a: unknown[]) => unknown)();
          if (state.selectedThreadId) {
            const tid = state.selectedThreadId;
            const refreshed = await (app()["fetchOpenThreadOrNotify"] as (...a: unknown[]) => unknown)(tid);
            if (refreshed) state.selectedThread = refreshed;
          }
          toast(`Règle ajoutée : ${rule}`);
          (app()["render"] as (...a: unknown[]) => unknown)();
        } catch (error) {
          toast((app()["tauriErrorMessage"] as (...a: unknown[]) => unknown)(error));
        }
      })();
      break;
    }
    case "newsletter-msg-remove-rule": {
      const dom = (app()["readNlButtonRule"] as (...a: unknown[]) => unknown)(element);
      if (!dom) {
        toast("Règle invalide ou manquante.");
        break;
      }
      void (async () => {
        if (!isTauriRuntime()) {
          toast("Retrait de règle : lancez l’app bureau Tauri.");
          return;
        }
        try {
          await (app()["withTimeout"] as (...a: unknown[]) => unknown)(invoke("remove_newsletter_rule", { input: dom }), MAIL_ACTION_TIMEOUT_MS);
          await (app()["loadNewsletterRules"] as (...a: unknown[]) => unknown)();
          if (state.selectedThreadId) {
            const tid = state.selectedThreadId;
            const refreshed = await (app()["fetchOpenThreadOrNotify"] as (...a: unknown[]) => unknown)(tid);
            if (refreshed) state.selectedThread = refreshed;
          }
          toast(`Règle retirée : ${dom}`);
          (app()["render"] as (...a: unknown[]) => unknown)();
        } catch (error) {
          toast((app()["tauriErrorMessage"] as (...a: unknown[]) => unknown)(error));
        }
      })();
      break;
    }
    case "settings-select-account": {
      const id = element?.dataset.accountId?.trim();
      if (!id) break;
      skipAccountIdentityCaptureOnce = true;
      (app()["clearDiscoveredServerSnap"] as (...a: unknown[]) => unknown)();
      state.settingsSelectedAccountId = id;
      accountFieldTouched.serverFields = false;
      state.accountServersPanelOpen = true;
      state.oauthLockedEmail = null;
      state.accountFormOAuthPrefill = null;
      (app()["resetNewAccountSetupState"] as (...a: unknown[]) => unknown)();
      (app()["render"] as (...a: unknown[]) => unknown)();
      break;
    }
    case "settings-new-account":
      skipAccountIdentityCaptureOnce = true;
      (app()["clearDiscoveredServerSnap"] as (...a: unknown[]) => unknown)();
      state.settingsSelectedAccountId = "new";
      accountFieldTouched.serverFields = false;
      (app()["resetNewAccountSetupState"] as (...a: unknown[]) => unknown)();
      (app()["render"] as (...a: unknown[]) => unknown)();
      break;
    case "discover-mail-servers":
      void (app()["discoverMailServersAction"] as (...a: unknown[]) => unknown)();
      break;
    case "account-toggle-servers":
      state.accountServersPanelOpen = !state.accountServersPanelOpen;
      (app()["render"] as (...a: unknown[]) => unknown)();
      break;
    case "oauth-google-connect": {
      void (async () => {
        if (!isTauriRuntime()) {
          toast("OAuth2 : lancez l’application bureau Tauri.");
          return;
        }
        try {
          const o = await (app()["withTimeout"] as (...a: unknown[]) => unknown)(
            invoke<OAuthDesktopLoginOutcome>("oauth_google_desktop_login_cmd", {}),
            OAUTH_DESKTOP_LOGIN_TIMEOUT_MS,
          );
          (app()["warnOAuthEphemeralRedirect"] as (...a: unknown[]) => unknown)(o);
          const email = (o.email ?? "").trim();
          if (!email.includes("@")) {
            toast("OAuth Google : adresse e-mail absente ou invalide.");
            return;
          }
          skipAccountIdentityCaptureOnce = true;
          await (app()["finishOAuthNewAccountAfterLogin"] as (...a: unknown[]) => unknown)("oauthGoogle", email, (o.displayName ?? "").trim());
        } catch (e) {
          toast((app()["tauriErrorMessage"] as (...a: unknown[]) => unknown)(e));
        }
      })();
      break;
    }
    case "oauth-microsoft-connect": {
      void (async () => {
        if (!isTauriRuntime()) {
          toast("OAuth2 : lancez l’application bureau Tauri.");
          return;
        }
        try {
          const o = await (app()["withTimeout"] as (...a: unknown[]) => unknown)(
            invoke<OAuthDesktopLoginOutcome>("oauth_microsoft_desktop_login_cmd", {}),
            OAUTH_DESKTOP_LOGIN_TIMEOUT_MS,
          );
          (app()["warnOAuthEphemeralRedirect"] as (...a: unknown[]) => unknown)(o);
          const email = (o.email ?? "").trim();
          if (!email.includes("@")) {
            toast("OAuth Microsoft : adresse e-mail absente ou invalide.");
            return;
          }
          skipAccountIdentityCaptureOnce = true;
          await (app()["finishOAuthNewAccountAfterLogin"] as (...a: unknown[]) => unknown)("oauthMicrosoft", email, (o.displayName ?? "").trim());
        } catch (e) {
          toast((app()["tauriErrorMessage"] as (...a: unknown[]) => unknown)(e));
        }
      })();
      break;
    }
    case "account-auth-password-mode":
      (app()["clearAccountOAuthWizard"] as (...a: unknown[]) => unknown)();
      state.accountPasswordSetupExpanded = true;
      state.accountFormAuthKind = "password";
      state.oauthLockedEmail = null;
      state.accountFormOAuthPrefill = null;
      state.accountServersPanelOpen = false;
      (app()["render"] as (...a: unknown[]) => unknown)();
      break;
    case "oauth-wizard-retry": {
      const retry = state.accountOAuthWizardRetry;
      if (!retry || (retry.authKind !== "oauthGoogle" && retry.authKind !== "oauthMicrosoft")) break;
      (app()["clearAccountOAuthWizard"] as (...a: unknown[]) => unknown)();
      void (app()["finishOAuthNewAccountAfterLogin"] as (...a: unknown[]) => unknown)(retry.authKind, retry.email, retry.displayName);
      break;
    }
    case "delete-settings-account":
      void (app()["deleteSettingsAccount"] as (...a: unknown[]) => unknown)();
      break;
    case "back":
    case "nav-back":
      void (app()["goBack"] as (...a: unknown[]) => unknown)();
      break;
    case "nav-crumb": {
      const raw = element?.dataset.navIndex ?? "";
      const idx = Number.parseInt(raw, 10);
      if (Number.isNaN(idx)) break;
      void (app()["navigateToBreadcrumbIndex"] as (...a: unknown[]) => unknown)(idx);
      break;
    }
    case "nav-inbox":
      (app()["navigateToInbox"] as (...a: unknown[]) => unknown)();
      break;
    case "toggle-ai-quick-panel":
      state.aiQuickPanelOpen = !state.aiQuickPanelOpen;
      (app()["render"] as (...a: unknown[]) => unknown)();
      break;
    case "toggle-thread-quick-reply": {
      state.threadQuickReplyOpen = !state.threadQuickReplyOpen;
      (app()["render"] as (...a: unknown[]) => unknown)();
      if (state.threadQuickReplyOpen) {
        window.setTimeout(() => {
          document.querySelector<HTMLInputElement>("[data-quick-reply]")?.focus();
        }, 340);
      }
      break;
    }
    case "ai-features-all-on":
      setAllAiFeatures(state.appPrefs.ai, true);
      state.appPrefs.ai = normalizeAiPrefsMerged(state.appPrefs.ai);
      void (async () => {
        try {
          await (app()["persistAiFeaturePrefs"] as (...a: unknown[]) => unknown)();
          toast("Toutes les fonctionnalités IA activées.");
        } catch (e) {
          toast((app()["tauriErrorMessage"] as (...a: unknown[]) => unknown)(e));
        }
        (app()["render"] as (...a: unknown[]) => unknown)();
      })();
      break;
    case "ai-features-all-off":
      setAllAiFeatures(state.appPrefs.ai, false);
      state.appPrefs.ai = normalizeAiPrefsMerged(state.appPrefs.ai);
      void (async () => {
        try {
          await (app()["persistAiFeaturePrefs"] as (...a: unknown[]) => unknown)();
          toast("Toutes les fonctionnalités IA désactivées.");
        } catch (e) {
          toast((app()["tauriErrorMessage"] as (...a: unknown[]) => unknown)(e));
        }
        (app()["render"] as (...a: unknown[]) => unknown)();
      })();
      break;
    case "toggle-ai": {
      if (mailboxDigestSlotInList()) {
        dismissMailboxDigestPanel();
        break;
      }
      if (state.aiOpen) state.aiOpen = false;
      else if (state.view === "thread" || state.view === "list") state.aiOpen = true;
      (app()["render"] as (...a: unknown[]) => unknown)();
      break;
    }
    case "open-quote-fold": {
      const mid = element?.dataset.msgId?.trim();
      if (!mid || !state.selectedThread) break;
      const msg = state.selectedThread.messages.find((x) => x.messageId === mid);
      const raw = msg?.collapsedQuotes ?? [];
      if (!raw.length) break;
      const merged = (app()["groupCollapsedQuotesByAttribution"] as (...a: unknown[]) => unknown)(raw);
      if (!merged.length) break;
      state.quoteFoldModal = {
        senderLabel: (msg?.sender ?? "").trim() || mid,
        blocks: merged,
        foldedLines: raw.length
      };
      (app()["render"] as (...a: unknown[]) => unknown)();
      break;
    }
    case "close-quote-fold":
      state.quoteFoldModal = null;
      (app()["render"] as (...a: unknown[]) => unknown)();
      break;
    case "open-thread-tags":
      if (state.view === "thread" && state.selectedThread) {
        state.threadTagsModalOpen = !state.threadTagsModalOpen;
        (app()["render"] as (...a: unknown[]) => unknown)();
      }
      break;
    case "close-thread-tags":
      state.threadTagsModalOpen = false;
      (app()["render"] as (...a: unknown[]) => unknown)();
      break;
    case "search-from-tag": {
      const family = element?.dataset.tagFamily?.trim();
      const value = element?.dataset.tagValue?.trim();
      if (!family || !value) break;
      (app()["launchTagMailSearch"] as (...a: unknown[]) => unknown)({ family: (app()["tagFamilyForInvoke"] as (...a: unknown[]) => unknown)(family), value });
      break;
    }
    case "close-image-modal":
      if (state.imageModal?.revokeObjectUrl) URL.revokeObjectURL(state.imageModal.revokeObjectUrl);
      state.imageModal = null;
      (app()["render"] as (...a: unknown[]) => unknown)();
      break;
    case "toggle-message-view":
      if (!ENABLE_CLEAN_MESSAGE_VIEW) return;
      state.messageViewMode = state.messageViewMode === "clean" ? "original" : "clean";
      (app()["render"] as (...a: unknown[]) => unknown)();
      break;
    case "reply":
      await (app()["prepareReply"] as (...a: unknown[]) => unknown)();
      break;
    case "reply-one":
      await (app()["prepareReplyToMessage"] as (...a: unknown[]) => unknown)(element?.dataset.msgId ?? "");
      break;
    case "reply-all":
      await (app()["prepareReplyAll"] as (...a: unknown[]) => unknown)();
      break;
    case "forward":
      await (app()["prepareForward"] as (...a: unknown[]) => unknown)();
      break;
    case "forward-one":
      await (app()["prepareForwardToMessage"] as (...a: unknown[]) => unknown)(element?.dataset.msgId ?? "");
      break;
    case "download-all-attachments": {
      const mid = element?.dataset.msgId?.trim();
      if (mid) void (app()["downloadAllAttachmentsForMessage"] as (...a: unknown[]) => unknown)(mid);
      break;
    }
    case "contacts-entity-open": {
      const href = element?.dataset.href?.trim();
      if (href) void (app()["openExternalFromMailHref"] as (...a: unknown[]) => unknown)(href);
      break;
    }
    case "contacts-entity-mailto": {
      const email = element?.dataset.email?.trim();
      if (email) void (app()["openExternalFromMailHref"] as (...a: unknown[]) => unknown)(`mailto:${email}`);
      break;
    }
    case "mail-unsubscribe-open": {
      const href = (app()["decodeHtmlEntitiesLoose"] as (...a: unknown[]) => unknown)(element?.dataset.href?.trim() ?? "");
      const normalized = (app()["normalizeMailHrefForOpen"] as (...a: unknown[]) => unknown)(href);
      if (normalized) void (app()["openExternalFromMailHref"] as (...a: unknown[]) => unknown)(normalized);
      else toast("Lien de désabonnement invalide.");
      break;
    }
    case "security-mark-newsletter": {
      const email = element?.dataset.senderEmail?.trim() ?? "";
      if (!email.includes("@") || !isTauriRuntime()) break;
      void (async () => {
        try {
          await (app()["withTimeout"] as (...a: unknown[]) => unknown)(invoke("add_newsletter_rule", { input: email }), MAIL_ACTION_TIMEOUT_MS);
          await (app()["loadNewsletterRules"] as (...a: unknown[]) => unknown)();
          toast(t("toast.newsletterRuleAdded"));
          (app()["render"] as (...a: unknown[]) => unknown)();
        } catch (e) {
          toast((app()["tauriErrorMessage"] as (...a: unknown[]) => unknown)(e));
        }
      })();
      break;
    }
    case "security-move-junk": {
      const tid = element?.dataset.threadId?.trim() ?? "";
      const source = element?.dataset.sourceMailbox?.trim() || state.selectedMailbox || "INBOX";
      if (!tid || !isTauriRuntime()) break;
      void (async () => {
        const spam = state.mailboxes.find((m) => mailboxKind(m) === "spam");
        if (!spam) {
          toast(t("toast.junkFolderMissing"));
          return;
        }
        const account = (app()["currentAccount"] as (...a: unknown[]) => unknown)();
        if (!account?.id) return;
        try {
          markThreadsRecentlyRemoved([tid]);
          await (app()["withTimeout"] as (...a: unknown[]) => unknown)(
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
          await (app()["loadMailboxUnread"] as (...a: unknown[]) => unknown)();
          (app()["render"] as (...a: unknown[]) => unknown)();
        } catch (e) {
          clearThreadsRecentlyRemoved([tid]);
          toast((app()["tauriErrorMessage"] as (...a: unknown[]) => unknown)(e));
        }
      })();
      break;
    }
    case "security-filter-search": {
      state.searchDraft = ((state.searchDraft || "") + " #security:50").trim();
      state.searchModalOpen = true;
      toast("Filtre #security:50 ajouté — lancez la recherche.");
      (app()["render"] as (...a: unknown[]) => unknown)();
      break;
    }
    case "close-compose":
      void (app()["finalizeCloseComposeFromUser"] as (...a: unknown[]) => unknown)();
      break;
    case "close-close-compose-modal":
      state.closeComposeModal = null;
      (app()["render"] as (...a: unknown[]) => unknown)();
      break;
    case "close-compose-without-saving":
      void (async () => {
        state.closeComposeModal = null;
        (app()["render"] as (...a: unknown[]) => unknown)();
        await (app()["discardCurrentDraftSession"] as (...a: unknown[]) => unknown)();
        await (app()["leaveComposeViewAfterClose"] as (...a: unknown[]) => unknown)();
      })();
      break;
    case "save-and-close-compose": {
      void (async () => {
        state.closeComposeModal = null;
        (app()["render"] as (...a: unknown[]) => unknown)();
        const ok = await (app()["saveDraftToSavedListNow"] as (...a: unknown[]) => unknown)({ silentToast: true });
        if (ok) {
          toast("Conservé dans « Sauvés », compositeur fermé.");
          (app()["clearDraftSession"] as (...a: unknown[]) => unknown)();
          await (app()["leaveComposeViewAfterClose"] as (...a: unknown[]) => unknown)();
        }
      })();
      break;
    }
    case "close-resume-draft-modal":
      state.resumeDraftModal = null;
      (app()["render"] as (...a: unknown[]) => unknown)();
      break;
    case "resume-orphan-draft": {
      const sid = element?.dataset.sessionId ?? "";
      void (app()["resumeOrphanDraftSession"] as (...a: unknown[]) => unknown)(sid);
      break;
    }
    case "dismiss-orphan-draft": {
      const sid = element?.dataset.sessionId ?? "";
      void (app()["dismissOrphanDraftSession"] as (...a: unknown[]) => unknown)(sid);
      break;
    }
    case "toggle-sidebar":
      if (state.view === "compose") break;
      state.sidebarCollapsed = !state.sidebarCollapsed;
      (app()["writeSidebarCollapsedPreference"] as (...a: unknown[]) => unknown)(state.sidebarCollapsed);
      (app()["render"] as (...a: unknown[]) => unknown)();
      break;
    case "leave-saved-drafts-mailbox":
      void (async () => {
        await (app()["switchMailbox"] as (...a: unknown[]) => unknown)((app()["pickImapMailboxFallback"] as (...a: unknown[]) => unknown)());
      })();
      break;
    case "refresh-draft-history":
      void (app()["refreshDraftRevisions"] as (...a: unknown[]) => unknown)(60);
      break;
    case "toggle-draft-versions-expanded":
      if (!isTauriRuntime()) break;
      state.draftVersionsListExpanded = !state.draftVersionsListExpanded;
      (app()["render"] as (...a: unknown[]) => unknown)();
      break;
    case "compare-draft-revision": {
      const revisionId = element?.dataset.revisionId?.trim() ?? "";
      if (!revisionId) break;
      void (app()["computeDraftDiffAgainstRevision"] as (...a: unknown[]) => unknown)(revisionId);
      break;
    }
    case "toggle-draft-compare-view":
      state.draftDiffView = state.draftDiffView === "preview" ? "diff" : "preview";
      (app()["render"] as (...a: unknown[]) => unknown)();
      break;
    case "restore-draft-revision": {
      if (!isTauriRuntime()) break;
      const revisionId = element?.dataset.revisionId?.trim() ?? "";
      const accountId = (app()["currentAccount"] as (...a: unknown[]) => unknown)()?.id?.trim() ?? "";
      if (!revisionId || !accountId) break;
      void (async () => {
        const ok = await openConfirmModal({
          title: "Restaurer cette version ?",
          body: "Le contenu actuel du compositeur sera remplacé par cette révision.",
          confirmLabel: "Restaurer",
        });
        if (!ok) return;
        try {
          const wasHistoriqueLayout = state.composeLayout === "historique";
          const restored = await (app()["withTimeout"] as (...a: unknown[]) => unknown)(
            invoke<Draft | null>("draft_revision_restore", { accountId, revisionId }),
            MAIL_ACTION_TIMEOUT_MS
          );
          if (!restored) {
            toast("Cette version n’existe plus.");
            return;
          }
          state.draft = restored;
          (app()["loadComposeMarkdownIntoEditor"] as (...a: unknown[]) => unknown)(restored.markdownBody);
          (app()["enterComposeView"] as (...a: unknown[]) => unknown)({ skipHistory: true });
          state.composeLayout = wasHistoriqueLayout ? "historique" : "split";
          (app()["syncPreviewOpenFromComposeLayout"] as (...a: unknown[]) => unknown)();
          (app()["resetMarkdownEditorHistory"] as (...a: unknown[]) => unknown)();
          (app()["render"] as (...a: unknown[]) => unknown)();
          if (wasHistoriqueLayout) {
            void (app()["refreshDraftRevisions"] as (...a: unknown[]) => unknown)(60);
            void (app()["computeDraftDiffAgainstRevision"] as (...a: unknown[]) => unknown)(revisionId);
          } else {
            window.setTimeout(() => void (app()["computePreview"] as (...a: unknown[]) => unknown)(), 0);
          }
          (app()["scheduleDraftRevisionSave"] as (...a: unknown[]) => unknown)(450);
        } catch (error) {
          console.error("draft_revision_restore", error);
          toast(`Restauration impossible: ${(app()["tauriErrorMessage"] as (...a: unknown[]) => unknown)(error)}`);
        }
      })();
      break;
    }
    case "toggle-preview":
      await (app()["cycleComposeLayout"] as (...a: unknown[]) => unknown)();
      break;
    case "set-compose-layout": {
      const raw = element?.dataset.composeLayout?.trim();
      if (raw !== "split" && raw !== "write" && raw !== "preview" && raw !== "historique") break;
      if (raw === "historique" && !isTauriRuntime()) break;
      state.composeLayout = raw;
      (app()["syncPreviewOpenFromComposeLayout"] as (...a: unknown[]) => unknown)();
      (app()["render"] as (...a: unknown[]) => unknown)();
      if (raw === "historique") void (app()["refreshDraftRevisions"] as (...a: unknown[]) => unknown)(60);
      if (state.composeLayout !== "write" && state.composeLayout !== "historique") {
        window.setTimeout(() => void (app()["computePreview"] as (...a: unknown[]) => unknown)(), 0);
      }
      break;
    }
    case "toggle-compose-advanced":
      state.composeAdvancedOpen = !state.composeAdvancedOpen;
      (app()["render"] as (...a: unknown[]) => unknown)();
      break;
    case "toggle-compose-cc-bcc": {
      if ((app()["draftHasRecipientsExtra"] as (...a: unknown[]) => unknown)(state.draft)) break;
      state.composeCcBccOpen = !state.composeCcBccOpen;
      (app()["render"] as (...a: unknown[]) => unknown)();
      break;
    }
    case "send":
      await (app()["sendDraft"] as (...a: unknown[]) => unknown)();
      break;
    case "cancel-split-send":
      state.splitSendConfirm = null;
      state.composeMessage = "";
      (app()["render"] as (...a: unknown[]) => unknown)();
      break;
    case "confirm-split-send":
      void (app()["confirmAndExecuteSplitSend"] as (...a: unknown[]) => unknown)();
      break;
    case "pick-attachments":
      await (app()["pickAttachments"] as (...a: unknown[]) => unknown)();
      break;
    case "clear-attachments":
      (app()["clearAttachments"] as (...a: unknown[]) => unknown)();
      break;
    case "remove-attachment":
      (app()["removeAttachment"] as (...a: unknown[]) => unknown)(element?.dataset.path ?? "");
      break;
    case "quick-reply-send":
      await (app()["sendQuickReply"] as (...a: unknown[]) => unknown)("reply");
      break;
    case "quick-reply-send-all":
      await (app()["sendQuickReply"] as (...a: unknown[]) => unknown)("reply-all");
      break;
    case "quick-reply-compose": {
      const qrRaw = element?.dataset.qrIndex;
      if (qrRaw !== undefined && qrRaw !== "") {
        const idx = Number(qrRaw);
        const s = state.quickReplySuggestions[idx];
        if (!s?.text) break;
        state.composeGrammarSuggestions = null;
        await (app()["prepareReply"] as (...a: unknown[]) => unknown)();
        const add = `${s.text.trim()}\n\n`;
        state.composeBody = `${add}${state.composeBody}`;
        state.composeCanonicalBody = state.composeBody;
        const ta = document.querySelector<HTMLTextAreaElement>("#compose-body");
        if (ta) ta.value = state.composeBody;
        void (app()["computePreview"] as (...a: unknown[]) => unknown)();
        toast("Texte inséré dans le compositeur.");
        (app()["render"] as (...a: unknown[]) => unknown)();
      } else {
        await (app()["prepareReply"] as (...a: unknown[]) => unknown)();
      }
      break;
    }
    case "summarize":
      await (app()["summarizeThread"] as (...a: unknown[]) => unknown)();
      break;
    case "llm-translate-thread":
      void (app()["llmTranslateThreadUi"] as (...a: unknown[]) => unknown)();
      break;
    case "llm-translate-message": {
      const mid = element?.dataset.msgId?.trim();
      if (mid) void (app()["llmTranslateMessageUi"] as (...a: unknown[]) => unknown)(mid, element?.dataset.llmTranslateRefresh === "1");
      break;
    }
    case "llm-quick-replies-thread":
      void (app()["llmQuickRepliesThreadUi"] as (...a: unknown[]) => unknown)();
      break;
    case "llm-inbox-digest":
      void (app()["llmInboxDigestUi"] as (...a: unknown[]) => unknown)();
      break;
    case "demo-reset-playground": {
      if (!isTauriRuntime()) {
        toast("Démo : lance l’app via Tauri (`npm run tauri:dev`), pas le navigateur seul.");
        break;
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
          await (app()["loadMailView"] as (...a: unknown[]) => unknown)(false);
          await (app()["loadMailboxUnread"] as (...a: unknown[]) => unknown)();
        }
        (app()["render"] as (...a: unknown[]) => unknown)();
      } catch (e) {
        console.error("demo_reset_playground_mailbox", e);
        toast((app()["tauriErrorMessage"] as (...a: unknown[]) => unknown)(e));
      }
      break;
    }
    case "demo-remove-playground": {
      if (!isTauriRuntime()) {
        toast("Démo : lance l’app via Tauri (`npm run tauri:dev`), pas le navigateur seul.");
        break;
      }
      const confirmed = await openConfirmModal({
        title: "Supprimer la boîte démo ?",
        body:
          "Le compte playground@demo.rustymail.app et toutes ses données locales seront effacés (messages, cache, index sémantique pour ce compte, mot de passe factice dans le trousseau). Vous pourrez ensuite configurer un compte IMAP réel dans Paramètres → Comptes. Les modèles IA téléchargés (MiniLM, GGUF) restent sur disque.",
        danger: true,
        confirmLabel: "Supprimer la démo",
      });
      if (!confirmed) break;
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
          await (app()["loadMailView"] as (...a: unknown[]) => unknown)(false);
          await (app()["loadMailboxUnread"] as (...a: unknown[]) => unknown)();
        } else {
          state.view = "settings";
          state.settingsTab = "accounts";
        }
        (app()["render"] as (...a: unknown[]) => unknown)();
      } catch (e) {
        console.error("demo_remove_playground_mailbox", e);
        toast((app()["tauriErrorMessage"] as (...a: unknown[]) => unknown)(e));
      }
      break;
    }
    case "toggle-mailbox-digest-panel":
      if (mailboxDigestSlotInList()) {
        dismissMailboxDigestPanel();
      } else {
        void (app()["llmInboxDigestUi"] as (...a: unknown[]) => unknown)();
      }
      break;
    case "compose-ai-rewrite": {
      const st = element?.dataset.rewriteStyle ?? "Formal";
      void (app()["composeAiRewrite"] as (...a: unknown[]) => unknown)(st);
      break;
    }
    case "compose-ai-rewrite-selected-tone":
      void (app()["composeAiRewrite"] as (...a: unknown[]) => unknown)(composeRewriteStyleFromTone());
      break;
    case "compose-ai-grammar":
      void (app()["composeAiGrammar"] as (...a: unknown[]) => unknown)();
      break;
    case "compose-grammar-dismiss":
      state.composeGrammarSuggestions = null;
      (app()["render"] as (...a: unknown[]) => unknown)();
      break;
    case "compose-grammar-apply": {
      const gi = Number(element?.dataset.grammarI ?? "");
      const g = state.composeGrammarSuggestions?.[gi];
      if (!g) break;
      const ta = document.querySelector<HTMLTextAreaElement>("#compose-body");
      const src = ta?.value ?? state.composeBody;
      const o = g.original ?? "";
      const r = g.replacement ?? "";
      if (!o) break;
      const next = src.replace(o, r);
      state.composeBody = next;
      state.composeCanonicalBody = next;
      if (ta) ta.value = next;
      void (app()["computePreview"] as (...a: unknown[]) => unknown)();
      toast("Remplacement appliqué (première occurrence).");
      (app()["render"] as (...a: unknown[]) => unknown)();
      break;
    }
    case "open-search-modal":
      (app()["openSearchModal"] as (...a: unknown[]) => unknown)();
      break;
    case "close-search-modal":
      (app()["closeSearchModal"] as (...a: unknown[]) => unknown)();
      break;
    case "search-modal-commit":
      (app()["commitSearchQuery"] as (...a: unknown[]) => unknown)({ fromModal: true });
      break;
    case "search-nl-assist":
      void (app()["searchNlAssist"] as (...a: unknown[]) => unknown)();
      break;
    case "llm-cancel-job":
      (app()["cancelLlmQueueJob"] as (...a: unknown[]) => unknown)();
      toast("Annulation demandée…");
      break;
    case "llm-qa-thread":
      void (app()["llmQaThreadUi"] as (...a: unknown[]) => unknown)();
      break;
    case "llm-qa-clear":
      state.threadQaAnswer = null;
      state.threadQaStreamText = "";
      (app()["render"] as (...a: unknown[]) => unknown)();
      break;
    case "qa-open-message": {
      const mid = element?.dataset.msgId?.trim();
      if (mid) (app()["scrollToThreadMessage"] as (...a: unknown[]) => unknown)(mid);
      break;
    }
    case "address-book-refresh":
      void (app()["refreshAddressBookList"] as (...a: unknown[]) => unknown)().then(() => (app()["render"] as (...a: unknown[]) => unknown)());
      break;
    case "reindex-address-book": {
      void (async () => {
        const acc = (app()["currentAccount"] as (...a: unknown[]) => unknown)();
        if (!acc?.id || !isTauriRuntime()) {
          toast("Réindexation : compte ou Tauri requis.");
          return;
        }
        try {
          const res = await invoke<{ messagesProcessed: number }>("reindex_address_contacts_cmd", {
            accountId: acc.id,
          });
          toast(`Carnet réindexé (${res?.messagesProcessed ?? 0} messages traités).`);
          await (app()["refreshAddressBookList"] as (...a: unknown[]) => unknown)();
          await (app()["loadAddressBookSidebarCount"] as (...a: unknown[]) => unknown)();
          (app()["render"] as (...a: unknown[]) => unknown)();
        } catch (e) {
          toast((app()["tauriErrorMessage"] as (...a: unknown[]) => unknown)(e));
        }
      })();
      break;
    }
    case "address-book-edit": {
      addressBookEditEmail = element?.dataset.email?.trim() ?? null;
      (app()["render"] as (...a: unknown[]) => unknown)();
      break;
    }
    case "address-book-cancel-edit":
      addressBookEditEmail = null;
      (app()["render"] as (...a: unknown[]) => unknown)();
      break;
    case "address-book-save": {
      void (async () => {
        const acc = (app()["currentAccount"] as (...a: unknown[]) => unknown)();
        if (!acc?.id || !isTauriRuntime()) return;
        const email = document.querySelector<HTMLInputElement>("#ab-edit-email")?.value?.trim() ?? "";
        const displayName = document.querySelector<HTMLInputElement>("#ab-edit-name")?.value?.trim() ?? "";
        const notes = document.querySelector<HTMLTextAreaElement>("#ab-edit-notes")?.value?.trim() ?? "";
        const isFavorite = Boolean(document.querySelector<HTMLInputElement>("#ab-edit-fav")?.checked);
        try {
          await invoke("upsert_manual_contact_cmd", {
            payload: { accountId: acc.id, email, displayName, notes, isFavorite },
          });
          addressBookEditEmail = null;
          await (app()["refreshAddressBookList"] as (...a: unknown[]) => unknown)();
          toast("Contact enregistré.");
          (app()["render"] as (...a: unknown[]) => unknown)();
        } catch (e) {
          toast((app()["tauriErrorMessage"] as (...a: unknown[]) => unknown)(e));
        }
      })();
      break;
    }
    case "address-book-delete": {
      void (async () => {
        const acc = (app()["currentAccount"] as (...a: unknown[]) => unknown)();
        const email = element?.dataset.email?.trim();
        if (!acc?.id || !email) return;
        try {
          await invoke<boolean>("delete_manual_contact_cmd", { accountId: acc.id, email });
          await (app()["refreshAddressBookList"] as (...a: unknown[]) => unknown)();
          toast("Contact supprimé.");
          (app()["render"] as (...a: unknown[]) => unknown)();
        } catch (e) {
          toast((app()["tauriErrorMessage"] as (...a: unknown[]) => unknown)(e));
        }
      })();
      break;
    }
    case "address-book-toggle-fav": {
      void (async () => {
        const acc = (app()["currentAccount"] as (...a: unknown[]) => unknown)();
        const email = element?.dataset.email?.trim();
        const row = addressBookRowsCache.find((r) => r.email === email);
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
          await (app()["refreshAddressBookList"] as (...a: unknown[]) => unknown)();
          (app()["render"] as (...a: unknown[]) => unknown)();
        } catch (e) {
          toast((app()["tauriErrorMessage"] as (...a: unknown[]) => unknown)(e));
        }
      })();
      break;
    }
    case "open-contacts-view":
      void (app()["openContactsView"] as (...a: unknown[]) => unknown)();
      break;
    case "open-organization-view":
      void (app()["openOrganizationView"] as (...a: unknown[]) => unknown)();
      break;
    case "open-organization-v2-view":
      void (app()["openOrganizationV2View"] as (...a: unknown[]) => unknown)();
      break;
    case "open-folder-manager-view":
      state.mailboxManageOpen = false;
      void (app()["openFolderManagerView"] as (...a: unknown[]) => unknown)();
      break;
    case "fm-refresh":
      void (app()["refreshFolderManagerTree"] as (...a: unknown[]) => unknown)();
      break;
    case "fm-create-root":
      void (app()["fmCreateMailbox"] as (...a: unknown[]) => unknown)();
      break;
    case "fm-create-child": {
      const parent = element?.dataset.mailbox?.trim();
      if (parent) void (app()["fmCreateMailbox"] as (...a: unknown[]) => unknown)(parent);
      break;
    }
    case "fm-select": {
      const mb = element?.dataset.mailbox?.trim();
      if (mb) void (app()["fmSelectMailbox"] as (...a: unknown[]) => unknown)(mb);
      break;
    }
    case "fm-sync": {
      const mb = element?.dataset.mailbox?.trim();
      if (mb) void (app()["fmSyncMailbox"] as (...a: unknown[]) => unknown)(mb);
      break;
    }
    case "fm-archive": {
      const mb = element?.dataset.mailbox?.trim();
      if (!mb) return;
      state.folderManager.pendingArchiveMailbox = mb;
      state.folderManager.archiveRemember = (state.folderManager.report?.autoArchiveMailboxes ?? []).some(
        (m) => m.toLowerCase() === mb.toLowerCase(),
      );
      state.folderManager.archiveConfirmOpen = true;
      (app()["render"] as (...a: unknown[]) => unknown)();
      break;
    }
    case "fm-archive-cancel":
      state.folderManager.archiveConfirmOpen = false;
      state.folderManager.pendingArchiveMailbox = null;
      (app()["render"] as (...a: unknown[]) => unknown)();
      break;
    case "fm-archive-remember-toggle":
      state.folderManager.archiveRemember = Boolean(
        document.querySelector<HTMLInputElement>("#fm-archive-remember")?.checked,
      );
      break;
    case "fm-archive-confirm":
      void (app()["fmConfirmArchiveMailbox"] as (...a: unknown[]) => unknown)();
      break;
    case "fm-delete": {
      const mb = element?.dataset.mailbox?.trim();
      if (!mb) return;
      state.folderManager.pendingDeleteMailbox = mb;
      state.folderManager.deleteConfirmOpen = true;
      state.folderManager.deleteConfirmChecked = false;
      (app()["render"] as (...a: unknown[]) => unknown)();
      break;
    }
    case "fm-delete-cancel":
      state.folderManager.deleteConfirmOpen = false;
      state.folderManager.pendingDeleteMailbox = null;
      state.folderManager.deleteConfirmChecked = false;
      (app()["render"] as (...a: unknown[]) => unknown)();
      break;
    case "fm-delete-check-toggle":
      state.folderManager.deleteConfirmChecked = Boolean(
        document.querySelector<HTMLInputElement>("#fm-delete-check")?.checked,
      );
      (app()["render"] as (...a: unknown[]) => unknown)();
      break;
    case "fm-delete-confirm":
      void (app()["fmConfirmDeleteMailbox"] as (...a: unknown[]) => unknown)();
      break;
    case "fm-toggle-lock": {
      const acc = (app()["currentAccount"] as (...a: unknown[]) => unknown)();
      const mb = element?.dataset.mailbox?.trim();
      if (!acc?.id || !mb) return;
      const locked = element?.dataset.locked === "1";
      void setMailboxLocked(acc.id, mb, !locked)
        .then(async (list) => {
          if (state.folderManager.report) state.folderManager.report.lockedMailboxes = list;
          (app()["render"] as (...a: unknown[]) => unknown)();
        })
        .catch((e) => toast((app()["tauriErrorMessage"] as (...a: unknown[]) => unknown)(e)));
      break;
    }
    case "fm-toggle-node": {
      const key = element?.dataset.nodeKey?.trim();
      if (!key) return;
      const cur = state.folderManager.expandedNodes[key];
      state.folderManager.expandedNodes[key] = cur === true ? false : true;
      saveFolderTreeExpanded(state.folderManager.expandedNodes);
      (app()["render"] as (...a: unknown[]) => unknown)();
      break;
    }
    case "fm-open-inbox": {
      const mb = element?.dataset.mailbox?.trim();
      if (mb) void (app()["openOrganizationMailbox"] as (...a: unknown[]) => unknown)(mb);
      break;
    }
    case "org-v2-scan": {
      const acc = (app()["currentAccount"] as (...a: unknown[]) => unknown)();
      if (!acc?.id) return;
      state.organizationV2.scanning = true;
      state.organizationV2.applyMessage = "Analyse…";
      (app()["render"] as (...a: unknown[]) => unknown)();
      const includeLlm = Boolean(state.appPrefs.ai.featureOrgProposalsEnabled);
      void orgV2ScanAccount(acc.id, includeLlm)
        .then((report) => {
          state.organizationV2.report = report;
          state.organizationV2.scanning = false;
          state.organizationV2.applyMessage = `${report.proposals.length} action(s).`;
          (app()["render"] as (...a: unknown[]) => unknown)();
        })
        .catch((e) => {
          state.organizationV2.scanning = false;
          state.organizationV2.applyMessage = "";
          toast((app()["tauriErrorMessage"] as (...a: unknown[]) => unknown)(e));
          (app()["render"] as (...a: unknown[]) => unknown)();
        });
      break;
    }
    case "org-v2-undo": {
      const accUndo = (app()["currentAccount"] as (...a: unknown[]) => unknown)();
      if (!accUndo?.id) return;
      state.organizationV2.applying = true;
      state.organizationV2.applyMessage = "Annulation…";
      (app()["render"] as (...a: unknown[]) => unknown)();
      void orgUndoLast(accUndo.id)
        .then((p) => {
          state.organizationV2.applying = false;
          state.organizationV2.applyMessage = p.message || "Lot annulé.";
          toast(state.organizationV2.applyMessage);
          (app()["render"] as (...a: unknown[]) => unknown)();
        })
        .catch((e) => {
          state.organizationV2.applying = false;
          state.organizationV2.applyMessage = "";
          toast((app()["tauriErrorMessage"] as (...a: unknown[]) => unknown)(e));
          (app()["render"] as (...a: unknown[]) => unknown)();
        });
      break;
    }
    case "org-v2-dismiss": {
      const pid = element?.dataset.proposalId?.trim();
      if (pid) void (app()["orgV2DismissProposal"] as (...a: unknown[]) => unknown)(pid);
      break;
    }
    case "org-v2-snooze": {
      const pid = element?.dataset.proposalId?.trim();
      if (pid) void (app()["orgV2SnoozeProposal"] as (...a: unknown[]) => unknown)(pid);
      break;
    }
    case "org-v2-apply": {
      const acc = (app()["currentAccount"] as (...a: unknown[]) => unknown)();
      const proposalId = element?.dataset.proposalId?.trim();
      if (!acc?.id || !proposalId) return;
      if (element?.dataset.trash === "1") {
        state.organizationV2.trashConfirmOpen = true;
        state.organizationV2.pendingTrashProposalId = proposalId;
        state.organizationV2.pendingTrashActionOverride = null;
        (app()["render"] as (...a: unknown[]) => unknown)();
        return;
      }
      if (element?.dataset.deleteMailbox === "1") {
        state.organizationV2.deleteMailboxConfirmOpen = true;
        state.organizationV2.pendingDeleteMailboxProposalId = proposalId;
        (app()["render"] as (...a: unknown[]) => unknown)();
        return;
      }
      const applyProposal = state.organizationV2.report?.proposals.find((p) => p.id === proposalId);
      if (!applyProposal) {
        toast("Proposition introuvable — relancez l’analyse.");
        break;
      }
      void (app()["confirmThenRunOrgV2Apply"] as (...a: unknown[]) => unknown)(acc.id, proposalId);
      break;
    }
    case "org-v2-cancel-apply":
      if (state.organizationV2.applying) {
        state.organizationV2.applyCancelRequested = true;
        state.organizationV2.applyMessage = "Arrêt demandé…";
        (app()["render"] as (...a: unknown[]) => unknown)();
      }
      break;
    case "org-v2-trash-cancel":
      state.organizationV2.trashConfirmOpen = false;
      state.organizationV2.pendingTrashProposalId = null;
      state.organizationV2.pendingTrashActionOverride = null;
      (app()["render"] as (...a: unknown[]) => unknown)();
      break;
    case "org-v2-trash-confirm": {
      const acc = (app()["currentAccount"] as (...a: unknown[]) => unknown)();
      const pid = state.organizationV2.pendingTrashProposalId;
      if (!acc?.id || !pid) return;
      const override = state.organizationV2.pendingTrashActionOverride;
      state.organizationV2.trashConfirmOpen = false;
      state.organizationV2.pendingTrashProposalId = null;
      state.organizationV2.pendingTrashActionOverride = null;
      (app()["render"] as (...a: unknown[]) => unknown)();
      const trashProposal = state.organizationV2.report?.proposals.find((p) => p.id === pid);
      if (!trashProposal) {
        toast("Proposition introuvable — relancez l’analyse.");
        break;
      }
      void (app()["runOrgV2Apply"] as (...a: unknown[]) => unknown)(acc.id, trashProposal, "bulk-trash-org", override ?? undefined);
      break;
    }
    case "org-v2-delete-mailbox-cancel":
      state.organizationV2.deleteMailboxConfirmOpen = false;
      state.organizationV2.pendingDeleteMailboxProposalId = null;
      (app()["render"] as (...a: unknown[]) => unknown)();
      break;
    case "org-v2-delete-mailbox-confirm": {
      const acc = (app()["currentAccount"] as (...a: unknown[]) => unknown)();
      const pid = state.organizationV2.pendingDeleteMailboxProposalId;
      if (!acc?.id || !pid) return;
      state.organizationV2.deleteMailboxConfirmOpen = false;
      state.organizationV2.pendingDeleteMailboxProposalId = null;
      (app()["render"] as (...a: unknown[]) => unknown)();
      const delMbProposal = state.organizationV2.report?.proposals.find((p) => p.id === pid);
      if (!delMbProposal) {
        toast("Proposition introuvable — relancez l’analyse.");
        break;
      }
      void (app()["runOrgV2Apply"] as (...a: unknown[]) => unknown)(acc.id, delMbProposal, undefined, undefined, "delete-mailbox");
      break;
    }
    case "org-v2-ignore-mailbox":
    case "org-v2-unignore-mailbox":
      break;
    case "org-scan": {
      const acc = (app()["currentAccount"] as (...a: unknown[]) => unknown)();
      if (!acc?.id) return;
      state.organization.scanning = true;
      state.organization.applyMessage = "Analyse de la boîte (structure, propositions)…";
      (app()["render"] as (...a: unknown[]) => unknown)();
      void orgScanAccount(acc.id, Boolean(state.appPrefs.ai.featureOrgProposalsEnabled))
        .then((report) => {
          state.organization.report = report;
          state.organization.scanning = false;
          state.organization.applyMessage = `${report.proposals.length} proposition(s).`;
          (app()["render"] as (...a: unknown[]) => unknown)();
        })
        .catch((e) => {
          state.organization.scanning = false;
          state.organization.applyMessage = "";
          toast((app()["tauriErrorMessage"] as (...a: unknown[]) => unknown)(e));
          (app()["render"] as (...a: unknown[]) => unknown)();
        });
      break;
    }
    case "org-open-mailbox": {
      const mb = element?.dataset.mailbox?.trim();
      if (mb) void (app()["openOrganizationMailbox"] as (...a: unknown[]) => unknown)(mb);
      break;
    }
    case "org-sync-mailbox":
    case "org-delete-mailbox-one":
      break;
    case "org-apply-trash": {
      const acc = (app()["currentAccount"] as (...a: unknown[]) => unknown)();
      const proposalId = element?.dataset.proposalId?.trim();
      if (!acc?.id || !proposalId) return;
      state.organization.trashConfirmOpen = true;
      state.organization.pendingTrashProposalId = proposalId;
      state.organization.pendingTrashActionOverride = "trash";
      (app()["render"] as (...a: unknown[]) => unknown)();
      break;
    }
    case "org-apply-archive": {
      const acc = (app()["currentAccount"] as (...a: unknown[]) => unknown)();
      const proposalId = element?.dataset.proposalId?.trim();
      if (!acc?.id || !proposalId) return;
      void (app()["confirmThenRunOrgApply"] as (...a: unknown[]) => unknown)(acc.id, proposalId, undefined, "archive");
      break;
    }
    case "org-apply": {
      const acc = (app()["currentAccount"] as (...a: unknown[]) => unknown)();
      const proposalId = element?.dataset.proposalId?.trim();
      if (!acc?.id || !proposalId) return;
      const isTrash = element?.dataset.trash === "1";
      if (isTrash) {
        state.organization.trashConfirmOpen = true;
        state.organization.pendingTrashProposalId = proposalId;
        state.organization.pendingTrashActionOverride = null;
        (app()["render"] as (...a: unknown[]) => unknown)();
        return;
      }
      if (element?.dataset.deleteMailbox === "1") {
        state.organization.deleteMailboxConfirmOpen = true;
        state.organization.pendingDeleteMailboxProposalId = proposalId;
        (app()["render"] as (...a: unknown[]) => unknown)();
        return;
      }
      void (app()["confirmThenRunOrgApply"] as (...a: unknown[]) => unknown)(acc.id, proposalId);
      break;
    }
    case "org-trash-cancel":
      state.organization.trashConfirmOpen = false;
      state.organization.pendingTrashProposalId = null;
      state.organization.pendingTrashActionOverride = null;
      (app()["render"] as (...a: unknown[]) => unknown)();
      break;
    case "org-trash-confirm": {
      const acc = (app()["currentAccount"] as (...a: unknown[]) => unknown)();
      const pid = state.organization.pendingTrashProposalId;
      if (!acc?.id || !pid) return;
      const override = state.organization.pendingTrashActionOverride;
      state.organization.trashConfirmOpen = false;
      state.organization.pendingTrashProposalId = null;
      state.organization.pendingTrashActionOverride = null;
      (app()["render"] as (...a: unknown[]) => unknown)();
      void (app()["runOrgApply"] as (...a: unknown[]) => unknown)(acc.id, pid, "bulk-trash-org", override ?? undefined);
      break;
    }
    case "org-delete-mailbox-cancel":
      state.organization.deleteMailboxConfirmOpen = false;
      state.organization.pendingDeleteMailboxProposalId = null;
      (app()["render"] as (...a: unknown[]) => unknown)();
      break;
    case "org-delete-mailbox-confirm": {
      const acc = (app()["currentAccount"] as (...a: unknown[]) => unknown)();
      const pid = state.organization.pendingDeleteMailboxProposalId;
      if (!acc?.id || !pid) return;
      state.organization.deleteMailboxConfirmOpen = false;
      state.organization.pendingDeleteMailboxProposalId = null;
      (app()["render"] as (...a: unknown[]) => unknown)();
      void (app()["runOrgApply"] as (...a: unknown[]) => unknown)(acc.id, pid, undefined, undefined, "delete-mailbox");
      break;
    }
    case "org-retag-all": {
      const acc = (app()["currentAccount"] as (...a: unknown[]) => unknown)();
      if (!acc?.id) return;
      state.organization.applying = true;
      state.organization.applyMessage = "Normalisation des tags en cours…";
      toast("Recalcul des tags sur tout le compte…");
      (app()["render"] as (...a: unknown[]) => unknown)();
      void orgRetagAccount(acc.id, false)
        .then(async (p) => {
          state.organization.applying = false;
          state.organization.applyMessage = p.message;
          toast(p.message);
          await (app()["refreshOrganizationReport"] as (...a: unknown[]) => unknown)();
          (app()["render"] as (...a: unknown[]) => unknown)();
        })
        .catch((e) => {
          state.organization.applying = false;
          state.organization.applyMessage = "";
          toast((app()["tauriErrorMessage"] as (...a: unknown[]) => unknown)(e));
          (app()["render"] as (...a: unknown[]) => unknown)();
        });
      break;
    }
    case "contacts-back-list":
      if (navCanGoBack()) void (app()["goBack"] as (...a: unknown[]) => unknown)();
      else {
        state.view = "contacts";
        state.selectedContactEmail = undefined;
        (app()["render"] as (...a: unknown[]) => unknown)();
      }
      break;
    case "contacts-back-inbox":
      (app()["navigateToInbox"] as (...a: unknown[]) => unknown)();
      break;
    case "contacts-refresh-list": {
      const acc = (app()["currentAccount"] as (...a: unknown[]) => unknown)();
      if (acc?.id) {
        void loadContactsList(acc.id, { reset: true })
          .then(() => (app()["loadAddressBookSidebarCount"] as (...a: unknown[]) => unknown)())
          .then(() => (app()["render"] as (...a: unknown[]) => unknown)());
      }
      break;
    }
    case "contacts-load-more": {
      const acc = (app()["currentAccount"] as (...a: unknown[]) => unknown)();
      if (acc?.id) void loadContactsList(acc.id).then(() => (app()["render"] as (...a: unknown[]) => unknown)());
      break;
    }
    case "contacts-open-detail": {
      const email = element?.dataset.email?.trim();
      if (email) void (app()["openContactDetailView"] as (...a: unknown[]) => unknown)(email);
      break;
    }
    case "contacts-open-thread": {
      const tid = element?.dataset.threadId?.trim();
      if (tid) void (app()["openThread"] as (...a: unknown[]) => unknown)(tid);
      break;
    }
    case "contacts-compose": {
      const d = getContactDetail();
      const to = d?.email || state.selectedContactEmail;
      if (!to) break;
      (app()["enterComposeView"] as (...a: unknown[]) => unknown)();
      (app()["startNewDraftSession"] as (...a: unknown[]) => unknown)();
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
      (app()["syncPreviewOpenFromComposeLayout"] as (...a: unknown[]) => unknown)();
      state.preview = undefined;
      (app()["render"] as (...a: unknown[]) => unknown)();
      break;
    }
    case "contacts-toggle-fav": {
      const acc = (app()["currentAccount"] as (...a: unknown[]) => unknown)();
      const email = element?.dataset.email?.trim() || state.selectedContactEmail;
      const d = getContactDetail();
      if (!acc?.id || !email || !d) break;
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
          (app()["render"] as (...a: unknown[]) => unknown)();
        } catch (e) {
          toast((app()["tauriErrorMessage"] as (...a: unknown[]) => unknown)(e));
        }
      })();
      break;
    }
    case "contacts-llm-profile": {
      if (!isAiFeatureEnabled(state.appPrefs.ai, "featureContactProfileEnabled")) {
        toast("Activez « Profil IA contact » dans les réglages IA.");
        break;
      }
      const acc = (app()["currentAccount"] as (...a: unknown[]) => unknown)();
      const email = element?.dataset.email?.trim() || state.selectedContactEmail;
      if (!acc?.id || !email) break;
      void (async () => {
        await loadContactProfile(acc.id!, email);
        (app()["render"] as (...a: unknown[]) => unknown)();
        toast("Profil IA chargé.");
      })();
      break;
    }
    case "contacts-search-domain": {
      const domain = element?.dataset.domain?.trim();
      if (domain) void (app()["launchDomainMailSearch"] as (...a: unknown[]) => unknown)(domain);
      break;
    }
    case "contacts-search-all":
    case "contacts-search-unread":
    case "contacts-search-focused":
    case "contacts-search-auto":
    case "contacts-search-keyword":
    case "contacts-search-hybrid": {
      const email = state.selectedContactEmail || getContactDetail()?.email;
      if (!email) break;
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
      (app()["launchContactMailSearch"] as (...a: unknown[]) => unknown)({
        email,
        listFilter: filter,
        text: getContactsKeywordDraft(),
        hybrid: action === "contacts-search-hybrid",
      });
      break;
    }
    case "address-book-export-vcard": {
      const acc = (app()["currentAccount"] as (...a: unknown[]) => unknown)();
      if (!acc?.id) {
        toast("Sélectionnez un compte.");
        break;
      }
      void (async () => {
        try {
          const path = await invoke<string>("export_address_contacts_vcard_cmd", {
            accountId: acc.id,
          });
          toast(`Carnet exporté : ${path}`);
        } catch (e) {
          const msg = (app()["tauriErrorMessage"] as (...a: unknown[]) => unknown)(e);
          if (!msg.toLowerCase().includes("annul")) toast(msg);
        }
      })();
      break;
    }
    case "address-book-import-vcard": {
      const acc = (app()["currentAccount"] as (...a: unknown[]) => unknown)();
      if (!acc?.id) {
        toast("Sélectionnez un compte.");
        break;
      }
      void (async () => {
        try {
          const res = await invoke<{ imported: number; skippedDuplicates: number; errors: string[] }>(
            "import_address_contacts_vcard_cmd",
            { payload: { accountId: acc.id, merge: true } }
          );
          await (app()["refreshAddressBookList"] as (...a: unknown[]) => unknown)();
          const errN = res.errors?.length ?? 0;
          toast(
            `Import : ${res.imported} contact(s), ${res.skippedDuplicates} ignoré(s)${errN ? `, ${errN} erreur(s)` : ""}.`
          );
        } catch (e) {
          const msg = (app()["tauriErrorMessage"] as (...a: unknown[]) => unknown)(e);
          if (!msg.toLowerCase().includes("annul")) toast(msg);
        }
      })();
      break;
    }
    case "agent-prepare-start":
      void (app()["agentPrepareReplyStart"] as (...a: unknown[]) => unknown)();
      break;
    case "agent-prepare-continue":
      void (app()["agentPrepareReplyContinue"] as (...a: unknown[]) => unknown)();
      break;
    case "agent-prepare-cancel":
      void (app()["stopAgentTelemetry"] as (...a: unknown[]) => unknown)().then(() => {
        state.agentSession = null;
        (app()["render"] as (...a: unknown[]) => unknown)();
      });
      break;
    case "agent-insert-compose":
      void (app()["agentInsertDraftIntoCompose"] as (...a: unknown[]) => unknown)();
      break;
    case "agent-append-slot": {
      const slot = element?.dataset.slot?.trim();
      if (slot) void (app()["agentInsertDraftIntoCompose"] as (...a: unknown[]) => unknown)(slot);
      break;
    }
    case "agent-append-all-slots": {
      const s = state.agentSession;
      if (s?.slots.length) void (app()["agentInsertDraftIntoCompose"] as (...a: unknown[]) => unknown)(s.slots.join("\n"));
      break;
    }
    case "summarize-sender-threads":
      void (app()["summarizeSenderThreadsLight"] as (...a: unknown[]) => unknown)();
      break;
    case "llm-quick-replies-compose":
      void (app()["llmQuickRepliesComposeUi"] as (...a: unknown[]) => unknown)();
      break;
    case "mic":
      await (app()["micAction"] as (...a: unknown[]) => unknown)({ target: "compose" });
      break;
    case "mic-thread-qa":
      await (app()["micAction"] as (...a: unknown[]) => unknown)({ target: "thread-qa" });
      break;
    case "save-account":
      await (app()["saveAccount"] as (...a: unknown[]) => unknown)();
      break;
    case "sync-inbox":
      void (app()["syncInbox"] as (...a: unknown[]) => unknown)({ background: state.view === "thread" });
      break;
    case "empty-trash-mailbox":
      void (app()["onEmptyTrashMailbox"] as (...a: unknown[]) => unknown)();
      break;
    case "bulk-trash-visible":
      void (app()["bulkTrashVisibleThreads"] as (...a: unknown[]) => unknown)();
      break;
    case "save-saved-search":
      void (app()["saveCurrentSearchView"] as (...a: unknown[]) => unknown)();
      break;
    case "clear-search-exit":
      void (app()["clearSearchAndReloadInbox"] as (...a: unknown[]) => unknown)();
      break;
    case "apply-saved-search": {
      const sid = element?.dataset.savedSearchId?.trim();
      if (sid) void (app()["applySavedSearchView"] as (...a: unknown[]) => unknown)(sid);
      break;
    }
    case "delete-saved-search": {
      const sid = element?.dataset.savedSearchId?.trim();
      if (sid) void (app()["deleteSavedSearchView"] as (...a: unknown[]) => unknown)(sid);
      break;
    }
    case "search-view-mark-read":
      void (app()["bulkMarkReadSearchViewThreads"] as (...a: unknown[]) => unknown)();
      break;
    case "search-view-archive":
      void (app()["bulkArchiveSearchViewThreads"] as (...a: unknown[]) => unknown)();
      break;
    case "search-view-open-organizer":
      void (app()["openOrganizationV2View"] as (...a: unknown[]) => unknown)();
      break;
    case "search-view-affiner":
      void (app()["runFluxAffinerFromSearchView"] as (...a: unknown[]) => unknown)();
      break;
    case "accept-view-suggestion": {
      const email = element?.dataset.senderEmail?.trim();
      if (email) void (app()["acceptSuggestedSavedView"] as (...a: unknown[]) => unknown)(email);
      break;
    }
    case "dismiss-view-suggestion": {
      const email = element?.dataset.senderEmail?.trim();
      if (email) void (app()["dismissSuggestedSavedView"] as (...a: unknown[]) => unknown)(email, "dismiss");
      break;
    }
    case "snooze-view-suggestion": {
      const email = element?.dataset.senderEmail?.trim();
      if (email) void (app()["dismissSuggestedSavedView"] as (...a: unknown[]) => unknown)(email, "snooze");
      break;
    }
    case "saved-search-mark-seen":
      void (app()["markActiveSavedSearchSeen"] as (...a: unknown[]) => unknown)({ toast: true });
      break;
    case "load-more":
      if ((app()["usesSearchContextLoader"] as (...a: unknown[]) => unknown)()) await (app()["loadThreadsForSearchContext"] as (...a: unknown[]) => unknown)(true);
      else await (app()["loadMailView"] as (...a: unknown[]) => unknown)(true);
      (app()["render"] as (...a: unknown[]) => unknown)();
      break;
    case "clear-search-text":
      state.search = "";
      state.searchDraft = "";
      if (!(app()["isSearchActive"] as (...a: unknown[]) => unknown)()) {
        void (app()["clearSearchAndReloadInbox"] as (...a: unknown[]) => unknown)();
      } else {
        void (app()["loadThreadsForSearchContext"] as (...a: unknown[]) => unknown)(false).then(() => (app()["render"] as (...a: unknown[]) => unknown)());
      }
      break;
    case "clear-search-list-filter":
      state.listFilter = "all";
      if (state.search.trim()) {
        void (app()["searchThreads"] as (...a: unknown[]) => unknown)();
      } else if ((app()["isSearchActive"] as (...a: unknown[]) => unknown)()) {
        void (app()["loadThreadsForSearchContext"] as (...a: unknown[]) => unknown)(false).then(() => (app()["render"] as (...a: unknown[]) => unknown)());
      } else {
        (app()["render"] as (...a: unknown[]) => unknown)();
      }
      break;
    case "clear-search-nl-filters":
      (app()["resetManualSearchNlFilters"] as (...a: unknown[]) => unknown)();
      if (!(app()["isSearchActive"] as (...a: unknown[]) => unknown)()) {
        void (app()["clearSearchAndReloadInbox"] as (...a: unknown[]) => unknown)();
      } else if (state.search.trim()) {
        void (app()["searchThreads"] as (...a: unknown[]) => unknown)();
      } else {
        void (app()["loadThreadsForSearchContext"] as (...a: unknown[]) => unknown)(false).then(() => (app()["render"] as (...a: unknown[]) => unknown)());
      }
      break;
    case "clear-search-sender":
      state.searchSenders = [];
      if (!(app()["isSearchActive"] as (...a: unknown[]) => unknown)()) {
        void (app()["clearSearchAndReloadInbox"] as (...a: unknown[]) => unknown)();
      } else if (state.search.trim() || state.searchTags.length > 0) {
        void (app()["searchThreads"] as (...a: unknown[]) => unknown)();
      } else {
        void (app()["loadThreadsForSearchContext"] as (...a: unknown[]) => unknown)(false).then(() => (app()["render"] as (...a: unknown[]) => unknown)());
      }
      break;
    case "clear-search-sender-one": {
      const email = element?.dataset.email?.trim().toLowerCase();
      if (email) state.searchSenders = state.searchSenders.filter((s) => s.toLowerCase() !== email);
      if (!(app()["isSearchActive"] as (...a: unknown[]) => unknown)()) void (app()["clearSearchAndReloadInbox"] as (...a: unknown[]) => unknown)();
      else if (state.search.trim() || state.searchSenders.length || state.searchTags.length) void (app()["searchThreads"] as (...a: unknown[]) => unknown)();
      else void (app()["loadThreadsForSearchContext"] as (...a: unknown[]) => unknown)(false).then(() => (app()["render"] as (...a: unknown[]) => unknown)());
      break;
    }
    case "clear-search-mailbox":
      state.searchMailboxPath = null;
      state.searchDraft = state.searchDraft
        .replace(/#(?:local|dossier|ici):(?:"[^"]*"|'[^']*'|[^\s#]+)/gi, "")
        .replace(/\s{2,}/g, " ")
        .trim();
      const searchInClear = document.querySelector<HTMLInputElement>("#search-input");
      if (searchInClear) searchInClear.value = state.searchDraft;
      if (!(app()["isSearchActive"] as (...a: unknown[]) => unknown)()) void (app()["clearSearchAndReloadInbox"] as (...a: unknown[]) => unknown)();
      else if (state.search.trim() || state.searchSenders.length || state.searchTags.length) void (app()["searchThreads"] as (...a: unknown[]) => unknown)();
      else void (app()["loadThreadsForSearchContext"] as (...a: unknown[]) => unknown)(false).then(() => (app()["render"] as (...a: unknown[]) => unknown)());
      break;
    case "clear-search-account":
      state.searchAccountOverrideId = null;
      if (!(app()["isSearchActive"] as (...a: unknown[]) => unknown)()) void (app()["clearSearchAndReloadInbox"] as (...a: unknown[]) => unknown)();
      else if (state.search.trim() || state.searchSenders.length || state.searchTags.length) void (app()["searchThreads"] as (...a: unknown[]) => unknown)();
      else void (app()["loadThreadsForSearchContext"] as (...a: unknown[]) => unknown)(false).then(() => (app()["render"] as (...a: unknown[]) => unknown)());
      break;
    case "clear-search-tag-one": {
      const raw = element?.dataset.tag?.trim().toLowerCase();
      if (raw) {
        state.searchTags = state.searchTags.filter((t) => `${String(t.family).toLowerCase()}:${t.value}`.toLowerCase() !== raw);
      }
      if (!(app()["isSearchActive"] as (...a: unknown[]) => unknown)()) void (app()["clearSearchAndReloadInbox"] as (...a: unknown[]) => unknown)();
      else if (state.search.trim() || state.searchSenders.length || state.searchTags.length) void (app()["searchThreads"] as (...a: unknown[]) => unknown)();
      else void (app()["loadThreadsForSearchContext"] as (...a: unknown[]) => unknown)(false).then(() => (app()["render"] as (...a: unknown[]) => unknown)());
      break;
    }
    case "clear-search-newsletter-rule":
      state.searchNewsletterRule = null;
      if (state.search.trim()) {
        void (app()["searchThreads"] as (...a: unknown[]) => unknown)();
      } else {
        void (app()["loadThreadsForSearchContext"] as (...a: unknown[]) => unknown)(false).then(() => (app()["render"] as (...a: unknown[]) => unknown)());
      }
      break;
    case "toggle-search-scope":
      state.searchScope = state.searchScope === "account" ? "mailbox" : "account";
      state.searchMailboxPath = null;
      toast(
        state.searchScope === "account"
          ? "Portée : tout le compte (tous les dossiers)"
          : `Portée : dossier affiché — ${threadMailboxListLabel(state.selectedMailbox || "INBOX").full}`
      );
      if ((app()["isSearchActive"] as (...a: unknown[]) => unknown)()) {
        if (state.search.trim() || state.searchSenders.length) void (app()["searchThreads"] as (...a: unknown[]) => unknown)();
        else void (app()["loadThreadsForSearchContext"] as (...a: unknown[]) => unknown)(false).then(() => (app()["render"] as (...a: unknown[]) => unknown)());
      } else {
        (app()["render"] as (...a: unknown[]) => unknown)();
      }
      break;
    case "list-filter-all":
      void (app()["applyListFilter"] as (...a: unknown[]) => unknown)("all");
      break;
    case "list-filter-unread":
      void (app()["applyListFilter"] as (...a: unknown[]) => unknown)("unread");
      break;
    case "list-filter-starred":
      void (app()["applyListFilter"] as (...a: unknown[]) => unknown)("starred");
      break;
    case "list-filter-focused":
      void (app()["applyListFilter"] as (...a: unknown[]) => unknown)("focused");
      break;
    case "list-filter-auto":
      void (app()["applyListFilter"] as (...a: unknown[]) => unknown)("auto");
      break;
    case "clear-mailbox-digest":
    case "dismiss-mailbox-digest":
      dismissMailboxDigestPanel();
      break;
    case "quick-reply-copy": {
      const idx = Number(element?.dataset.qrIndex ?? "");
      const s = state.quickReplySuggestions[idx];
      const t = s?.text?.trim();
      if (!t) break;
      void navigator.clipboard.writeText(t).then(
        () => toast("Copié dans le presse-papiers."),
        () => toast("Copie impossible (permission navigateur).")
      );
      break;
    }
    case "thread-trash-cur":
      if (state.selectedThreadId) void (app()["onThreadMove"] as (...a: unknown[]) => unknown)("trash", state.selectedThreadId);
      break;
    case "thread-archive-cur":
      if (state.selectedThreadId) void (app()["onThreadMove"] as (...a: unknown[]) => unknown)("archive", state.selectedThreadId);
      break;
    case "thread-unarchive-cur": {
      const tid = state.selectedThreadId?.trim();
      const acc = (app()["currentAccount"] as (...a: unknown[]) => unknown)();
      if (!tid || !acc?.id) break;
      if (!isTauriRuntime()) {
        toast("Désarchivage : disponible dans l’app Tauri.");
        break;
      }
      void (async () => {
        try {
          const { moveThreadUnarchive } = await import("../../organizationView");
          const out = await (app()["withTimeout"] as (...a: unknown[]) => unknown)(moveThreadUnarchive(acc.id, tid), MAIL_ACTION_TIMEOUT_MS);
          toast(out.message || "Désarchivé vers Inbox.");
          await (app()["openThread"] as (...a: unknown[]) => unknown)(tid, { skipHistory: true, preserveAi: true });
          (app()["render"] as (...a: unknown[]) => unknown)();
        } catch (err) {
          toast((app()["tauriErrorMessage"] as (...a: unknown[]) => unknown)(err));
        }
      })();
      break;
    }
    case "retag-thread": {
      const tid = element?.dataset.threadId?.trim() || state.selectedThreadId?.trim() || "";
      const accountId = state.selectedAccountId?.trim() || "";
      if (!tid || !accountId) break;
      if (!isTauriRuntime()) {
        toast("Recalcul des tags : disponible dans l’app Tauri.");
        break;
      }
      void (async () => {
        try {
          const n = await (app()["withTimeout"] as (...a: unknown[]) => unknown)(
            invoke<number>("org_retag_threads_cmd", {
              payload: { accountId, threadIds: [tid] },
            }),
            MAIL_ACTION_TIMEOUT_MS
          );
          toast(n > 0 ? "Tags mis à jour." : "Tags déjà à jour.");
          await (app()["openThread"] as (...a: unknown[]) => unknown)(tid, { skipHistory: true, preserveAi: true });
        } catch (err) {
          console.error("org_retag_threads_cmd", err);
          toast((app()["tauriErrorMessage"] as (...a: unknown[]) => unknown)(err));
        }
      })();
      break;
    }
    case "toggle-thread-seen": {
      const tid = element?.dataset.threadId?.trim() ?? "";
      if (!tid) break;
      const row = state.threads.find((t) => String(t.id) === tid);
      void (app()["onThreadSeen"] as (...a: unknown[]) => unknown)(row?.unread ? "read" : "unread", tid);
      break;
    }
    case "toggle-thread-follow": {
      const tid = element?.dataset.threadId?.trim() ?? "";
      if (!tid) break;
      void (app()["onThreadToggleFollow"] as (...a: unknown[]) => unknown)(tid);
      break;
    }
    case "toggle-thread-seen-cur": {
      const tid = state.selectedThreadId;
      if (!tid) break;
      const row = state.threads.find((t) => String(t.id) === tid);
      const unreadNow = Boolean(row?.unread ?? state.selectedThread?.unread);
      void (app()["onThreadSeen"] as (...a: unknown[]) => unknown)(unreadNow ? "read" : "unread", tid);
      break;
    }
    case "thread-move-cur":
      if (state.selectedThreadId) (app()["openMoveDialog"] as (...a: unknown[]) => unknown)(state.selectedThreadId);
      break;
    case "close-move":
      state.moveOpen = false;
      state.moveThreadId = undefined;
      (app()["render"] as (...a: unknown[]) => unknown)();
      break;
    case "confirm-move":
      await (app()["confirmMoveDialog"] as (...a: unknown[]) => unknown)();
      break;
    case "open-mailbox-manage":
      state.mailboxManageOpen = true;
      (app()["render"] as (...a: unknown[]) => unknown)();
      break;
    case "close-mailbox-manage":
      state.mailboxManageOpen = false;
      (app()["render"] as (...a: unknown[]) => unknown)();
      break;
    case "mb-create":
      await (app()["mailboxManageAction"] as (...a: unknown[]) => unknown)("create");
      break;
    case "mb-rename":
      await (app()["mailboxManageAction"] as (...a: unknown[]) => unknown)("rename");
      break;
    case "mb-delete":
      await (app()["mailboxManageAction"] as (...a: unknown[]) => unknown)("delete");
      break;
    case "mb-subscribe":
      await (app()["mailboxManageAction"] as (...a: unknown[]) => unknown)("subscribe");
      break;
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
        await (app()["saveDraftToSavedListNow"] as (...a: unknown[]) => unknown)();
      })();
      break;
    }
    case "delete-saved-draft": {
      const sid = element?.dataset.savedDraftId?.trim() ?? "";
      if (!sid) break;
      void (async () => {
        if (!isTauriRuntime()) return;
        const ok = await openConfirmModal({
          title: "Retirer ce brouillon ?",
          body: "Retirer ce brouillon de la liste enregistrée ? L’historique local des versions pour ce brouillon sera supprimé. Aucun mail IMAP n’est affecté.",
          danger: true,
          confirmLabel: "Retirer",
        });
        if (!ok) return;
        const accountId = (app()["currentAccount"] as (...a: unknown[]) => unknown)()?.id?.trim();
        if (!accountId) {
          toast("Aucun compte actif.");
          return;
        }
        try {
          await (app()["withTimeout"] as (...a: unknown[]) => unknown)(invoke("saved_draft_delete", { accountId, savedDraftId: sid }), MAIL_ACTION_TIMEOUT_MS);
          toast("Brouillon retiré de la liste.");
          await (app()["loadMailView"] as (...a: unknown[]) => unknown)(false);
          await (app()["refreshSavedDraftsMailboxCount"] as (...a: unknown[]) => unknown)();
          state.selectedThreadId = state.threads[0]?.id;
          state.selectedThread = undefined;
          (app()["render"] as (...a: unknown[]) => unknown)();
        } catch (e) {
          toast((app()["tauriErrorMessage"] as (...a: unknown[]) => unknown)(e));
          (app()["render"] as (...a: unknown[]) => unknown)();
        }
      })();
      break;
    }
  }
}