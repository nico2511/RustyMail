import { invoke } from "@tauri-apps/api/core";

import { isAiFeatureEnabled } from "../../aiFeatures";
import { isSavedDraftsVirtualMailbox } from "../../mailboxKinds";
import { escapeAttr, escapeHtml } from "../../ui/sanitize";
import {
  LLM_INVOKE_TIMEOUT_MS,
  MAILBOX_DIGEST_DEBOUNCE_MS,
  MAILBOX_DIGEST_IDLE_CALLBACK_TIMEOUT_MS,
} from "../core/timeouts";
import { render } from "../dispatch";
import { isTauriRuntime } from "../lib/tauriRuntime";
import { state } from "../state";
import type { ActionBriefResult } from "../types";
import type { Account } from "../../accountSetup";
import { renderBriefMailItemCard, renderBriefMailViewShell } from "../ui/briefMailShell";

export type MailboxDigestDeps = {
  withTimeout: <T>(promise: Promise<T>, timeoutMs: number) => Promise<T>;
  currentAccount: () => Account | undefined;
  refreshLlmRuntimeStatus: (forceHardwareRescan?: boolean) => Promise<void>;
  tauriErrorMessage: (error: unknown) => string;
};

let deps: MailboxDigestDeps | null = null;

export function initMailboxDigest(moduleDeps: MailboxDigestDeps): void {
  deps = moduleDeps;
}

function requireDeps(): MailboxDigestDeps {
  if (!deps) throw new Error("mailboxDigest: initMailboxDigest() not called");
  return deps;
}

let mailboxDigestRefreshTimer: ReturnType<typeof setTimeout> | null = null;

let mailboxDigestIdleHandle: number | null = null;

let mailboxDigestRequestGen = 0;

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
  const accountId = requireDeps().currentAccount()?.id?.trim();
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

export function isMailboxDigestFeatureEnabled(): boolean {
  return isAiFeatureEnabled(state.appPrefs.ai, "featureInboxDigestEnabled");
}

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
  mailboxDigestRequestGen++;
  state.mailboxDigestPanelOpen = false;
  state.mailboxDigestLive = false;
  state.mailboxDigestRefreshing = false;
  state.mailboxActionBrief = null;
  state.mailboxBriefBannerHtml = "";
}

export function dismissMailboxDigestPanel(): void {
  cancelMailboxDigestLiveDebounce();
  mailboxDigestRequestGen++;
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

/** Incrémente la génération et efface l’état digest (changement compte / dossier). */
export function resetMailboxDigestForNavigation(): void {
  mailboxDigestRequestGen++;
  state.mailboxBriefBannerHtml = "";
  state.mailboxActionBrief = null;
  state.mailboxDigestKey = "";
  state.mailboxDigestLive = false;
  state.mailboxDigestRefreshing = false;
  cancelMailboxDigestLiveDebounce();
}

export function buildMailboxBriefGateBannerHtml(): string {
  const hint = state.llmRuntimeStatus?.llmGateHint?.trim();
  const detail =
    hint ||
    "Activez OpenRouter (clé + modèle) ou llama-server (URL + modèle, ou lancement auto avec GGUF) dans Paramètres → IA & dictée.";
  const escaped = escapeHtml(detail);
  const inner = renderBriefMailItemCard(
    `<p class="thread-zen-par">Aucun moteur IA n’est prêt pour générer le brief.</p>
    <p class="thread-zen-par dim">${escaped}</p>
    <p class="thread-zen-par dim">Ouvrez <strong>Paramètres → IA & dictée</strong>, puis cliquez <strong>Rafraîchir</strong>.</p>`,
  );
  return renderBriefMailViewShell(inner, { kicker: "Brief indisponible" });
}

function buildMailboxBriefErrorBannerHtml(detail: string): string {
  const raw = detail.replace(/\s+/g, " ").trim();
  const jsonLike =
    /json invalide|eof while parsing|expected value|trailing characters/i.test(raw);
  const text = jsonLike
    ? `La réponse du modèle était incomplète ou mal formée (souvent une limite de longueur). Essayez le mode Quick, puis Rafraîchir.`
    : raw.slice(0, 400);
  const inner = renderBriefMailItemCard(
    `<p class="thread-zen-par"><strong>Brief indisponible</strong></p>
    <p class="thread-zen-par dim">${escapeHtml(text)}</p>
    <p class="thread-zen-par dim">Cliquez <strong>Rafraîchir</strong> pour relancer.</p>`,
  );
  return renderBriefMailViewShell(inner, { kicker: "Brief indisponible" });
}

export async function fetchMailboxDigestRefresh(): Promise<void> {
  const { withTimeout, currentAccount, refreshLlmRuntimeStatus, tauriErrorMessage } = requireDeps();
  if (!isTauriRuntime()) return;
  if (!isAiFeatureEnabled(state.appPrefs.ai, "featureInboxDigestEnabled")) return;
  if (!state.mailboxDigestPanelOpen) return;
  if (state.view !== "list") return;
  if (isSavedDraftsVirtualMailbox(state.selectedMailbox ?? "")) return;
  const accountId = currentAccount()?.id?.trim();
  const mailbox = state.selectedMailbox || "INBOX";
  if (!accountId) return;
  const key = `${accountId}|${mailbox}`;
  const gen = ++mailboxDigestRequestGen;
  state.mailboxDigestRefreshing = true;
  state.mailboxDigestKey = key;
  state.mailboxDigestLive = true;
  render();
  if (!state.llmRuntimeStatus) {
    await refreshLlmRuntimeStatus();
  }
  if (!state.llmRuntimeStatus?.llmGateOpen) {
    if (gen !== mailboxDigestRequestGen) return;
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
    if (gen !== mailboxDigestRequestGen) return;
    state.mailboxActionBrief = brief;
    state.mailboxBriefBannerHtml = "";
    state.mailboxDigestKey = key;
  } catch (error) {
    if (gen !== mailboxDigestRequestGen) return;
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
    if (gen === mailboxDigestRequestGen) {
      state.mailboxDigestRefreshing = false;
      render();
    }
  }
}

export function mailboxDigestPanelEligible(): boolean {
  if (state.view !== "list") return false;
  if (isSavedDraftsVirtualMailbox(state.selectedMailbox ?? "")) return false;
  if (!isTauriRuntime()) return false;
  return Boolean(requireDeps().currentAccount()?.id?.trim());
}

export function mailboxDigestSlotInList(): boolean {
  if (!isMailboxDigestFeatureEnabled()) return false;
  return state.mailboxDigestPanelOpen && mailboxDigestPanelEligible();
}

export function renderMailboxDigestTriggerButton(extraClass = ""): string {
  if (!isMailboxDigestFeatureEnabled()) return "";
  if (!mailboxDigestPanelEligible()) return "";
  const open = mailboxDigestSlotInList();
  const busy = state.mailboxDigestRefreshing && open;
  const title = open ? "Fermer le brief d’action du dossier" : "Ouvrir le brief d’action IA du dossier";
  const cls = ["ghost-button", "status-bar-digest-trigger", extraClass, open ? "is-active" : ""]
    .filter(Boolean)
    .join(" ");
  return `<button type="button" class="${cls}" data-action="toggle-mailbox-digest-panel" aria-expanded="${open ? "true" : "false"}" title="${escapeAttr(title)}">${
    busy ? `<span class="mini-sync"><span class="spinner" aria-hidden="true"></span><span>Brief</span></span>` : "Brief"
  }</button>`;
}
