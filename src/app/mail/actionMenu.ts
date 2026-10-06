import { escapeAttr, escapeHtml } from "../../ui/sanitize";

export type ActionMenuItem = {
  action: string;
  label: string;
  title?: string;
  danger?: boolean;
  /** Attributs HTML supplémentaires (`data-thread-id="…"`). */
  extraAttrs?: string;
  disabled?: boolean;
};

export type ActionMenuProps = {
  label: string;
  title?: string;
  ariaLabel?: string;
  /** Classe optionnelle sur le trigger (ex. ghost-button search-ctx-btn). */
  triggerClass?: string;
  items: ActionMenuItem[];
};

/** Menu déroulant compact (details/summary) — items réutilisent `data-action`. */
export function renderActionMenuHtml(props: ActionMenuProps): string {
  ensureActionMenuDismissBound();
  const items = props.items.filter(Boolean);
  if (items.length === 0) return "";
  const triggerCls = props.triggerClass?.trim() || "ghost-button action-menu__trigger";
  const title = props.title ? ` title="${escapeAttr(props.title)}"` : "";
  const aria = escapeAttr(props.ariaLabel ?? props.label);
  const rows = items
    .map((it) => {
      const tip = it.title ? ` title="${escapeAttr(it.title)}"` : "";
      const danger = it.danger ? " action-menu__item--danger" : "";
      const disabled = it.disabled ? " disabled" : "";
      const extra = it.extraAttrs ? ` ${it.extraAttrs}` : "";
      return `<button type="button" class="action-menu__item${danger}" role="menuitem" data-action="${escapeAttr(it.action)}"${tip}${extra}${disabled}>${escapeHtml(it.label)}</button>`;
    })
    .join("");
  return `<details class="action-menu">
    <summary class="${escapeAttr(triggerCls)}"${title} aria-haspopup="menu" aria-label="${aria}">${escapeHtml(props.label)} <span class="action-menu__caret" aria-hidden="true">▾</span></summary>
    <div class="action-menu__panel" role="menu">${rows}</div>
  </details>`;
}

/** Ferme tous les menus ouverts (après une action ou clic extérieur). */
export function closeOpenActionMenus(except?: HTMLElement | null): void {
  document.querySelectorAll("details.action-menu[open]").forEach((node) => {
    const el = node as HTMLDetailsElement;
    if (except && (el === except || el.contains(except))) return;
    el.open = false;
  });
}

let actionMenuDismissBound = false;

/** Bind une seule fois : clic hors menu / Escape ferme les details. */
export function ensureActionMenuDismissBound(): void {
  if (actionMenuDismissBound || typeof document === "undefined") return;
  actionMenuDismissBound = true;
  document.addEventListener(
    "mousedown",
    (ev) => {
      const t = ev.target as HTMLElement | null;
      if (!t) return;
      const menu = t.closest("details.action-menu");
      if (menu) return;
      closeOpenActionMenus();
    },
    true,
  );
  document.addEventListener(
    "keydown",
    (ev) => {
      if (ev.key === "Escape") closeOpenActionMenus();
    },
    true,
  );
  document.addEventListener(
    "click",
    (ev) => {
      const t = ev.target as HTMLElement | null;
      if (!t?.closest?.(".action-menu__item")) return;
      // Laisser le data-action se propager, puis fermer.
      queueMicrotask(() => closeOpenActionMenus());
    },
    true,
  );
}
