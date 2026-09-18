import { renderStatusBarProgressInlineHtml } from "../../statusBarProgress";
import { escapeAttr, escapeHtml } from "../../ui/sanitize";
import { gatherStatusBarProgressJobs } from "./statusBarProgressGatherRun";

export function paintStatusBarProgressDom(): void {
  const bar = document.querySelector<HTMLElement>(".status-bar-wrap > .status-bar");
  if (!bar) return;
  const jobs = gatherStatusBarProgressJobs();
  const html = renderStatusBarProgressInlineHtml(jobs, escapeHtml, escapeAttr);
  const existing = bar.querySelector(".status-bar-progress-slot");
  if (!html) {
    existing?.remove();
    return;
  }
  if (existing) {
    existing.outerHTML = html;
    return;
  }
  const anchor = bar.querySelector(".status-bar-compact") ?? bar.querySelector(".status-bar-sep");
  if (anchor) anchor.insertAdjacentHTML("afterend", html);
  else bar.insertAdjacentHTML("beforeend", html);
}
