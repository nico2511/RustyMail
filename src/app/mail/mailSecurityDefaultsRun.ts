import type { MailSecuritySignals } from "../types";

export function defaultMailSecuritySignals(): MailSecuritySignals {
  return {
    severity: "ok",
    summaryFr: "Rien d’inhabituel détecté selon les règles locales.",
    findings: [],
  };
}
