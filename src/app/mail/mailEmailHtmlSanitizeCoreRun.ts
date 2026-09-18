import DOMPurify from "dompurify";
import { escapeHtml } from "../../ui/sanitize";
import type { MailUnsubscribeLink } from "../types";
import { flattenNestedParagraphInDocument } from "../lib/htmlMessage";
import {
  collectUnsubscribeLinksFromDoc,
  hideRelocatedUnsubscribeInDoc,
} from "./mailUnsubscribeLinks";
import { stripOutlookDisplayNoiseFromDoc } from "./mailEmailHtmlOutlookStripRun";
import {
  normalizeEmailLinksInDoc,
  sanitizeEmailImagesInDoc,
  stripUnsafeInlineStylesInEmailDoc,
} from "./mailEmailHtmlSanitizeDomRun";

export function sanitizeEmailHtml(
  input: string,
  opts?: { allowRemoteImages?: boolean; relocateUnsubscribe?: boolean; stripOutlookNoise?: boolean },
): { html: string; unsubscribeLinks: MailUnsubscribeLink[] } {
  const allowRemoteImages = opts?.allowRemoteImages === true;
  const relocateUnsubscribe = opts?.relocateUnsubscribe !== false;
  const stripOutlookNoise = opts?.stripOutlookNoise === true;
  try {
    const clean = DOMPurify.sanitize(String(input), {
      FORBID_TAGS: ["script", "iframe", "object", "embed", "link", "meta", "base", "form", "input", "button", "textarea", "select"],
      FORBID_ATTR: ["onerror", "onload", "onclick", "onmouseover", "onfocus", "onblur"],
      ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto|cid):|data:image\/)/i,
    });
    const doc = new DOMParser().parseFromString(String(clean), "text/html");
    flattenNestedParagraphInDocument(doc);
    stripUnsafeInlineStylesInEmailDoc(doc);
    normalizeEmailLinksInDoc(doc);
    sanitizeEmailImagesInDoc(doc, allowRemoteImages);
    const unsubscribeLinks = collectUnsubscribeLinksFromDoc(doc);
    if (relocateUnsubscribe && unsubscribeLinks.length) hideRelocatedUnsubscribeInDoc(doc);
    const hasConversationReport = Boolean(doc.querySelector("article.rm-conversation-report"));
    if (stripOutlookNoise && !hasConversationReport) stripOutlookDisplayNoiseFromDoc(doc);
    return { html: doc.body?.innerHTML ?? String(clean), unsubscribeLinks };
  } catch {
    return { html: escapeHtml(input), unsubscribeLinks: [] };
  }
}
