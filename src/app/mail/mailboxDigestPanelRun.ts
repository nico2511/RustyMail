import { isSavedDraftsVirtualMailbox } from "../../mailboxKinds";
import { render } from "../dispatch";
import { isTauriRuntime } from "../lib/tauriRuntime";
import { state } from "../state";
import {
  bumpMailboxDigestRequestGen,
  isMailboxDigestFeatureEnabled,
  requireMailboxDigestDeps,
} from "./mailboxDigestContext";
import {
  cancelMailboxDigestLiveDebounce,
  enqueueMailboxDigestRefreshWhenIdle,
} from "./mailboxDigestScheduleRun";

export function syncMailboxDigestPanelWithFeaturePref(): void {
  if (isMailboxDigestFeatureEnabled()) return;
  if (
    !state.mailboxDigestPanelOpen &&
    !state.mailboxDigestRefreshing &&
    !state.mailboxDigestLive &&
    !state.mailboxActionBrief &&
    !state.mailboxBriefBannerHtml.trim()
  ) {
    return;
  }
  cancelMailboxDigestLiveDebounce();
  bumpMailboxDigestRequestGen();
  state.mailboxDigestPanelOpen = false;
  state.mailboxDigestLive = false;
  state.mailboxDigestRefreshing = false;
  state.mailboxActionBrief = null;
  state.mailboxBriefBannerHtml = "";
}

export function dismissMailboxDigestPanel(): void {
  cancelMailboxDigestLiveDebounce();
  bumpMailboxDigestRequestGen();
  state.mailboxDigestPanelOpen = false;
  state.mailboxDigestLive = false;
  state.mailboxDigestRefreshing = false;
  state.mailboxActionBrief = null;
  state.mailboxBriefBannerHtml = "";
  state.aiOpen = false;
  render();
}

export function openMailboxDigestPanel(refresh = true): void {
  if (!isMailboxDigestFeatureEnabled()) return;
  if (!mailboxDigestPanelEligible()) return;
  state.mailboxDigestPanelOpen = true;
  render();
  if (!refresh) return;
  cancelMailboxDigestLiveDebounce();
  void enqueueMailboxDigestRefreshWhenIdle(true);
}

export function mailboxDigestPanelEligible(): boolean {
  if (state.view !== "list") return false;
  if (isSavedDraftsVirtualMailbox(state.selectedMailbox ?? "")) return false;
  if (!isTauriRuntime()) return false;
  return Boolean(requireMailboxDigestDeps().currentAccount()?.id?.trim());
}

export function mailboxDigestSlotInList(): boolean {
  if (!isMailboxDigestFeatureEnabled()) return false;
  return state.mailboxDigestPanelOpen && mailboxDigestPanelEligible();
}
