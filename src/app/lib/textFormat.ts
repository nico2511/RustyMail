import { escapeAttr, escapeHtml } from "../../ui/sanitize";
export function trimUrlTrailingPunct(url: string): { href: string; suffix: string } {
  let href = url;
  let suffix = "";
  while (/[.,;:!?)}\]]$/.test(href)) {
    suffix = href.slice(-1) + suffix;
    href = href.slice(0, -1);
  }
  return { href, suffix };
}

export function linkifyPlainSegment(segment: string): string {
  const out: string[] = [];
  const urlRe = /https?:\/\/[^\s<>"']+/gi;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = urlRe.exec(segment)) !== null) {
    out.push(escapeHtml(segment.slice(last, m.index)));
    const { href, suffix } = trimUrlTrailingPunct(m[0]);
    out.push(
      `<a class="ai-qa-link" href="${escapeAttr(href)}" target="_blank" rel="noopener noreferrer">${escapeHtml(href)}</a>${escapeHtml(suffix)}`
    );
    last = m.index + m[0].length;
  }
  out.push(escapeHtml(segment.slice(last)));
  return out.join("");
}

export function formatPlainTextWithLinks(text: string): string {
  const chunks: string[] = [];
  const mdRe = /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = mdRe.exec(text)) !== null) {
    chunks.push(linkifyPlainSegment(text.slice(last, m.index)));
    const { href } = trimUrlTrailingPunct(m[2]);
    const label = m[1].trim() || href;
    chunks.push(
      `<a class="ai-qa-link" href="${escapeAttr(href)}" target="_blank" rel="noopener noreferrer">${escapeHtml(label)}</a>`
    );
    last = m.index + m[0].length;
  }
  chunks.push(linkifyPlainSegment(text.slice(last)));
  return chunks.join("");
}
