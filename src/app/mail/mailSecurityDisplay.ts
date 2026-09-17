import { invoke } from "@tauri-apps/api/core";
import { isAiFeatureEnabled } from "../../aiFeatures";
import { render } from "../dispatch";
import { isTauriRuntime } from "../lib/tauriRuntime";
import type { CleanedMessageView, MailSecuritySignals } from "../types";
import { state } from "../state";

const securityLlmAugmentBusy: Record<string, boolean> = {};
const securityLlmAugmentCache: Record<string, MailSecuritySignals> = {};
const securityLlmAugmentFailed: Record<string, boolean> = {};

export function activeSecurityLlmAugmentCount(): number {
  let n = 0;
  for (const v of Object.values(securityLlmAugmentBusy)) {
    if (v) n += 1;
  }
  return n;
}

export function defaultMailSecuritySignals(): MailSecuritySignals {
  return {
    severity: "ok",
    summaryFr: "Rien d’inhabituel détecté selon les règles locales.",
    findings: [],
  };
}

export function normalizedMailSecurity(message: CleanedMessageView): MailSecuritySignals {
  const mid = message.messageId?.trim();
  const cached = mid ? securityLlmAugmentCache[mid] : undefined;
  if (cached) return cached;
  return message.mailSecurity ?? defaultMailSecuritySignals();
}

export function mailSecurityFindingsForDisplay(
  message: CleanedMessageView,
  ms: MailSecuritySignals,
): MailSecuritySignals["findings"] {
  const mid = message.messageId?.trim();
  if (!isAiFeatureEnabled(state.appPrefs.ai, "featureSecurityLlmEnabled")) {
    return ms.findings ?? [];
  }
  if (mid && securityLlmAugmentCache[mid]) {
    return ms.findings ?? [];
  }
  if (mid && securityLlmAugmentFailed[mid]) {
    return ms.findings ?? [];
  }
  if (mid && securityLlmAugmentBusy[mid]) {
    return [];
  }
  if (mid) {
    return [];
  }
  return ms.findings ?? [];
}

export function isSecurityLlmAugmentPending(messageId: string): boolean {
  const mid = messageId.trim();
  if (!mid) return false;
  return Boolean(
    securityLlmAugmentBusy[mid] && !securityLlmAugmentCache[mid] && !securityLlmAugmentFailed[mid],
  );
}

export function scheduleSecurityLlmAugment(message: CleanedMessageView): void {
  const mid = message.messageId?.trim();
  if (!mid || !isTauriRuntime()) return;
  if (!isAiFeatureEnabled(state.appPrefs.ai, "featureSecurityLlmEnabled")) return;
  const base = message.mailSecurity ?? defaultMailSecuritySignals();
  if (base.severity === "ok") return;
  if (securityLlmAugmentCache[mid] || securityLlmAugmentBusy[mid]) return;
  delete securityLlmAugmentFailed[mid];
  securityLlmAugmentBusy[mid] = true;
  void (async () => {
    try {
      const augmented = await invoke<MailSecuritySignals>("llm_security_signals_augment", {
        payload: base,
      });
      securityLlmAugmentCache[mid] = augmented;
      if (state.view === "thread" && state.selectedThread?.messages?.some((m) => m.messageId === mid)) {
        render();
      }
    } catch {
      securityLlmAugmentFailed[mid] = true;
    } finally {
      delete securityLlmAugmentBusy[mid];
      if (state.view === "thread" && state.selectedThread?.messages?.some((m) => m.messageId === mid)) {
        render();
      }
    }
  })();
}

export function mailSecurityTierClass(ms: MailSecuritySignals): string {
  return ms.severity === "ok"
    ? "mail-security-tier--ok"
    : ms.severity === "attention"
      ? "mail-security-tier--attention"
      : "mail-security-tier--suspicion";
}
