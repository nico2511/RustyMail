import { navRenderTrailHtml } from "../../../navigation";
import { escapeAttr, escapeHtml } from "../../../ui/sanitize";
import { isTauriRuntime } from "../../lib/tauriRuntime";
import { state } from "../../state";
import {
  defaultAccountIdFromPrefs,
  shouldShowDefaultAccountPrompt,
} from "../../mail/accountDefaultPrefs";
import { renderDeps } from "./renderDeps";

export function renderViewNavTrail(actionsHtml?: string): string {
  const seg = renderDeps().navCurrentBreadcrumbSegment();
  if (!seg) return "";
  return navRenderTrailHtml(seg, escapeHtml, escapeAttr, actionsHtml ? { actionsHtml } : {});
}

export function renderInboxChipBadge(count: number): string {
  const n = Math.max(0, Math.floor(Number(count)) || 0);
  if (n <= 0) return "";
  return ` <span class="inbox-chip-badge">${n}</span>`;
}

export function renderFolderSidebarCountPill(mb: string): string {
  const u = state.mailboxUnread[mb] ?? 0;
  const t = state.mailboxTotal[mb] ?? 0;
  if (t <= 0 && u <= 0) return "";
  const title =
    u > 0
      ? `${t} conversation${t === 1 ? "" : "s"} · ${u} non lu${u === 1 ? "" : "s"}`
      : `${t} conversation${t === 1 ? "" : "s"} en cache`;
  return `<span class="folder-count folder-count-wrap" title="${escapeAttr(title)}"><span class="folder-count-num">${t}</span>${
    u > 0 ? `<span class="folder-count-unread" aria-label="${u} non lu${u === 1 ? "" : "s"}">${u}</span>` : ""
  }</span>`;
}

export function renderDefaultAccountPromptBanner(): string {
  if (!shouldShowDefaultAccountPrompt()) return "";
  const prefId = defaultAccountIdFromPrefs();
  const opts = state.accounts
    .map((a) => {
      const label = (a.displayName || a.email || a.id).trim();
      const selected = prefId === a.id || (!prefId && a.id === state.selectedAccountId);
      return `<option value="${escapeAttr(a.id)}" ${selected ? "selected" : ""}>${escapeHtml(label)}</option>`;
    })
    .join("");
  return `
    <div class="inbox-brief-banner inbox-brief-banner--hint default-account-prompt" role="region" aria-label="Compte par défaut au démarrage">
      <div class="inbox-brief-banner__title">Compte à l’ouverture</div>
      <div class="inbox-brief-banner__text">
        <p>Vous avez <strong>${state.accounts.length} comptes</strong>. Choisissez celui ouvert par défaut au démarrage de RustyMail.</p>
        <div class="default-account-prompt__row">
          <select class="settings-ctl settings-ctl-select default-account-prompt__select" id="default-account-prompt-select" aria-label="Compte par défaut">
            ${opts}
          </select>
          <button type="button" class="primary-button" data-action="save-default-account-prompt">Enregistrer</button>
          <button type="button" class="ghost-button" data-action="dismiss-default-account-prompt">Plus tard</button>
          <button type="button" class="ghost-button" data-action="open-settings-default-account">Paramètres</button>
        </div>
      </div>
    </div>`;
}

export function renderAccountsRecoveryBanner(): string {
  if (state.accounts.length > 0) return "";
  const dbPath = state.lastAppPaths?.dbPath?.trim();
  const detail =
    state.accountsLoadError ||
    (isTauriRuntime() ?
      "Aucun compte dans la base locale — vos mails en cache peuvent être sur un autre fichier SQLite (voir Paramètres → Stockage)."
    : "Ouvrez RustyMail en mode Tauri (npm run tauri:dev), pas seulement le serveur Vite dans le navigateur.");
  return `
    <div class="accounts-recovery-banner surface-sm" role="alert">
      <strong>Compte introuvable</strong>
      <p class="dim" style="margin:8px 0 0;line-height:1.5;font-size:13px">${escapeHtml(detail)}</p>
      ${
        dbPath
          ? `<p class="dim" style="margin:8px 0 0;font-size:12px;word-break:break-all">Base : ${escapeHtml(dbPath)}</p>`
          : ""
      }
      <div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:12px">
        <button type="button" class="primary-button" data-action="settings">Paramètres → Comptes</button>
        <button type="button" class="ghost-button" data-action="reload-accounts">Réessayer le chargement</button>
        ${
          isTauriRuntime()
            ? `<button type="button" class="ghost-button" data-action="settings-tab" data-settings-tab="storage">Chemins disque</button>`
            : ""
        }
      </div>
    </div>`;
}

export function renderAddressBookSidebarCountPill(): string {
  const n = state.addressBookSidebarCount;
  if (n == null || n < 0) return "";
  const title = `${n} contact${n === 1 ? "" : "s"} dans le carnet`;
  return `<span class="folder-count folder-count-wrap" title="${escapeAttr(title)}"><span class="folder-count-num">${n}</span></span>`;
}
