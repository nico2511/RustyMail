import {
  currentAccount,
  loadMailboxUnread,
  render,
  state,
  toast,
  invoke,
  t,
  isTauriRuntime,
  MAIL_ACTION_TIMEOUT_MS,
  withTimeout,
  tauriErrorMessage,
} from "./depsCore";
import {
  launchTagMailSearchFromRawFamily,
  dismissMailboxDigestPanel,
  mailboxDigestSlotInList,
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
  llmInboxDigestUi,
  persistAiFeaturePrefs,
  setAllAiFeatures,
  normalizeAiPrefsMerged,
  markThreadsRecentlyRemoved,
  clearThreadsRecentlyRemoved,
  mailboxKind,
  ENABLE_CLEAN_MESSAGE_VIEW,
} from "./depsComposeThread";
import type {
  CleanedMessageView,
  ThreadListItem,
} from "../../types";

export async function tryHandleThreadViewWire(action: string, element?: HTMLElement): Promise<boolean> {
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
    case "reply":
      await prepareReply();
      return true;
    case "reply-one":
      await prepareReplyToMessage(element?.dataset.msgId ?? "");
      return true;
    case "reply-all":
      await prepareReplyAll();
      return true;
    case "forward":
      await prepareForward();
      return true;
    case "forward-one":
      await prepareForwardToMessage(element?.dataset.msgId ?? "");
      return true;
    case "download-all-attachments": {
      const mid = element?.dataset.msgId?.trim();
      if (mid) void downloadAllAttachmentsForMessage(mid);
      return true;
    }
    case "contacts-entity-open": {
      const href = element?.dataset.href?.trim();
      if (href) void openExternalFromMailHref(href);
      return true;
    }
    case "contacts-entity-mailto": {
      const email = element?.dataset.email?.trim();
      if (email) void openExternalFromMailHref(`mailto:${email}`);
      return true;
    }
    case "mail-unsubscribe-open": {
      const href = decodeHtmlEntitiesLoose(element?.dataset.href?.trim() ?? "");
      const normalized = normalizeMailHrefForOpen(href);
      if (normalized) void openExternalFromMailHref(normalized);
      else toast("Lien de désabonnement invalide.");
      return true;
    }
    case "security-mark-newsletter": {
      const email = element?.dataset.senderEmail?.trim() ?? "";
      if (!email.includes("@") || !isTauriRuntime()) return true;
      void (async () => {
        try {
          await withTimeout(invoke("add_newsletter_rule", { input: email }), MAIL_ACTION_TIMEOUT_MS);
          await loadNewsletterRules();
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
        const spam = state.mailboxes.find((m: string) => mailboxKind(m) === "spam");
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
          state.threads = state.threads.filter((threadRow: ThreadListItem) => String(threadRow.id) !== tid);
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
