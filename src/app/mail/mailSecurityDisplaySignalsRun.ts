import { isAiFeatureEnabled } from "../../aiFeatures";
import type { CleanedMessageView, MailSecuritySignals } from "../types";
import { state } from "../state";
import { securityLlmAugmentStateForMessage } from "./mailSecurityLlmAugmentRun";

export { defaultMailSecuritySignals } from "./mailSecurityDefaultsRun";

export function mailSecurityFindingsForDisplay(
  message: CleanedMessageView,
  ms: MailSecuritySignals,
): MailSecuritySignals["findings"] {
  const { cached, failed, busy } = securityLlmAugmentStateForMessage(message.messageId);
  const mid = message.messageId?.trim();
  if (!isAiFeatureEnabled(state.appPrefs.ai, "featureSecurityLlmEnabled")) {
    return ms.findings ?? [];
  }
  if (mid && cached) {
    return ms.findings ?? [];
  }
  if (mid && failed) {
    return ms.findings ?? [];
  }
  if (mid && busy) {
    return [];
  }
  if (mid) {
    return [];
  }
  return ms.findings ?? [];
}

export function mailSecurityTierClass(ms: MailSecuritySignals): string {
  return ms.severity === "ok"
    ? "mail-security-tier--ok"
    : ms.severity === "attention"
      ? "mail-security-tier--attention"
      : "mail-security-tier--suspicion";
}
