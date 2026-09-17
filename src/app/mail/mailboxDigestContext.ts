import type { Account } from "../../accountSetup";
import { isAiFeatureEnabled } from "../../aiFeatures";
import { state } from "../state";

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

export function requireMailboxDigestDeps(): MailboxDigestDeps {
  if (!deps) throw new Error("mailboxDigest: initMailboxDigest() not called");
  return deps;
}

/** Shared generation counter for in-flight digest requests. */
export let mailboxDigestRequestGen = 0;

export function bumpMailboxDigestRequestGen(): number {
  return ++mailboxDigestRequestGen;
}

export function getMailboxDigestRequestGen(): number {
  return mailboxDigestRequestGen;
}

export function isMailboxDigestRequestCurrent(gen: number): boolean {
  return gen === mailboxDigestRequestGen;
}

export function isMailboxDigestFeatureEnabled(): boolean {
  return isAiFeatureEnabled(state.appPrefs.ai, "featureInboxDigestEnabled");
}
