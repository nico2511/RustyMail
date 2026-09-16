import { escapeAttr } from "../../ui/sanitize";

export function utf8StringToBase64(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]!);
  return btoa(bin);
}

export function base64ToUtf8String(b64: string): string {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

export function mailHtmlMountAttrs(messageId: string, html: string): string {
  const b64 = utf8StringToBase64(html);
  return `data-message-id="${escapeAttr(messageId)}" data-email-html-b64="${b64}"`;
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
