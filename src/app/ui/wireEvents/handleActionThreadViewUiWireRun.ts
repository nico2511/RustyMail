import {
  render,
  state,
  toast,
  tauriErrorMessage,
} from "./depsCore";
import {
  launchTagMailSearchFromRawFamily,
  dismissMailboxDigestPanel,
  mailboxDigestSlotInList,
} from "./depsSearchMail";
import {
  groupCollapsedQuotesByAttribution,
  llmInboxDigestUi,
  persistAiFeaturePrefs,
  setAllAiFeatures,
  normalizeAiPrefsMerged,
  ENABLE_CLEAN_MESSAGE_VIEW,
} from "./depsComposeThread";
import type {
  CleanedMessageView,
} from "../../types";

export async function tryHandleThreadViewUiWire(action: string, element?: HTMLElement): Promise<boolean> {
  switch (action) {
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
      const msg = state.selectedThread.messages.find((x: CleanedMessageView) => x.messageId === mid);
      const raw = msg?.collapsedQuotes ?? [];
      if (!raw.length) return true;
      const merged = groupCollapsedQuotesByAttribution(raw);
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
    case "toggle-mailbox-digest-panel":
      if (mailboxDigestSlotInList()) {
        dismissMailboxDigestPanel();
      } else {
        void llmInboxDigestUi();
      }
      return true;
    default:
      return false;
  }
}
