import { normalizeMailHrefForOpen } from "./mailLinkOpen";
import { linkLooksLikeUnsubscribe } from "./mailUnsubscribeLinks";
import { mailUrlLooksRemote, safeDataImageSrc } from "./mailEmailHtmlOutlookStripRun";

const DROP_BEFORE_SANITIZE = [
  "script",
  "style",
  "iframe",
  "object",
  "embed",
  "link",
  "meta",
  "base",
  "form",
  "video",
  "audio",
  "svg",
  "math",
  "source",
].join(",");

/** Retire les nœuds actifs (et leur contenu) avant DOMPurify, pour ne pas laisser le CSS en texte visible. */
export function dropActiveContentFromHtml(html: string): string {
  const doc = new DOMParser().parseFromString(html, "text/html");
  doc.querySelectorAll(DROP_BEFORE_SANITIZE).forEach((el) => el.remove());
  return doc.body?.innerHTML ?? "";
}

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

const IMAGE_SIZE_PROPS = /^(width|height|max-width|max-height)$/;

function normalizeImgDimensionAttr(value: string | null): string | null {
  if (!value) return null;
  const raw = value.trim().toLowerCase().replace(/px$/, "");
  if (!/^\d{1,4}$/.test(raw)) return null;
  const n = Number(raw);
  if (n < 1 || n > 4000) return null;
  return String(n);
}

/** Déclaration CSS de taille uniquement (`320px`, `100%`, `auto` pour la hauteur). */
export function sanitizeEmailImageSizeDeclaration(rule: string): string | null {
  const idx = rule.indexOf(":");
  if (idx <= 0) return null;
  const prop = rule.slice(0, idx).trim().toLowerCase();
  const raw = rule.slice(idx + 1).trim().toLowerCase().replace(/\s+/g, "");
  if (!IMAGE_SIZE_PROPS.test(prop)) return null;
  if (/[()"'!\\]|url|expression/.test(raw)) return null;
  if ((prop === "height" || prop === "max-height") && raw === "auto") return `${prop}: auto`;
  const match = raw.match(/^(\d{1,4})(px|%)$/);
  if (!match?.[1] || !match[2]) return null;
  const n = Number(match[1]);
  if (match[2] === "%") {
    if (n < 1 || n > 100) return null;
  } else if (n < 1 || n > 4000) return null;
  return `${prop}: ${n}${match[2]}`;
}

export function sanitizeEmailImagesInDoc(doc: Document, allowRemoteImages: boolean, preserveImageDimensions = false): void {
  if (preserveImageDimensions) {
    doc.querySelectorAll<HTMLElement>("[width], [height]").forEach((el) => {
      if (el.tagName === "IMG") return;
      el.removeAttribute("width");
      el.removeAttribute("height");
    });
  }
  doc.querySelectorAll<HTMLSourceElement>("source").forEach((source) => {
    source.removeAttribute("src");
    source.removeAttribute("srcset");
  });
  doc.querySelectorAll<HTMLImageElement>("img").forEach((img) => {
    if (!preserveImageDimensions) {
      img.removeAttribute("width");
      img.removeAttribute("height");
    } else {
      for (const name of ["width", "height"] as const) {
        const normalized = normalizeImgDimensionAttr(img.getAttribute(name));
        if (normalized == null) img.removeAttribute(name);
        else img.setAttribute(name, normalized);
      }
    }
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
      .flatMap((rule) => {
        const prop = rule.split(":")[0]?.trim().toLowerCase() ?? "";
        if (/^(min-width|min-height)$/.test(prop)) return [];
        const isSize = IMAGE_SIZE_PROPS.test(prop);
        if (!preserveImageDimensions) return isSize ? [] : [rule];
        if (!isSize) return [rule];
        const safe = sanitizeEmailImageSizeDeclaration(rule);
        return safe ? [safe] : [];
      });
    if (!pieces.length) img.removeAttribute("style");
    else img.setAttribute("style", pieces.join("; "));
  });
}
