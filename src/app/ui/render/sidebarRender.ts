import {
  LOCAL_SAVED_DRAFTS_MAILBOX,
  UNIFIED_INBOX_MAILBOX,
  mailboxKindIcon,
  mailboxKindLabelFr,
  pickSystemMailboxes,
} from "../../../mailboxKinds";
import { renderSavedSearchesSidebarHtml, renderSuggestedViewsCardHtml } from "../../../savedSearchView";
import { escapeAttr, escapeHtml } from "../../../ui/sanitize";
import { isTauriRuntime } from "../../lib/tauriRuntime";
import { state } from "../../state";
import { renderSidebarAiQuickTrigger } from "./aiQuickPanelRender";
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
  return `
    <aside class="sidebar" aria-label="Mail navigation">
      <button type="button" class="sidebar-collapse-edge" data-action="toggle-sidebar" aria-label="Masquer les dossiers" title="Réduire le volet">
        <span class="sidebar-collapse-edge__glyph" aria-hidden="true"></span>
      </button>
      <div class="sidebar-header">
        <div class="sidebar-header-top">
          <div class="sidebar-account">
            <span class="avatar large" style="background:rgba(200,149,108,.16);color:var(--accent)">SC</span>
            <span><strong>RustyMail</strong><small class="dim" style="display:block">${escapeHtml(accountLabel)}</small></span>
          </div>
        </div>
        <div class="sidebar-actions">
          <button class="primary-button" data-action="compose" style="padding:9px 10px;border-radius:var(--radius-btn);width:100%"><span>Composer</span> <span class="kbd">N</span></button>
          <select id="account-select" class="account-select" style="width:100%" ${state.accounts.length ? "" : "disabled"}>
            ${state.accounts.map((a) => `<option value="${escapeAttr(a.id)}" ${a.id === state.selectedAccountId ? "selected" : ""}>${escapeHtml(a.displayName || a.email)}</option>`).join("")}
          </select>
        </div>
      </div>
      <nav class="folder-list" aria-label="Folders">
        ${
          isTauriRuntime() && account
            ? `<div class="sidebar-folder-group sidebar-folder-group--virtual-local">
              ${
                state.accounts.length > 1
                  ? `<button type="button" class="folder-button ${state.selectedMailbox === UNIFIED_INBOX_MAILBOX ? "active" : ""}" data-mailbox="${escapeAttr(UNIFIED_INBOX_MAILBOX)}" aria-label="Tous les comptes — boîtes de réception">
                <span class="folder-icon">All</span>
                <span class="folder-name">Tous les comptes</span>
              </button>`
                  : ""
              }
              <button type="button" class="folder-button ${state.selectedMailbox === LOCAL_SAVED_DRAFTS_MAILBOX ? "active" : ""}" data-mailbox="${escapeAttr(LOCAL_SAVED_DRAFTS_MAILBOX)}" aria-label="Sauvés — ${state.savedDraftsMailboxCount} brouillon${state.savedDraftsMailboxCount === 1 ? "" : "s"}">
                <span class="folder-icon">Sv</span>
                <span class="folder-name">Sauvés</span>
                <span class="folder-count">${state.savedDraftsMailboxCount}</span>
              </button>
              <button type="button" class="folder-button ${state.view === "contacts" || state.view === "contact" ? "active" : ""}" data-action="open-contacts-view" aria-label="Carnet d'adresses">
                <span class="folder-icon">Ct</span>
                <span class="folder-name">Carnet</span>
                ${renderAddressBookSidebarCountPill()}
              </button>
            </div>`
            : ""
        }
        <div class="sidebar-section-label sidebar-section-label--in-nav"><span class="dim">IMAP</span></div>
        <div class="sidebar-folder-group">
          ${system
            .map(
              ({ kind, name }) => `
                <button class="folder-button ${name === state.selectedMailbox ? "active" : ""}" data-mailbox="${escapeAttr(name)}">
                  <span class="folder-icon">${mailboxKindIcon(kind)}</span>
                  <span class="folder-name">${escapeHtml(mailboxKindLabelFr(kind))}</span>
                  ${renderFolderSidebarCountPill(name)}
                </button>
              `,
            )
            .join("")}
        </div>

        <button type="button" class="folder-button ${state.view === "folderManager" ? "active" : ""}" data-action="open-folder-manager-view" title="Gérer l’arbre des dossiers personnels">
          <span class="folder-icon">Ar</span>
          <span class="folder-name">Dossiers</span>
          ${personalCount ? `<span class="folder-count">${personalCount}</span>` : ""}
        </button>
      </nav>
      ${
        isTauriRuntime() && account
          ? `<div class="sidebar-saved-views" aria-label="Vues enregistrées">
              <div class="sidebar-section-label sidebar-section-label--saved-views"><span class="dim">Vues</span></div>
              ${renderDeps().activityTrackingEnabled() ? renderSuggestedViewsCardHtml(state.suggestedSavedViews, escapeHtml, escapeAttr) : ""}
              ${renderSavedSearchesSidebarHtml(state.savedSearches, state.activeSavedSearchId, escapeHtml, escapeAttr)}
            </div>`
          : ""
      }
      <div class="sidebar-footer">
        <button type="button" class="folder-button ${state.view === "organizationV2" ? "active" : ""}" data-action="open-organization-v2-view" title="Organiser V2 — structure boîte (sans LLM). Les regroupements par critères = vues enregistrées.">
          <span class="folder-icon">O2</span><span class="folder-name">Organiser V2</span>
        </button>
        <button type="button" class="folder-button" data-action="settings">
          <span class="folder-icon">ST</span><span class="folder-name">Paramètres</span><span class="folder-count">${state.accounts.length}</span>
        </button>
        ${renderSidebarAiQuickTrigger()}
      </div>
    </aside>
  `;
}
