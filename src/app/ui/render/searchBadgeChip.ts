import { escapeAttr, escapeHtml } from "../../../ui/sanitize";

export function renderSearchBadgeChip(opts: {
  kind: string;
  label: string;
  title: string;
  action: string;
  dismissible?: boolean;
  dataEmail?: string;
  dataTag?: string;
}): string {
  const dismissible = opts.dismissible !== false;
  const suffix = dismissible
    ? `<span class="search-badge__x" aria-hidden="true">×</span>`
    : `<span class="search-badge__hint" aria-hidden="true">↕</span>`;
  const extra = [
    opts.dataEmail ? `data-email="${escapeAttr(opts.dataEmail)}"` : "",
    opts.dataTag ? `data-tag="${escapeAttr(opts.dataTag)}"` : "",
  ]
    .filter(Boolean)
    .join(" ");
  return `<button type="button" class="search-badge search-badge--${opts.kind}" role="listitem" data-action="${escapeAttr(opts.action)}" ${extra} title="${escapeAttr(opts.title)}"><span class="search-badge__label">${escapeHtml(opts.label)}</span>${suffix}</button>`;
}
