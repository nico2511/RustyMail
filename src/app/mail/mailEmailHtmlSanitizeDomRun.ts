import { normalizeMailHrefForOpen } from "./mailLinkOpen";
import { linkLooksLikeUnsubscribe } from "./mailUnsubscribeLinks";
import { mailUrlLooksRemote, safeDataImageSrc } from "./mailEmailHtmlOutlookStripRun";

export function stripUnsafeInlineStylesInEmailDoc(doc: Document): void {
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
}

export function normalizeEmailLinksInDoc(doc: Document): void {
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
}

export function sanitizeEmailImagesInDoc(doc: Document, allowRemoteImages: boolean): void {
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
}
