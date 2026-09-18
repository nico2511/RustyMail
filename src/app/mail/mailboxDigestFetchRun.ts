import { invoke } from "@tauri-apps/api/core";

import { isSavedDraftsVirtualMailbox } from "../../mailboxKinds";
import { LLM_INVOKE_TIMEOUT_MS } from "../core/timeouts";
import { render } from "../dispatch";
import { isTauriRuntime } from "../lib/tauriRuntime";
import { state } from "../state";
import type { ActionBriefResult } from "../types";
import {
  bumpMailboxDigestRequestGen,
  isMailboxDigestFeatureEnabled,
  isMailboxDigestRequestCurrent,
  requireMailboxDigestDeps,
} from "./mailboxDigestContext";
import {
  buildMailboxBriefErrorBannerHtml,
  buildMailboxBriefGateBannerHtml,
} from "./mailboxDigestBriefBannerRun";

export { buildMailboxBriefGateBannerHtml } from "./mailboxDigestBriefBannerRun";

export async function fetchMailboxDigestRefresh(): Promise<void> {
  const { withTimeout, currentAccount, refreshLlmRuntimeStatus, tauriErrorMessage } =
    requireMailboxDigestDeps();
  if (!isTauriRuntime()) return;
  if (!isMailboxDigestFeatureEnabled()) return;
  if (!state.mailboxDigestPanelOpen) return;
  if (state.view !== "list") return;
  if (isSavedDraftsVirtualMailbox(state.selectedMailbox ?? "")) return;
  const accountId = currentAccount()?.id?.trim();
  const mailbox = state.selectedMailbox || "INBOX";
  if (!accountId) return;
  const key = `${accountId}|${mailbox}`;
  const gen = bumpMailboxDigestRequestGen();
  state.mailboxDigestRefreshing = true;
  state.mailboxDigestKey = key;
  state.mailboxDigestLive = true;
  render();
  if (!state.llmRuntimeStatus) {
    await refreshLlmRuntimeStatus();
  }
  if (!state.llmRuntimeStatus?.llmGateOpen) {
    if (!isMailboxDigestRequestCurrent(gen)) return;
    state.mailboxActionBrief = null;
    state.mailboxBriefBannerHtml = buildMailboxBriefGateBannerHtml();
    state.mailboxDigestKey = key;
    state.mailboxDigestRefreshing = false;
    render();
    return;
  }
  try {
    const brief = await withTimeout(
      invoke<ActionBriefResult>("llm_inbox_digest", {
        accountId,
        mailbox,
        mode: state.mailboxBriefMode,
      }),
      LLM_INVOKE_TIMEOUT_MS,
    );
    if (!isMailboxDigestRequestCurrent(gen)) return;
    state.mailboxActionBrief = brief;
    state.mailboxBriefBannerHtml = "";
    state.mailboxDigestKey = key;
  } catch (error) {
    if (!isMailboxDigestRequestCurrent(gen)) return;
    const detail = tauriErrorMessage(error).replace(/\s+/g, " ").trim().slice(0, 400);
    const gateLike =
      /moteur ia/i.test(detail) ||
      /openrouter/i.test(detail) ||
      /llama-server/i.test(detail) ||
      /fonctionnalité ia est désactivée/i.test(detail);
    state.mailboxActionBrief = null;
    state.mailboxBriefBannerHtml = gateLike
      ? buildMailboxBriefGateBannerHtml()
      : buildMailboxBriefErrorBannerHtml(detail);
    state.mailboxDigestKey = key;
    console.warn("llm_inbox_digest", error);
  } finally {
    if (isMailboxDigestRequestCurrent(gen)) {
      state.mailboxDigestRefreshing = false;
      render();
    }
  }
}
