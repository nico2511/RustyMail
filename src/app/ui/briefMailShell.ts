import { escapeHtml } from "../../ui/sanitize";
import { iconSvg } from "../lib/iconSvg";

export function renderBriefMailViewShell(bodyHtml: string, opts?: { kicker?: string }): string {
  const kicker = opts?.kicker?.trim();
  const top =
    kicker ?
      `<div class="thread-zen-top">
        <span class="thread-zen-brand" aria-hidden="true">${iconSvg("spark")}</span>
        <span class="thread-kicker thread-kicker-strong">${escapeHtml(kicker)}</span>
      </div>`
    : "";
  return `<aside class="thread-zen surface-sm inbox-brief-mail" aria-label="Brief du dossier">${top}<div class="thread-zen-body">${bodyHtml}</div></aside>`;
}

export function renderBriefMailItemCard(inner: string): string {
  return `<div class="thread-msg-card inbox-brief-item-card">${inner}</div>`;
}
