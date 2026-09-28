import { escapeHtml } from "../../ui/sanitize";

const ATTRIBUTION =
  /^(?:On\s+.+\bwrote:?|Le\s.+a\s+[éeèê]crit\s*:?)/i;

/** Historique cité retiré du corps, rouvrable sous le dernier message. */
export function renderHistoryFold(blocks: readonly string[] | undefined): string {
  const text = (blocks ?? [])
    .map((s) => s.replace(/\s+$/g, ""))
    .filter((s) => s.trim())
    .join("\n\n");
  if (!text.trim()) return "";
  const first =
    text
      .split("\n")
      .map((l) => l.trim())
      .find(Boolean) ?? "";
  const label = ATTRIBUTION.test(first)
    ? first.length > 110
      ? `${first.slice(0, 109)}…`
      : first
    : "Historique";
  return `<details class="rm-history-fold"><summary>${escapeHtml(label)}</summary><pre class="rm-history-fold__body">${escapeHtml(text)}</pre></details>`;
}
