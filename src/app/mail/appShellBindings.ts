import { navCanGoBack, navCanGoForward } from "../../navigation";
import { isTauriRuntime } from "../lib/tauriRuntime";
import { toast } from "../lib/toast";
import { isConfirmOpen, isTextPromptOpen } from "../modals/promptConfirm";
import { render } from "../dispatch";
import { state } from "../state";
import { goBack, goForward } from "./appNavigationStack";
import { flushDraftRevisionPending as flushDraftRevisionPendingCore } from "./composeDraftRevisionAutosave";
import {
  dismissMailboxDigestPanel,
  mailboxDigestSlotInList,
} from "./mailboxDigest";
import { applySavedSearchView } from "./savedSearchViews";
import { closeSearchModal, openSearchModal } from "./searchBarUi";
import { finalizeSettingsAiModalClose } from "./settingsWireActions";
import { clearThreadAiSummaryState } from "./threadAiSummaryState";
import { syncInbox } from "./syncInboxRun";
import { handleAction } from "../ui/wireEvents";

async function flushDraftRevisionPending(): Promise<void> {
  await flushDraftRevisionPendingCore(
    () => state.view === "compose" && Boolean(state.draft && state.draftSessionId),
  );
}

function mouseNavBlockedByOverlay(): boolean {
  return Boolean(
    state.quoteFoldModal ||
      state.threadTagsModalOpen ||
      state.closeComposeModal ||
      state.resumeDraftModal ||
      state.imageModal ||
      state.splitSendConfirm ||
      state.moveOpen ||
      state.mailboxManageOpen ||
      state.searchModalOpen ||
      state.settingsAiModal ||
      isTextPromptOpen() ||
      isConfirmOpen(),
  );
}

function isEditableKeyboardTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  return Boolean(el.closest("input, textarea, select, [contenteditable='true']"));
}

function singleKeyShortcutsBlocked(): boolean {
  return mouseNavBlockedByOverlay();
}

function keyboardPlainKey(event: KeyboardEvent): boolean {
  return !event.ctrlKey && !event.metaKey && !event.altKey;
}

export function bindMouseNavigation(): void {
  const handleMouseNav = (event: MouseEvent) => {
    if (event.button !== 3 && event.button !== 4) return;
    const target = event.target as HTMLElement | null;
    if (target?.closest("input, textarea, select, [contenteditable='true']")) return;
    if (mouseNavBlockedByOverlay()) return;
    event.preventDefault();
    event.stopPropagation();
    if (event.button === 3) void goBack();
    else if (navCanGoForward()) void goForward();
  };

  document.addEventListener("auxclick", handleMouseNav, { capture: true });
  document.addEventListener(
    "mouseup",
    (event) => {
      if (event.button !== 3 && event.button !== 4) return;
      if (event.defaultPrevented) return;
      handleMouseNav(event);
    },
    { capture: true },
  );
}

export function bindDraftPersistenceFlush(): void {
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      void flushDraftRevisionPending();
    }
  });
  window.addEventListener("pagehide", () => {
    void flushDraftRevisionPending();
  });
}

export function bindKeyboard(): void {
  document.addEventListener("keydown", (event) => {
    if (event.altKey && !event.ctrlKey && !event.metaKey && /^Digit[1-9]$/.test(event.code)) {
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      ) {
        /* allow typing */
      } else {
        const code = event.code;
        const byShortcut = state.savedSearches.find((s) => (s.shortcut || "").trim() === code);
        const idx = Number(code.replace("Digit", "")) - 1;
        const byIndex = !byShortcut ? state.savedSearches[idx] : undefined;
        const hit = byShortcut || byIndex;
        if (hit?.id) {
          event.preventDefault();
          void applySavedSearchView(hit.id);
          return;
        }
      }
    }
    if ((event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === "t") {
      event.preventDefault();
      if (state.searchModalOpen) closeSearchModal();
      else openSearchModal();
      return;
    }
    if ((event.ctrlKey || event.metaKey) && !event.altKey && event.key === "F5") {
      event.preventDefault();
      if (!isTauriRuntime()) {
        toast("Sync IMAP : disponible dans l’app Tauri.");
        return;
      }
      if (state.syncInProgress) {
        toast("Synchronisation déjà en cours.");
        return;
      }
      void syncInbox({ background: state.view === "thread" });
      return;
    }
    if (event.key === "Escape") {
      if (state.settingsAiModal) {
        event.preventDefault();
        finalizeSettingsAiModalClose();
        state.settingsAiModal = null;
        render();
        return;
      }
      if (state.resumeDraftModal) {
        event.preventDefault();
        state.resumeDraftModal = null;
        render();
        return;
      }
      if (state.closeComposeModal) {
        event.preventDefault();
        state.closeComposeModal = null;
        render();
        return;
      }
      if (state.searchModalOpen) {
        event.preventDefault();
        closeSearchModal();
        return;
      }
      if (state.quoteFoldModal) {
        state.quoteFoldModal = null;
        event.preventDefault();
        render();
        return;
      }
      if (state.threadTagsModalOpen) {
        state.threadTagsModalOpen = false;
        event.preventDefault();
        render();
        return;
      }
      if (navCanGoBack() || state.view !== "list") {
        event.preventDefault();
        if (state.view === "thread") clearThreadAiSummaryState();
        void goBack();
        return;
      }
      if (state.aiOpen || state.aiQuickPanelOpen || state.mailboxDigestPanelOpen) {
        event.preventDefault();
        state.aiOpen = false;
        state.aiQuickPanelOpen = false;
        if (mailboxDigestSlotInList()) dismissMailboxDigestPanel();
        render();
        return;
      }
      return;
    }
    if (isEditableKeyboardTarget(event.target)) return;
    if (singleKeyShortcutsBlocked()) return;
    if (!keyboardPlainKey(event)) return;

    const key = event.key.toLowerCase();
    if (key === "n") {
      event.preventDefault();
      void handleAction("compose");
      return;
    }
    if (key === "r" && state.view === "thread") {
      event.preventDefault();
      void handleAction("reply");
      return;
    }
    if (key === "s" && state.view === "thread") {
      event.preventDefault();
      void handleAction("summarize");
      return;
    }
    if (key === "t" && state.view === "thread") {
      event.preventDefault();
      void handleAction("llm-translate-thread");
      return;
    }
    if (key === "m" && state.view === "compose") {
      event.preventDefault();
      void handleAction("toggle-preview");
      return;
    }
    if (key === "tab" && state.view === "thread") {
      event.preventDefault();
      void handleAction("toggle-ai");
      return;
    }
    if (key === "/") {
      event.preventDefault();
      if (state.view === "thread") clearThreadAiSummaryState();
      state.view = "list";
      render();
      const inboxSearch = document.querySelector<HTMLInputElement>("#search-input");
      if (inboxSearch) inboxSearch.focus();
      else openSearchModal();
    }
  });
}
