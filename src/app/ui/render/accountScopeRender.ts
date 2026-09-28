import { isInboxLikeMailbox, isUnifiedInboxMailbox } from "../../../mailboxKinds";
import type { Account } from "../../../accountSetup";
import { escapeAttr, escapeHtml } from "../../../ui/sanitize";
import {
  accountHueForId,
  type AccountHue,
  accountMonogram,
  accountShortLabel,
  unreadCountLabelFr,
} from "../../lib/accountHue";
import {
  accountInboxUnreadCount,
  allAccountsInboxUnread,
  currentInboxScope,
} from "../../mail/inboxAccountScope";
import { state } from "../../state";

function orderedAccountIds(): string[] {
  return state.accounts.map((account) => account.id);
}

function hueFor(accountId: string): AccountHue {
  return accountHueForId(accountId, orderedAccountIds());
}

function scopeOptionHtml(opts: {
  action: string;
  accountId?: string;
  hue?: string;
  label: string;
  detail: string;
  selected: boolean;
}): string {
  const hueAttr = opts.hue ? ` data-account-hue="${escapeAttr(opts.hue)}"` : "";
  const idAttr = opts.accountId ? ` data-account-id="${escapeAttr(opts.accountId)}"` : "";
  return `<button type="button" class="account-scope-option${opts.selected ? " is-selected" : ""}" role="option" aria-selected="${opts.selected ? "true" : "false"}" data-action="${opts.action}"${idAttr}${hueAttr}>
    <span class="account-scope-option__label">${escapeHtml(opts.label)}</span>
    <small>${escapeHtml(opts.detail)}</small>
  </button>`;
}

export function renderAccountScopeChoicesHtml(): string {
  const scope = currentInboxScope();
  const allN = allAccountsInboxUnread();
  const all = scopeOptionHtml({
    action: "inbox-scope-all",
    label: "Tous les comptes",
    detail: `Vue unifiée · ${unreadCountLabelFr(allN)}`,
    selected: scope === "all",
  });
  const rows = state.accounts
    .map((account) => {
      const label = accountShortLabel(account);
      const n = accountInboxUnreadCount(account.id);
      const email = account.email?.trim() || account.id;
      return scopeOptionHtml({
        action: "inbox-scope-account",
        accountId: account.id,
        hue: hueFor(account.id),
        label,
        detail: `${email} · ${unreadCountLabelFr(n)}`,
        selected: scope === account.id,
      });
    })
    .join("");
  return `${all}${rows}`;
}

export function renderRailAccountScopeHtml(): string {
  if (state.accounts.length < 2) return "";
  const scope = currentInboxScope();
  const allN = allAccountsInboxUnread();
  const allCount =
    allN > 0
      ? `<span class="folder-count folder-count-unread" aria-label="${escapeAttr(unreadCountLabelFr(allN))}">${allN}</span>`
      : `<span class="folder-count">0</span>`;
  const allActive = scope === "all" ? " active" : "";
  const allBtn = `<button type="button" class="folder-button folder-button--account${allActive}" data-action="inbox-scope-all" title="Tous les comptes — ${unreadCountLabelFr(allN)}" aria-label="Tous les comptes, ${unreadCountLabelFr(allN)}">
    <span class="folder-icon" aria-hidden="true">∗</span>
    <span class="folder-name">Tous les comptes</span>
    ${allCount}
  </button>`;
  const rows = state.accounts.map((account) => railAccountButton(account, scope === account.id)).join("");
  return `<div class="sidebar-section-label sidebar-section-label--in-nav"><span>Comptes</span></div>
    <div class="sidebar-folder-group sidebar-folder-group--accounts">${allBtn}${rows}</div>`;
}

function railAccountButton(account: Account, scoped: boolean): string {
  const label = accountShortLabel(account);
  const hue = hueFor(account.id);
  const n = accountInboxUnreadCount(account.id);
  const email = account.email?.trim() || "";
  const count =
    n > 0
      ? `<span class="folder-count folder-count-unread" aria-label="${escapeAttr(unreadCountLabelFr(n))}">${n}</span>`
      : `<span class="folder-count">0</span>`;
  const title = email ? `${label} — ${email} — ${unreadCountLabelFr(n)}` : `${label} — ${unreadCountLabelFr(n)}`;
  return `<button type="button" class="folder-button folder-button--account${scoped ? " folder-button--scope" : ""}" data-action="inbox-scope-account" data-account-id="${escapeAttr(account.id)}" data-account-hue="${hue}" title="${escapeAttr(title)}" aria-label="${escapeAttr(title)}">
    <span class="folder-icon" aria-hidden="true">${escapeHtml(accountMonogram(label))}</span>
    <span class="folder-name">${escapeHtml(label)}</span>
    ${count}
  </button>`;
}

export function inboxScopeTitleEligible(listMailbox: string, opts: { draft: boolean; search: boolean; panel: boolean }): boolean {
  if (state.accounts.length < 2 || opts.draft || opts.search || opts.panel) return false;
  return isUnifiedInboxMailbox(listMailbox) || isInboxLikeMailbox(listMailbox);
}

export function renderInboxScopeTitleHtml(): string {
  const scope = currentInboxScope();
  const unified = scope === "all";
  const account = unified ? undefined : state.accounts.find((a) => a.id === scope);
  const label = unified ? "Tous les comptes" : account ? accountShortLabel(account) : "Réception";
  const hue = account ? hueFor(account.id) : "";
  const unread = unified ? allAccountsInboxUnread() : account ? accountInboxUnreadCount(account.id) : 0;
  const hueAttr = hue ? ` data-account-hue="${hue}"` : "";
  const open = state.inboxAccountMenuOpen;
  return `<div class="inbox-scope"${hueAttr}>
    <button type="button" class="inbox-scope-btn" data-action="toggle-inbox-account-menu" aria-expanded="${open ? "true" : "false"}" aria-haspopup="listbox" title="Filtrer par compte">
      <span class="inbox-scope-name">${escapeHtml(label)}</span>
      <span class="inbox-scope-chevron" aria-hidden="true"></span>
    </button>
    ${unread > 0 ? `<span class="inbox-scope-unread">${escapeHtml(unreadCountLabelFr(unread))}</span>` : ""}
    ${
      open
        ? `<button type="button" class="inbox-account-scrim" data-action="close-inbox-account-menu" aria-label="Fermer le filtre des comptes"></button>
           <div class="inbox-account-menu" role="listbox" aria-label="Comptes">${renderAccountScopeChoicesHtml()}</div>`
        : ""
    }
  </div>`;
}

export function renderAccountModalHtml(): string {
  if (!state.accountModalOpen) return "";
  const account = state.accounts.find((a) => a.id === state.selectedAccountId) ?? state.accounts[0];
  const who = account ? accountShortLabel(account) : "RustyMail";
  const mail = account?.email?.trim() ?? "";
  return `<button type="button" class="account-modal-scrim" data-action="close-account-modal" aria-label="Fermer les comptes"></button>
    <div class="account-modal" role="dialog" aria-modal="true" aria-label="Comptes">
      <header class="account-modal__head">
        <strong>${escapeHtml(who)}</strong>
        ${mail ? `<span class="dim">${escapeHtml(mail)}</span>` : ""}
      </header>
      <div class="account-modal__list" role="listbox" aria-label="Filtrer la réception">${renderAccountScopeChoicesHtml()}</div>
      <footer class="account-modal__foot">
        <button type="button" class="ghost-button" data-action="open-add-account">Ajouter un compte</button>
        <button type="button" class="ghost-button" data-action="settings">Paramètres</button>
      </footer>
    </div>`;
}
