import { isAiFeatureEnabled } from "../../aiFeatures";
import { isSavedDraftsVirtualMailbox } from "../../mailboxKinds";
import {
  MAILBOX_DIGEST_DEBOUNCE_MS,
  MAILBOX_DIGEST_IDLE_CALLBACK_TIMEOUT_MS,
} from "../core/timeouts";
import { isTauriRuntime } from "../lib/tauriRuntime";
import { state } from "../state";
import {
  bumpMailboxDigestRequestGen,
  isMailboxDigestFeatureEnabled,
  requireMailboxDigestDeps,
} from "./mailboxDigestContext";
import { fetchMailboxDigestRefresh } from "./mailboxDigestFetchRun";

let mailboxDigestRefreshTimer: ReturnType<typeof setTimeout> | null = null;
let mailboxDigestIdleHandle: number | null = null;

function cancelMailboxDigestIdleHandle(): void {
  if (mailboxDigestIdleHandle === null) return;
  if (typeof window.cancelIdleCallback === "function") {
    window.cancelIdleCallback(mailboxDigestIdleHandle);
  } else {
    window.clearTimeout(mailboxDigestIdleHandle);
  }
  mailboxDigestIdleHandle = null;
}

export function cancelMailboxDigestLiveDebounce(): void {
  if (mailboxDigestRefreshTimer !== null) {
    window.clearTimeout(mailboxDigestRefreshTimer);
    mailboxDigestRefreshTimer = null;
  }
  cancelMailboxDigestIdleHandle();
}

export function enqueueMailboxDigestRefreshWhenIdle(immediate: boolean): void {
  if (!isMailboxDigestFeatureEnabled()) return;
  if (!state.mailboxDigestPanelOpen) return;
  cancelMailboxDigestIdleHandle();
  const run = () => {
    mailboxDigestIdleHandle = null;
    void fetchMailboxDigestRefresh();
  };
  if (immediate) {
    mailboxDigestIdleHandle = window.setTimeout(run, 0) as unknown as number;
    return;
  }
  if (typeof window.requestIdleCallback === "function") {
    mailboxDigestIdleHandle = window.requestIdleCallback(run, {
      timeout: MAILBOX_DIGEST_IDLE_CALLBACK_TIMEOUT_MS,
    });
  } else {
    mailboxDigestIdleHandle = window.setTimeout(run, 220) as unknown as number;
  }
}

export function scheduleMailboxDigestRefresh(): void {
  if (!isTauriRuntime()) return;
  if (!isMailboxDigestFeatureEnabled()) return;
  if (!state.mailboxDigestPanelOpen) return;
  if (state.view !== "list") return;
  if (isSavedDraftsVirtualMailbox(state.selectedMailbox ?? "")) return;
  const accountId = requireMailboxDigestDeps().currentAccount()?.id?.trim();
  const mailbox = state.selectedMailbox || "INBOX";
  if (!accountId) return;
  if (mailboxDigestRefreshTimer !== null) {
    window.clearTimeout(mailboxDigestRefreshTimer);
  }
  mailboxDigestRefreshTimer = window.setTimeout(() => {
    mailboxDigestRefreshTimer = null;
    enqueueMailboxDigestRefreshWhenIdle(false);
  }, MAILBOX_DIGEST_DEBOUNCE_MS);
}

export function resetMailboxDigestForNavigation(): void {
  bumpMailboxDigestRequestGen();
  state.mailboxBriefBannerHtml = "";
  state.mailboxActionBrief = null;
  state.mailboxDigestKey = "";
  state.mailboxDigestLive = false;
  state.mailboxDigestRefreshing = false;
  cancelMailboxDigestLiveDebounce();
}
