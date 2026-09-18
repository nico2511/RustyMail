import { escapeHtml } from "../../ui/sanitize";
import { repairUtf8Mojibake } from "./threadViewUiMojibakeRun";

export function zenSummaryHtmlFragments(text: string): string {
  const lines = repairUtf8Mojibake(text).replace(/\r\n/g, "\n").split("\n");
  const chunks: string[] = [];
  let inList = false;
  const closeList = (): void => {
    if (!inList) return;
    chunks.push("</ul>");
    inList = false;
  };
  for (const line of lines) {
    const t = line.trim();
    if (/^[-•]\s+/.test(t)) {
      if (!inList) {
        chunks.push('<ul class="thread-zen-list">');
        inList = true;
      }
      chunks.push(`<li>${escapeHtml(t.replace(/^[-•]\s+/, ""))}</li>`);
    } else if (t) {
      closeList();
      chunks.push(`<p class="thread-zen-par">${escapeHtml(t)}</p>`);
    }
  }
  closeList();
  return chunks.join("") || `<p class="thread-zen-par">${escapeHtml(text)}</p>`;
}
