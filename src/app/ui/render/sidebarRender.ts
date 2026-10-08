import {
  LOCAL_SAVED_DRAFTS_MAILBOX,
  mailboxKindIcon,
  mailboxKindLabelFr,
  pickSystemMailboxes,
} from "../../../mailboxKinds";
import { renderSavedSearchesSidebarHtml, renderSuggestedViewsCardHtml } from "../../../savedSearchView";
import { escapeAttr, escapeHtml } from "../../../ui/sanitize";
import { accountMonogram, accountShortLabel } from "../../lib/accountHue";
import { isTauriRuntime } from "../../lib/tauriRuntime";
import { activityTrackingEnabled } from "../../mail/threadActivityTracking";
import { state } from "../../state";
import { renderSidebarAiQuickTrigger } from "./aiQuickPanelRender";
import { renderRailAccountScopeHtml } from "./accountScopeRender";
import { railImapFoldersVisible } from "../../mail/inboxAccountScope";
import {
  renderAddressBookSidebarCountPill,
  renderFolderSidebarCountPill,
} from "./listChrome";
import { renderDeps } from "./renderDeps";

export function renderSidebar(): string {
  const account = renderDeps().currentAccount();
  const accountLabel = account?.email ?? "No account configured";
  const folders = state.mailboxes.length ? state.mailboxes : ["INBOX"];
  const system = pickSystemMailboxes(folders);
  const systemNames = new Set(system.map((x) => x.name));
  const personal = folders.filter((mb) => !systemNames.has(mb));
  const personalCount = personal.length;
  const railCollapsed = state.sidebarCollapsed;
  const multiAccount = state.accounts.length > 1;
  const showImapFolders = railImapFoldersVisible();
  const avatarLabel = account ? accountShortLabel(account) : "RustyMail";
  const avatarMark = accountMonogram(avatarLabel);
  const imapSection =
    state.accounts.length > 1 && account
      ? `${accountShortLabel(account)} · IMAP`
      : "IMAP";
  return `
    <aside class="sidebar" aria-label="Mail navigation">
      <button type="button" class="sidebar-collapse-edge" data-action="toggle-sidebar" aria-label="${railCollapsed ? "Afficher les dossiers" : "Masquer les dossiers"}" title="${railCollapsed ? "Agrandir le volet" : "Réduire le volet"}">
        <span class="sidebar-collapse-edge__glyph" aria-hidden="true"></span>
      </button>
      <div class="sidebar-header">
        <div class="sidebar-header-top">
          <div class="sidebar-account">
            <button type="button" class="avatar large sidebar-account-avatar" data-action="toggle-account-modal" title="Comptes" aria-label="Comptes" aria-expanded="${state.accountModalOpen ? "true" : "false"}">${escapeHtml(avatarMark)}</button>
            <span class="sidebar-account-copy"><strong>RustyMail</strong><small class="dim" style="display:block">${escapeHtml(accountLabel)}</small></span>
          </div>
        </div>
        <div class="sidebar-actions">
          <button type="button" class="primary-button sidebar-compose" data-action="compose" title="Composer" aria-label="Composer">
            <span class="sidebar-compose-glyph" aria-hidden="true">+</span>
            <span class="sidebar-compose-label">Composer</span>
            <span class="kbd">N</span>
          </button>
          ${
            state.accounts.length > 1
              ? ""
              : `<select id="account-select" class="account-select" style="width:100%" ${state.accounts.length ? "" : "disabled"}>
            ${state.accounts.map((a) => `<option value="${escapeAttr(a.id)}" ${a.id === state.selectedAccountId ? "selected" : ""}>${escapeHtml(a.displayName || a.email)}</option>`).join("")}
          </select>`
          }
        </div>
      </div>
      ${
        state.mailboxListError
          ? `<div class="sidebar-mailbox-error" role="status">
              <p class="dim" style="margin:8px 12px">Dossiers indisponibles : ${escapeHtml(state.mailboxListError)}</p>
              <button type="button" class="ghost-button" data-action="retry-mailbox-list" style="margin:0 12px 8px">Réessayer</button>
            </div>`
          : ""
      }
      <nav class="folder-list${multiAccount ? " folder-list--account-fold" : ""}" aria-label="Folders">
        ${renderRailAccountScopeHtml()}
        ${
          isTauriRuntime() && account
            ? `<div class="sidebar-folder-group sidebar-folder-group--virtual-local">
              <button type="button" class="folder-button ${state.selectedMailbox === LOCAL_SAVED_DRAFTS_MAILBOX ? "active" : ""}" data-mailbox="${escapeAttr(LOCAL_SAVED_DRAFTS_MAILBOX)}" title="Sauvés" aria-label="Sauvés — ${state.savedDraftsMailboxCount} brouillon${state.savedDraftsMailboxCount === 1 ? "" : "s"}">
                <span class="folder-icon">Sv</span>
                <span class="folder-name">Sauvés</span>
                <span class="folder-count">${state.savedDraftsMailboxCount}</span>
              </button>
              <button type="button" class="folder-button ${state.view === "contacts" || state.view === "contact" ? "active" : ""}" data-action="open-contacts-view" title="Carnet" aria-label="Carnet d'adresses">
                <span class="folder-icon">Ct</span>
                <span class="folder-name">Carnet</span>
                ${renderAddressBookSidebarCountPill()}
              </button>
            </div>`
            : ""
        }
        ${
          showImapFolders
            ? `<div class="sidebar-section-label sidebar-section-label--in-nav"><span class="dim">${escapeHtml(imapSection)}</span></div>
        <div class="sidebar-folder-group sidebar-folder-group--system">
          ${system
            .map(
              ({ kind, name }) => `
                <button class="folder-button ${name === state.selectedMailbox ? "active" : ""}" data-mailbox="${escapeAttr(name)}" title="${escapeAttr(mailboxKindLabelFr(kind))}" aria-label="${escapeAttr(mailboxKindLabelFr(kind))}">
                  <span class="folder-icon">${mailboxKindIcon(kind)}</span>
                  <span class="folder-name">${escapeHtml(mailboxKindLabelFr(kind))}</span>
                  ${renderFolderSidebarCountPill(name)}
                </button>
              `,
            )
            .join("")}
        </div>

        <div class="sidebar-personal-entry">
          <div class="sidebar-section-label sidebar-section-label--in-nav"><span class="dim">Personnels</span></div>
          <button type="button" class="folder-button folder-button--personal ${state.view === "folderManager" ? "active" : ""}" data-action="open-folder-manager-view" title="Dossiers personnels" aria-label="Dossiers personnels">
            <span class="folder-icon">Ar</span>
            <span class="folder-name">Dossiers</span>
            ${personalCount ? `<span class="folder-count">${personalCount}</span>` : ""}
          </button>
        </div>`
            : ""
        }
      </nav>
      ${
        isTauriRuntime() && account
          ? `<div class="sidebar-saved-views" aria-label="Vues enregistrées">
              <div class="sidebar-section-label sidebar-section-label--saved-views"><span class="dim">Vues</span></div>
              ${activityTrackingEnabled() ? renderSuggestedViewsCardHtml(state.suggestedSavedViews, escapeHtml, escapeAttr) : ""}
              ${renderSavedSearchesSidebarHtml(state.savedSearches, state.activeSavedSearchId, escapeHtml, escapeAttr)}
            </div>`
          : ""
      }
      <div class="sidebar-footer">
        <button type="button" class="folder-button ${state.view === "organizationV2" ? "active" : ""}" data-action="open-organization-v2-view" title="Organiser" aria-label="Organiser">
          <span class="folder-icon">O2</span><span class="folder-name">Organiser V2</span>
        </button>
        <button type="button" class="folder-button" data-action="settings" title="Paramètres" aria-label="Paramètres">
          <span class="folder-icon">ST</span><span class="folder-name">Paramètres</span><span class="folder-count">${state.accounts.length}</span>
        </button>
        ${renderSidebarAiQuickTrigger()}
      </div>
    </aside>
  `;
}
