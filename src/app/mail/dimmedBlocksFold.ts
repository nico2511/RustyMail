import { escapeHtml } from "../../ui/sanitize";

/** Mentions légales retirées du texte visible, rouvrables dans la vue texte. */
export function renderDimmedBlocksFold(blocks: readonly string[] | undefined): string {
  const lines = (blocks ?? []).map((s) => s.trim()).filter(Boolean);
  if (!lines.length) return "";
  return `<details class="rm-dimmed-fold"><summary>Mentions masquées</summary><pre class="rm-dimmed-fold__body">${escapeHtml(lines.join("\n"))}</pre></details>`;
}
