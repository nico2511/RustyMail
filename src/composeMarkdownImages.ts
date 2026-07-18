/** Markdown compose : placeholders pour grosses images data-URL. */

export const INLINE_DATA_IMAGE_THRESHOLD = 4096;

export function clampPreviewLabelFromAlt(altRaw: string): string {
  const t = altRaw.replace(/\s+/g, " ").trim();
  if (!t) return "capture";
  return t.length > 80 ? `${t.slice(0, 77)}…` : t;
}

export function encodeMarkdownImageAltForDataUrl(altRaw: string): string {
  try {
    const enc = btoa(unescape(encodeURIComponent(altRaw)));
    return enc.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/u, "");
  } catch {
    return btoa(altRaw)
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/u, "");
  }
}

export function decodeMarkdownImageAltFromStored(stored: string): string {
  const pad = stored.length % 4 === 0 ? "" : "=".repeat(4 - (stored.length % 4));
  const b64 = stored.replace(/-/g, "+").replace(/_/g, "/") + pad;
  try {
    return decodeURIComponent(
      Array.prototype.map
        .call(atob(b64), (c: string) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2))
        .join(""),
    );
  } catch {
    try {
      return atob(b64);
    } catch {
      return "";
    }
  }
}

export function iterMarkdownImages(
  markdown: string,
  visit: (full: string, alt: string, url: string) => void,
): void {
  let i = 0;
  const s = markdown;
  while (i < s.length) {
    const bang = s.indexOf("![", i);
    if (bang === -1) break;
    let depth = 1;
    let j = bang + 2;
    let closeBracket = -1;
    while (j < s.length && depth > 0) {
      if (s[j] === "[" && j > 0 && s[j - 1] !== "\\") depth += 1;
      else if (s[j] === "]" && (j === 0 || s[j - 1] !== "\\")) {
        depth -= 1;
        if (depth === 0) {
          closeBracket = j;
          break;
        }
      }
      j += 1;
    }
    if (closeBracket === -1 || s[closeBracket + 1] !== "(") {
      i = bang + 1;
      continue;
    }
    const alt = s.slice(bang + 2, closeBracket);
    const urlStart = closeBracket + 2;
    let depthP = 1;
    let k = urlStart;
    let closeParen = -1;
    while (k < s.length && depthP > 0) {
      if (s[k] === "(") depthP += 1;
      else if (s[k] === ")") {
        depthP -= 1;
        if (depthP === 0) {
          closeParen = k;
          break;
        }
      }
      k += 1;
    }
    if (closeParen === -1) {
      i = bang + 2;
      continue;
    }
    const url = s.slice(urlStart, closeParen).trim();
    const full = s.slice(bang, closeParen + 1);
    visit(full, alt, url);
    i = closeParen + 1;
  }
}

export function collapseLargeDataImageMarkdown(markdown: string): string {
  const parts: string[] = [];
  let last = 0;
  iterMarkdownImages(markdown, (full: string, alt: string, url: string) => {
    const start = markdown.indexOf(full, last);
    if (start === -1) return;
    parts.push(markdown.slice(last, start));
    last = start + full.length;
    if (url.length <= INLINE_DATA_IMAGE_THRESHOLD) {
      parts.push(full);
      return;
    }
    let stored = alt;
    if (alt.includes("]") || alt.includes("![")) {
      stored = `b64:${encodeMarkdownImageAltForDataUrl(alt)}`;
    }
    const labelSource = stored.startsWith("b64:")
      ? decodeMarkdownImageAltFromStored(stored.slice(4))
      : alt;
    const label = clampPreviewLabelFromAlt(labelSource);
    parts.push(`![📷 ${label}](rustymail-inline://${stored})`);
  });
  parts.push(markdown.slice(last));
  return parts.join("");
}

/** Index des grosses images inline du canonical pour réinjecter les data URLs. */
export function buildLargeDataImageMap(canonical: string): Map<string, string> {
  const map = new Map<string, string>();
  iterMarkdownImages(canonical, (full: string, alt: string, url: string) => {
    if (url.length <= INLINE_DATA_IMAGE_THRESHOLD) return;
    let keyAlt = alt;
    if (alt.includes("]") || alt.includes("![")) {
      keyAlt = `b64:${encodeMarkdownImageAltForDataUrl(alt)}`;
    }
    map.set(keyAlt, full);
  });
  return map;
}

export function expandInlineImagePlaceholders(displayMarkdown: string, canonical: string): string {
  const imgs = buildLargeDataImageMap(canonical);
  const out: string[] = [];
  let i = 0;
  const s = displayMarkdown;
  while (i < s.length) {
    const bang = s.indexOf("![", i);
    if (bang === -1) {
      out.push(s.slice(i));
      break;
    }
    out.push(s.slice(i, bang));
    let depth = 1;
    let j = bang + 2;
    let closeBracket = -1;
    while (j < s.length && depth > 0) {
      if (s[j] === "[" && j > 0 && s[j - 1] !== "\\") depth += 1;
      else if (s[j] === "]" && (j === 0 || s[j - 1] !== "\\")) {
        depth -= 1;
        if (depth === 0) {
          closeBracket = j;
          break;
        }
      }
      j += 1;
    }
    if (closeBracket === -1) {
      out.push(s.slice(bang));
      break;
    }
    if (s[closeBracket + 1] !== "(") {
      out.push(s[bang]!);
      i = bang + 1;
      continue;
    }
    const urlStart = closeBracket + 2;
    let depthP = 1;
    let k = urlStart;
    let closeParen = -1;
    while (k < s.length && depthP > 0) {
      if (s[k] === "(") depthP += 1;
      else if (s[k] === ")") {
        depthP -= 1;
        if (depthP === 0) {
          closeParen = k;
          break;
        }
      }
      k += 1;
    }
    if (closeParen === -1) {
      out.push(s.slice(bang));
      break;
    }
    const url = s.slice(urlStart, closeParen).trim();
    const prefix = "rustymail-inline://";
    if (url.startsWith(prefix)) {
      const key = url.slice(prefix.length);
      const full = imgs.get(key);
      out.push(full ?? s.slice(bang, closeParen + 1));
    } else {
      out.push(s.slice(bang, closeParen + 1));
    }
    i = closeParen + 1;
  }
  return out.join("");
}
