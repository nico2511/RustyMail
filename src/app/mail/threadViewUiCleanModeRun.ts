import { ENABLE_CLEAN_MESSAGE_VIEW } from "../lib/appUiConstants";
import type { CleanedMessageView, MessageViewMode } from "../types";
import { threadIsAutoMail } from "./threadAutoMail";

export function normalizeForCleanCompare(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

export function hasStructuredHtmlCleaningProvider(message: CleanedMessageView): boolean {
  const p = message.htmlCleaningProvider;
  if (p && p !== "generic") return true;
  const ch = message.cleanedHtmlBody ?? "";
  return (
    ch.includes("rustymail:amazon-digest") ||
    ch.includes("rustymail:deblock-digest") ||
    ch.includes("rustymail:github-digest")
  );
}

export function messagePrefersCleanByDefault(message: CleanedMessageView): boolean {
  if (hasStructuredHtmlCleaningProvider(message)) return true;

  const ch = message.cleanedHtmlBody?.trim();
  const hb = message.htmlBody?.trim();
  if (hb && ch) {
    return normalizeForCleanCompare(ch) !== normalizeForCleanCompare(hb);
  }

  const st = message.sourceText.trim();
  const ct = (message.cleanedText ?? "").trim();
  if (!ct) return false;
  return normalizeForCleanCompare(ct) !== normalizeForCleanCompare(st);
}

export function effectiveMessageViewMode(message: CleanedMessageView, userMode: MessageViewMode): MessageViewMode {
  if (!ENABLE_CLEAN_MESSAGE_VIEW) return "original";
  if (userMode === "original") return "original";
  return messagePrefersCleanByDefault(message) ? "clean" : "original";
}

export function threadSuppressAutoEnvelopeMeta(
  thread: { isNewsletterThread?: boolean },
  message: CleanedMessageView,
  nlListedHere: boolean,
): boolean {
  return threadIsAutoMail(thread) || Boolean(message.isNewsletter) || nlListedHere;
}
