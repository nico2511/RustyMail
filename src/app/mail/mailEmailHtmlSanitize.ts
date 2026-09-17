import DOMPurify from "dompurify";
import { escapeHtml } from "../../ui/sanitize";
import type { CleanedMessageView, MailUnsubscribeLink, MessageViewMode } from "../types";
import { flattenNestedParagraphInDocument } from "../lib/htmlMessage";
import { normalizeMailHrefForOpen } from "./mailLinkOpen";
import {
  collectUnsubscribeLinksFromDoc,
  hideRelocatedUnsubscribeInDoc,
  linkLooksLikeUnsubscribe,
} from "./mailUnsubscribeLinks";

export function messageHtmlForDisplay(message: CleanedMessageView, mode: MessageViewMode): string | null {
  if (mode === "original") return message.htmlBody?.trim() || null;
  const clean = message.cleanedHtmlBody?.trim();
  if (clean) return clean;
  return message.htmlBody?.trim() || null;
}

function mailUrlLooksRemote(raw: string): boolean {
  return /^https?:\/\//i.test(raw.trim()) || raw.trim().startsWith("//");
}

function safeDataImageSrc(raw: string): boolean {
  return /^data:image\/(?:png|jpe?g|gif|webp|bmp);base64,/i.test(raw.trim());
}

function stripOutlookDisplayNoiseFromDoc(doc: Document): void {
  const ids = ["Signature", "x_Signature", "signature", "divRplyFwdMsg", "x_divRplyFwdMsg"];
  for (const id of ids) {
    doc.getElementById(id)?.remove();
  }
  doc.querySelectorAll("[id*='LSI_marker']").forEach((el) => el.remove());
  doc.querySelectorAll('img[data-outlook-trace], img[id*="x0000_i"], img[id*="_x0000_"]').forEach((img) => {
    const wrap = img.parentElement;
    img.remove();
    if (wrap && wrap.tagName === "SPAN" && !(wrap.textContent ?? "").trim()) wrap.remove();
  });
  const reQuote = /(?:de\s*:|from\s*:|-----original message-----).*?(?:envoy[ée]\s*:|sent\s*:).*?(?:objet\s*:|subject\s*:)/is;
  const quoteBlocks = [...doc.querySelectorAll<HTMLElement>("div, p, blockquote")]
    .map((el) => ({ el, text: (el.textContent ?? "").replace(/\u00a0/g, " ") }))
    .filter(({ text }) => text.length > 0 && text.length <= 5000 && reQuote.test(text))
    .sort((a, b) => a.text.length - b.text.length);
  for (const { el } of quoteBlocks) {
    if (el.isConnected) el.remove();
  }
}

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
    doc.querySelectorAll<HTMLElement>("[style]").forEach((el) => {
      const v = (el.getAttribute("style") || "").toLowerCase();
      if (
        /(position\s*:\s*(fixed|sticky))/.test(v) ||
        /(z-index\s*:)/.test(v) ||
        /(behavior\s*:)/.test(v) ||
        /url\s*\(/.test(v) ||
        /expression\s*\(/.test(v)
      ) {
        el.removeAttribute("style");
      }
    });
    doc.querySelectorAll<HTMLAnchorElement>("a[href]").forEach((a) => {
      const href = a.getAttribute("href") || "";
      const normalized = normalizeMailHrefForOpen(href);
      if (!normalized) {
        a.removeAttribute("href");
        a.removeAttribute("target");
        a.removeAttribute("rel");
        a.classList.add("mail-link-disabled");
        return;
      }
      a.setAttribute("href", normalized);
      a.rel = "noreferrer noopener";
      a.target = "_blank";
      if (linkLooksLikeUnsubscribe(a)) {
        a.classList.add("mail-unsubscribe-link");
        if (!a.getAttribute("aria-label")) {
          a.setAttribute("aria-label", "Lien de désinscription ou de gestion des envois");
        }
      }
    });
    doc.querySelectorAll<HTMLImageElement>("img").forEach((img) => {
      img.removeAttribute("width");
      img.removeAttribute("height");
      img.removeAttribute("srcset");
      const src = (img.getAttribute("src") || "").trim();
      if (src && mailUrlLooksRemote(src) && !allowRemoteImages) {
        img.setAttribute("data-remote-src", src);
        img.removeAttribute("src");
        img.classList.add("mail-remote-image-blocked");
        if (!img.getAttribute("alt")) img.setAttribute("alt", "Image distante bloquée");
      } else if (src && /^data:image\//i.test(src) && !safeDataImageSrc(src)) {
        img.removeAttribute("src");
        img.classList.add("mail-image-blocked");
        if (!img.getAttribute("alt")) img.setAttribute("alt", "Image data non autorisée");
      }
      const rawStyle = (img.getAttribute("style") || "").trim();
      if (!rawStyle) return;
      const pieces = rawStyle
        .split(";")
        .map((s) => s.trim())
        .filter(Boolean)
        .filter((rule) => {
          const prop = rule.split(":")[0]?.trim().toLowerCase() ?? "";
          return !/^(width|height|max-width|max-height|min-width|min-height)$/.test(prop);
        });
      if (!pieces.length) img.removeAttribute("style");
      else img.setAttribute("style", pieces.join("; "));
    });
    const unsubscribeLinks = collectUnsubscribeLinksFromDoc(doc);
    if (relocateUnsubscribe && unsubscribeLinks.length) hideRelocatedUnsubscribeInDoc(doc);
    const hasConversationReport = Boolean(doc.querySelector("article.rm-conversation-report"));
    if (stripOutlookNoise && !hasConversationReport) stripOutlookDisplayNoiseFromDoc(doc);
    return { html: doc.body?.innerHTML ?? String(clean), unsubscribeLinks };
  } catch {
    return { html: escapeHtml(input), unsubscribeLinks: [] };
  }
}

export function extractUnsubscribeLinksFromHtml(raw: string): MailUnsubscribeLink[] {
  if (!raw.trim()) return [];
  return sanitizeEmailHtml(raw, { allowRemoteImages: false, relocateUnsubscribe: false }).unsubscribeLinks;
}
