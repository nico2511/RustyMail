import { escapeAttr } from "../../ui/sanitize";

/** Corps HTML hors attributs du shell — évite base64 synchrone pendant renderThread. */
const mailHtmlPayloadByMessageId = new Map<string, string>();

export function utf8StringToBase64(s: string): string {
  const bytes = new TextEncoder().encode(s);
  const chunk = 0x2000;
  let bin = "";
  for (let i = 0; i < bytes.length; i += chunk) {
    const end = Math.min(i + chunk, bytes.length);
    bin += String.fromCharCode(...bytes.subarray(i, end));
  }
  return btoa(bin);
}

export function base64ToUtf8String(b64: string): string {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

/** Empreinte légère pour réconcilier les hosts sans embarquer le corps en base64. */
export function mailHtmlContentFingerprint(html: string): string {
  let h = html.length >>> 0;
  const head = Math.min(96, html.length);
  for (let i = 0; i < head; i++) h = (Math.imul(h, 31) + html.charCodeAt(i)) >>> 0;
  const start = Math.max(0, html.length - 96);
  for (let i = start; i < html.length; i++) h = (Math.imul(h, 31) + html.charCodeAt(i)) >>> 0;
  return `${html.length.toString(36)}:${h.toString(36)}`;
}

export function peekMailHtmlPayload(messageId: string): string | undefined {
  const mid = messageId.trim();
  if (!mid) return undefined;
  return mailHtmlPayloadByMessageId.get(mid);
}

export function clearMailHtmlPayloads(): void {
  mailHtmlPayloadByMessageId.clear();
}

export function mailHtmlMountAttrs(messageId: string, html: string): string {
  const mid = messageId.trim();
  if (mid) mailHtmlPayloadByMessageId.set(mid, html);
  const fp = mailHtmlContentFingerprint(html);
  return `data-message-id="${escapeAttr(messageId)}" data-email-html-fp="${escapeAttr(fp)}"`;
}

export function flattenNestedParagraphInDocument(doc: Document) {
  const root = doc.body;
  if (!root) return;
  for (let guard = 0; guard < 400; guard++) {
    const inner = root.querySelector("p > p");
    if (!inner?.parentElement) break;
    const parent = inner.parentElement;
    while (inner.firstChild) parent.insertBefore(inner.firstChild, inner);
    inner.remove();
  }
}

export function base64ToImageBlob(base64: string, mimeType: string): Blob {
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mimeType.trim() || "application/octet-stream" });
}
