/** Met en gras dates, n° et formules de politesse, et rend les URL nues cliquables. */

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function emphasizePlain(raw: string): string {
  const urlRe = /(?:https?:\/\/|www\.)[^\s<>"']+/gi;
  const chunks: string[] = [];
  let last = 0;
  for (const match of raw.matchAll(urlRe)) {
    const start = match.index ?? 0;
    chunks.push(emphasizeFacts(raw.slice(last, start)));
    let url = match[0];
    url = url.replace(/[),.;:]+$/, "");
    const trail = match[0].slice(url.length);
    const href = url.toLowerCase().startsWith("www.") ? `https://${url}` : url;
    if (/^https?:\/\//i.test(href)) {
      chunks.push(
        `<a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">${escapeHtml(url)}</a>`,
      );
    } else {
      chunks.push(escapeHtml(match[0]));
    }
    chunks.push(emphasizeFacts(trail));
    last = start + match[0].length;
  }
  chunks.push(emphasizeFacts(raw.slice(last)));
  return chunks.join("");
}

function emphasizeFacts(raw: string): string {
  const re =
    /(\b\d{1,2}\/\d{1,2}\/\d{2,4}(?:\s*(?:à|a)\s*\d{1,2}:\d{2})?|\bn[°ºo]\s*\d{3,}|\b(?:M\.|MR|Mme|Monsieur|Madame)\s+[A-ZÀ-Ý][A-ZÀ-Ýa-zà-ÿ'’ -]{1,48}|\b(?:Bonjour|Hello)\s+[A-ZÀ-Ý][a-zà-ÿ'’-]{1,24}(?:\s+[A-ZÀ-Ý][a-zà-ÿ'’-]{1,24})?)/g;
  let out = "";
  let last = 0;
  for (const match of raw.matchAll(re)) {
    const start = match.index ?? 0;
    out += escapeHtml(raw.slice(last, start));
    out += `<strong>${escapeHtml(match[0].trim())}</strong>`;
    const pad = match[0].length - match[0].trimEnd().length;
    if (pad) out += escapeHtml(match[0].slice(match[0].trimEnd().length));
    last = start + match[0].length;
  }
  out += escapeHtml(raw.slice(last));
  return out;
}

/** Retire les paragraphes qui ne sont que des attributs HTML copiés par le modèle. */
export function dropMarkupSoup(html: string): string {
  return html.replace(
    /<p\b[^>]*>[^<]*(?:target\s*=|data-block|text-decoration|_blank|style\s*=)[^<]*<\/p>/gi,
    "",
  );
}

function plainText(html: string): string {
  if (typeof DOMParser === "undefined") return "";
  const doc = new DOMParser().parseFromString(html, "text/html");
  return doc.body?.textContent ?? "";
}

/** Complète un article trop court avec dates, destinataire et site déjà présents dans le mail. */
export function supplementReadingFacts(articleHtml: string, sourceHtml: string): string {
  const source = plainText(sourceHtml);
  if (!source.trim()) return articleHtml;
  const prices = source.match(/\d+[.,]\d{2}/g)?.length ?? 0;
  if (prices > 8) return articleHtml;
  const shown = plainText(articleHtml);
  const rows: string[] = [];
  const dates = [...new Set(source.match(/\d{1,2}\/\d{1,2}\/\d{4}/g) ?? [])].slice(0, 3);
  for (const date of dates) {
    if (shown.includes(date)) continue;
    rows.push(`<tr><th scope="row">Date</th><td><strong>${escapeHtml(date)}</strong></td></tr>`);
  }
  const name = source.match(
    /\b(?:(?:MR|M\.|Mme|Monsieur|Madame)\s+[A-ZÀ-Ý][A-ZÀ-Ýa-zà-ÿ'’ -]{1,48}|(?:Bonjour|Hello)\s+[A-ZÀ-Ý][a-zà-ÿ'’-]{1,24}(?:\s+[A-ZÀ-Ý][a-zà-ÿ'’-]{1,24})?)/,
  );
  const nameText = name?.[0]?.trim();
  if (nameText && !shown.toLocaleUpperCase("fr").includes(nameText.toLocaleUpperCase("fr"))) {
    rows.push(`<tr><th scope="row">Destinataire</th><td><strong>${escapeHtml(nameText)}</strong></td></tr>`);
  }
  let link = "";
  const site = source.match(/\bwww\.[a-z0-9.-]+\.[a-z]{2,}/i)?.[0];
  if (site && !shown.toLocaleLowerCase("fr").includes(site.toLocaleLowerCase("fr"))) {
    link = `<p class="rm-digest__actions"><a href="${escapeHtml(`https://${site}`)}" target="_blank" rel="noopener noreferrer">${escapeHtml(site)}</a></p>`;
  }
  if (!rows.length && !link) return articleHtml;
  const table = rows.length ? `<table><tbody>${rows.join("")}</tbody></table>` : "";
  return `${articleHtml}${table}${link}`;
}

export function emphasizeReadingHtml(html: string): string {
  const cleaned = dropMarkupSoup(html);
  if (typeof DOMParser === "undefined") return cleaned;
  const doc = new DOMParser().parseFromString(`<div id="rm-em">${cleaned}</div>`, "text/html");
  const root = doc.getElementById("rm-em");
  if (!root) return cleaned;
  const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];
  let current: Node | null = walker.nextNode();
  while (current) {
    nodes.push(current as Text);
    current = walker.nextNode();
  }
  for (const text of nodes) {
    const parent = text.parentElement;
    if (!parent || parent.closest("a, strong, script, style, code")) continue;
    const value = text.data;
    if (!value.trim()) continue;
    const next = emphasizePlain(value);
    if (next === escapeHtml(value)) continue;
    const holder = doc.createElement("span");
    holder.innerHTML = next;
    text.replaceWith(...holder.childNodes);
  }
  return root.innerHTML;
}
