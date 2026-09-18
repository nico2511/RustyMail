import { invoke } from "@tauri-apps/api/core";
import { t } from "../../i18n";
import { MAIL_ACTION_TIMEOUT_MS } from "../core/timeouts";
import { currentAccount } from "../core/accountContext";
import { isTauriRuntime } from "../lib/tauriRuntime";
import { tauriErrorMessage, withTimeout } from "../lib/tauriCommand";
import { toast } from "../lib/toast";
import { render } from "../dispatch";
import { state } from "../state";
import type { ThreadListItem } from "../types";
import { mailboxKind } from "../../mailboxKinds";
import { loadMailboxUnread } from "./mailListView";
import {
  clearThreadsRecentlyRemoved,
  markThreadsRecentlyRemoved,
} from "../../recentlyRemovedThreads";
import { loadNewsletterRules } from "./newsletterRulesLoad";

export async function addNewsletterRuleFromSenderEmail(email: string): Promise<void> {
  if (!email.includes("@") || !isTauriRuntime()) return;
  try {
    await withTimeout(invoke("add_newsletter_rule", { input: email }), MAIL_ACTION_TIMEOUT_MS);
    await loadNewsletterRules();
    toast(t("toast.newsletterRuleAdded"));
    render();
  } catch (e) {
    toast(tauriErrorMessage(e));
  }
}

export async function moveThreadToJunkFromSecurityAction(
  threadId: string,
  sourceMailbox: string,
): Promise<void> {
  const tid = threadId.trim();
  const source = sourceMailbox.trim() || state.selectedMailbox || "INBOX";
  if (!tid || !isTauriRuntime()) return;
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
}

export function appendSecurityFilterToSearchDraft(): void {
  state.searchDraft = ((state.searchDraft || "") + " #security:50").trim();
  state.searchModalOpen = true;
  toast("Filtre #security:50 ajouté — lancez la recherche.");
  render();
}
