import type { CleanedMessageView, MailUnsubscribeLink, MessageViewMode } from "../types";
import { sanitizeEmailHtml } from "./mailEmailHtmlSanitizeCoreRun";

export function messageHtmlForDisplay(message: CleanedMessageView, mode: MessageViewMode): string | null {
  if (mode === "original") return message.htmlBody?.trim() || null;
  const clean = message.cleanedHtmlBody?.trim();
  if (clean) return clean;
  return message.htmlBody?.trim() || null;
}

export { sanitizeEmailHtml } from "./mailEmailHtmlSanitizeCoreRun";

export function extractUnsubscribeLinksFromHtml(raw: string): MailUnsubscribeLink[] {
  if (!raw.trim()) return [];
  return sanitizeEmailHtml(raw, { allowRemoteImages: false, relocateUnsubscribe: false }).unsubscribeLinks;
}
