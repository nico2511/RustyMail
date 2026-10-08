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

/** Décode les échappements CSS et retire les commentaires avant de chercher une fonction d'image. */
export function decodeCssForUrlScan(input: string): string {
  const noComments = input.replace(/\/\*[\s\S]*?\*\//g, "");
  let out = "";
  for (let i = 0; i < noComments.length; i++) {
    const ch = noComments[i];
    if (ch !== "\\") {
      out += ch;
      continue;
    }
    const rest = noComments.slice(i + 1);
    const hex = /^[0-9a-fA-F]{1,6}/.exec(rest);
    if (hex) {
      const cp = Number.parseInt(hex[0], 16);
      if (cp > 0 && cp <= 0x10ffff) out += String.fromCodePoint(cp);
      i += hex[0].length;
      const next = noComments[i + 1];
      if (next === " " || next === "\t" || next === "\n" || next === "\r" || next === "\f") i += 1;
      continue;
    }
    if (rest.startsWith("\r\n")) {
      i += 2;
      continue;
    }
    if (rest.startsWith("\n") || rest.startsWith("\r") || rest.startsWith("\f")) {
      i += 1;
      continue;
    }
    if (rest.length > 0) {
      out += rest[0];
      i += 1;
    }
  }
  return out.toLowerCase();
}

const REMOTE_IMAGE_FN =
  /(?:-webkit-image-set|image-set|cross-fade|url|image|element|src)\s*\(|@import/i;

export function cssDeclaresRemoteImage(style: string): boolean {
  return REMOTE_IMAGE_FN.test(decodeCssForUrlScan(style));
}

export function stripUnsafeInlineStylesInEmailDoc(doc: Document, allowRemoteImages = true): void {
  doc.querySelectorAll<HTMLElement>("[style]").forEach((el) => {
    const raw = el.getAttribute("style") || "";
    const v = raw.toLowerCase();
    const unsafeLayout =
      /(position\s*:\s*(fixed|sticky))/.test(v) ||
      /(z-index\s*:)/.test(v) ||
      /(behavior\s*:)/.test(v) ||
      /expression\s*\(/.test(v) ||
      /url\s*\(/.test(v);
    const blockedImage = !allowRemoteImages && cssDeclaresRemoteImage(raw);
    if (unsafeLayout || blockedImage) el.removeAttribute("style");
  });
}

const REMOTE_PRESENTATION_ATTRS = ["background", "lowsrc", "dynsrc", "poster"] as const;

/** En mode bloqué, déplace les URL distantes de `background` (et attributs voisins) vers `data-remote-*`. */
export function blockRemoteResourceAttrs(doc: Document, allowRemoteImages: boolean): void {
  if (allowRemoteImages) {
    doc.querySelectorAll<HTMLElement>("[data-remote-background]").forEach((el) => {
      const value = el.getAttribute("data-remote-background");
      if (value) el.setAttribute("background", value);
      el.removeAttribute("data-remote-background");
    });
    doc.querySelectorAll<HTMLElement>("[ping]").forEach((el) => el.removeAttribute("ping"));
    return;
  }
  doc.querySelectorAll<HTMLElement>("*").forEach((el) => {
    for (const attr of REMOTE_PRESENTATION_ATTRS) {
      const value = (el.getAttribute(attr) || "").trim();
      if (!value || !mailUrlLooksRemote(value)) continue;
      el.setAttribute(`data-remote-${attr}`, value);
      el.removeAttribute(attr);
    }
    el.removeAttribute("ping");
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

function parseCssPxSize(ruleValue: string): string | null {
  const m = ruleValue.trim().match(/^(\d+(?:\.\d+)?)\s*px$/i);
  if (!m) return null;
  const n = Math.round(Number(m[1]));
  return n >= 1 && n <= 8000 ? String(n) : null;
}

/** Si DOMPurify a retiré width/height, les reconstituer depuis le style inline. */
export function restoreImgSizeAttrsFromStyle(doc: Document): void {
  doc.querySelectorAll<HTMLImageElement>("img").forEach((img) => {
    const rawStyle = (img.getAttribute("style") || "").trim();
    if (!rawStyle) return;
    for (const piece of rawStyle.split(";")) {
      const [propRaw, ...rest] = piece.split(":");
      const prop = (propRaw || "").trim().toLowerCase();
      const val = rest.join(":").trim();
      if (prop === "width" && !img.getAttribute("width")) {
        const px = parseCssPxSize(val);
        if (px) img.setAttribute("width", px);
      }
      if (prop === "height" && !img.getAttribute("height") && val.toLowerCase() !== "auto") {
        const px = parseCssPxSize(val);
        if (px) img.setAttribute("height", px);
      }
    }
  });
}

export function sanitizeEmailImagesInDoc(doc: Document, allowRemoteImages: boolean): void {
  doc.querySelectorAll<HTMLSourceElement>("source").forEach((source) => {
    source.removeAttribute("src");
    source.removeAttribute("srcset");
  });
  doc.querySelectorAll<HTMLImageElement>("img").forEach((img) => {
    img.removeAttribute("srcset");
    // Conserver width/height (compose TipTap / clients) — ne pas forcer la taille naturelle.
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
    // Garder width/height/max-width inline si présents ; retirer min-* qui écrasent le layout.
    const pieces = rawStyle
      .split(";")
      .map((s) => s.trim())
      .filter(Boolean)
      .filter((rule) => {
        const prop = rule.split(":")[0]?.trim().toLowerCase() ?? "";
        return !/^(min-width|min-height)$/.test(prop);
      });
    if (!pieces.length) img.removeAttribute("style");
    else img.setAttribute("style", pieces.join("; "));
  });
}
