import { state } from "../state";

export function paintLlmPrefetchProgressDom(): void {
  const pct = state.llmPrefetchPercent;
  const active = state.llmPrefetchInFlight || (pct != null && Number.isFinite(pct));
  const pctRounded =
    pct != null && Number.isFinite(pct) ? Math.min(100, Math.max(0, Math.round(pct))) : 0;
  const labelHtml =
    pct != null && Number.isFinite(pct)
      ? `Téléchargement : <strong>${pctRounded}%</strong>`
      : "Téléchargement du modèle…";
  document.querySelectorAll<HTMLElement>("[data-llm-prefetch-block]").forEach((block) => {
    block.hidden = !active;
    if (!active) return;
    const label = block.querySelector<HTMLElement>("[data-llm-prefetch-label]");
    if (label) label.innerHTML = labelHtml;
    const fill = block.querySelector<HTMLElement>("[data-llm-prefetch-fill]");
    if (fill) fill.style.width = `${pctRounded}%`;
    const track = block.querySelector<HTMLElement>("[data-llm-prefetch-track]");
    if (track) track.setAttribute("aria-valuenow", String(pctRounded));
    const cancelBtn = block.querySelector<HTMLButtonElement>('[data-action="cancel-llm-prefetch"]');
    if (cancelBtn) cancelBtn.disabled = !state.llmPrefetchInFlight && pct == null;
  });
}
