import type { CleanedMessageView, MailUnsubscribeLink, MessageViewMode } from "../types";
import { collectUnsubscribeLinksFromDoc } from "./mailUnsubscribeLinks";

export function messageHtmlForDisplay(message: CleanedMessageView, mode: MessageViewMode): string | null {
  if (mode === "original") return message.htmlBody?.trim() || null;
  const clean = message.cleanedHtmlBody?.trim();
  if (clean) return clean;
  return message.htmlBody?.trim() || null;
}

export { sanitizeEmailHtml } from "./mailEmailHtmlSanitizeCoreRun";

/**
 * Liens de désabo pour la barre hors shadow — parse DOM léger, sans DOMPurify.
 * Le sanitize complet reste uniquement dans hydrateEmailHtml / buildMailShadowInnerHtml.
 */
export function extractUnsubscribeLinksFromHtml(raw: string): MailUnsubscribeLink[] {
  if (!raw.trim()) return [];
  try {
    const doc = new DOMParser().parseFromString(raw, "text/html");
    return collectUnsubscribeLinksFromDoc(doc);
  } catch {
    return [];
  }
}
