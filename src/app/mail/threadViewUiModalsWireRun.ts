import { ENABLE_CLEAN_MESSAGE_VIEW } from "../lib/appUiConstants";
import { render } from "../dispatch";
import { state } from "../state";
import type { CleanedMessageView } from "../types";
import { groupCollapsedQuotesByAttribution } from "./collapsedQuotesGroup";
import { launchTagMailSearchFromRawFamily } from "./searchLaunchPresetsRun";

export async function tryHandleThreadViewUiModalsWire(action: string, element?: HTMLElement): Promise<boolean> {
  switch (action) {
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
        foldedLines: raw.length,
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
    default:
      return false;
  }
}
