export function mailUrlLooksRemote(raw: string): boolean {
  return /^https?:\/\//i.test(raw.trim()) || raw.trim().startsWith("//");
}

export function safeDataImageSrc(raw: string): boolean {
  return /^data:image\/(?:png|jpe?g|gif|webp|bmp);base64,/i.test(raw.trim());
}

export function stripOutlookDisplayNoiseFromDoc(doc: Document): void {
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
