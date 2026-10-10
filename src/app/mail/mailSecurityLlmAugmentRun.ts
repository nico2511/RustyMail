import { invoke } from "@tauri-apps/api/core";
import { isAiFeatureEnabled } from "../../aiFeatures";
import { render } from "../dispatch";
import { isTauriRuntime } from "../lib/tauriRuntime";
import type { CleanedMessageView, MailSecuritySignals } from "../types";
import { state } from "../state";
import { defaultMailSecuritySignals } from "./mailSecurityDefaultsRun";
import { buildMailSecurityLlmContext } from "./mailSecurityLlmContextRun";

const securityLlmAugmentBusy: Record<string, boolean> = {};
const securityLlmAugmentCache: Record<string, MailSecuritySignals> = {};
const securityLlmAugmentFailed: Record<string, boolean> = {};
let securityAugmentRenderQueued = false;

/** File d’attente sérialisée — évite N appels LLM + N re-render en parallèle à l’ouverture. */
const securityLlmQueue: CleanedMessageView[] = [];
let securityLlmQueueRunning = false;
let securityLlmEpoch = 0;

function scheduleSecurityAugmentRender(): void {
  if (securityAugmentRenderQueued) return;
  securityAugmentRenderQueued = true;
  requestAnimationFrame(() => {
    securityAugmentRenderQueued = false;
    if (state.view !== "thread") return;
    render();
  });
}

export function activeSecurityLlmAugmentCount(): number {
  let n = 0;
  for (const v of Object.values(securityLlmAugmentBusy)) {
    if (v) n += 1;
  }
  return n;
}

export function normalizedMailSecurity(message: CleanedMessageView): MailSecuritySignals {
  const mid = message.messageId?.trim();
  const cached = mid ? securityLlmAugmentCache[mid] : undefined;
  if (cached) return cached;
  return message.mailSecurity ?? defaultMailSecuritySignals();
}

export function isSecurityLlmAugmentPending(messageId: string): boolean {
  const mid = messageId.trim();
  if (!mid) return false;
  return Boolean(
    securityLlmAugmentBusy[mid] && !securityLlmAugmentCache[mid] && !securityLlmAugmentFailed[mid],
  );
}

export function securityLlmAugmentStateForMessage(messageId: string | undefined): {
  cached: boolean;
  failed: boolean;
  busy: boolean;
} {
  const mid = messageId?.trim();
  if (!mid) return { cached: false, failed: false, busy: false };
  return {
    cached: Boolean(securityLlmAugmentCache[mid]),
    failed: Boolean(securityLlmAugmentFailed[mid]),
    busy: Boolean(securityLlmAugmentBusy[mid]),
  };
}

/** Invalide la file LLM si on quitte / change de fil (les invokes déjà partis restent, sans re-render). */
export function cancelPendingSecurityLlmAugments(): void {
  securityLlmEpoch += 1;
  securityLlmQueue.length = 0;
  for (const mid of Object.keys(securityLlmAugmentBusy)) {
    delete securityLlmAugmentBusy[mid];
  }
}

async function runSecurityLlmQueue(epoch: number): Promise<void> {
  if (securityLlmQueueRunning) return;
  securityLlmQueueRunning = true;
  try {
    while (securityLlmQueue.length && epoch === securityLlmEpoch) {
      const message = securityLlmQueue.shift()!;
      const mid = message.messageId?.trim();
      if (!mid) continue;
      if (securityLlmAugmentCache[mid] || securityLlmAugmentFailed[mid]) {
        delete securityLlmAugmentBusy[mid];
        continue;
      }
      const base = message.mailSecurity ?? defaultMailSecuritySignals();
      try {
        const context = buildMailSecurityLlmContext(message, state.selectedThread?.subject);
        const augmented = await invoke<MailSecuritySignals>("llm_security_signals_augment", {
          payload: { signals: base, context },
        });
        if (epoch !== securityLlmEpoch) return;
        securityLlmAugmentCache[mid] = augmented;
      } catch {
        if (epoch !== securityLlmEpoch) return;
        securityLlmAugmentFailed[mid] = true;
      } finally {
        delete securityLlmAugmentBusy[mid];
      }
      if (
        epoch === securityLlmEpoch &&
        state.view === "thread" &&
        state.selectedThread?.messages?.some((m) => m.messageId === mid)
      ) {
        scheduleSecurityAugmentRender();
      }
    }
  } finally {
    securityLlmQueueRunning = false;
    if (securityLlmQueue.length && epoch === securityLlmEpoch) {
      void runSecurityLlmQueue(epoch);
    }
  }
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
  securityLlmQueue.push(message);
  void runSecurityLlmQueue(securityLlmEpoch);
}
