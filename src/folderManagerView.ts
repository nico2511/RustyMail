/** Vue Dossiers — arbre personnel interactif. */

import { invoke } from "@tauri-apps/api/core";
import { navRenderTrailHtml } from "./navigation";
import {
  buildPersonalMailboxTree,
  commonPrefixSegments,
  entryMapByMailbox,
  folderNodeOpenBySelection,
  type MailboxTreeNode,
} from "./mailboxTree";

export type MailboxTreeEntry = {
  mailbox: string;
  threadCount: number;
  messageCount: number;
  depth: number;
  isSystem: boolean;
  isEmpty: boolean;
};

export type MailboxTreeReport = {
  entries: MailboxTreeEntry[];
  lockedMailboxes: string[];
  autoArchiveMailboxes: string[];
  summary: {
    totalFolders: number;
    foldersWithMessages: number;
    rootPersonalCount: number;
    maxDepth: number;
    summaryLines: string[];
  };
};

export type ArchiveMailboxOutcome = {
  archived: number;
  errors: string[];
  destMailboxes: string[];
};

export type DeleteMailboxWithContentsOutcome = {
  deletedMailboxes: number;
  messagesRemoved: number;
  errors: string[];
};

export type FolderManagerViewState = {
  loading: boolean;
  report: MailboxTreeReport | null;
  selectedMailbox: string | null;
  expandedNodes: Record<string, boolean>;
  busyMailbox: string | null;
  busyAction: string | null;
  message: string;
  deleteConfirmOpen: boolean;
  pendingDeleteMailbox: string | null;
  deleteConfirmChecked: boolean;
  archiveConfirmOpen: boolean;
  pendingArchiveMailbox: string | null;
  archiveRemember: boolean;
  archiveProgress: string | null;
  dragFolder: string | null;
  dropTarget: string | null;
};

export type FolderManagerRenderDeps = {
  escapeHtml: (s: string) => string;
  escapeAttr: (s: string) => string;
  iconSvg: (name: string) => string;
  mailboxLabel: (mailbox: string) => string;
  renderSearchFilters: () => string;
  renderListPanel: () => string;
};

export function defaultFolderManagerState(): FolderManagerViewState {
  return {
    loading: false,
    report: null,
    selectedMailbox: null,
    expandedNodes: {},
    busyMailbox: null,
    busyAction: null,
    message: "",
    deleteConfirmOpen: false,
    pendingDeleteMailbox: null,
    deleteConfirmChecked: false,
    archiveConfirmOpen: false,
    pendingArchiveMailbox: null,
    archiveRemember: false,
    archiveProgress: null,
    dragFolder: null,
    dropTarget: null,
  };
}

export async function fetchMailboxTree(accountId: string): Promise<MailboxTreeReport> {
  return invoke<MailboxTreeReport>("list_mailbox_tree_cmd", {
    payload: { accountId },
  });
}

export async function setMailboxLocked(accountId: string, mailbox: string, locked: boolean): Promise<string[]> {
  return invoke<string[]>("set_mailbox_locked_cmd", {
    payload: { accountId, mailbox, locked },
  });
}

export async function archiveMailboxThreads(
  accountId: string,
  mailbox: string,
  rememberAutoArchive: boolean,
): Promise<ArchiveMailboxOutcome> {
  return invoke<ArchiveMailboxOutcome>("archive_mailbox_threads_cmd", {
    payload: { accountId, mailbox, rememberAutoArchive },
  });
}

export async function deleteMailboxWithContents(
  accountId: string,
  mailbox: string,
): Promise<DeleteMailboxWithContentsOutcome> {
  return invoke<DeleteMailboxWithContentsOutcome>("delete_imap_mailbox_with_contents_cmd", {
    payload: {
      accountId,
      mailbox,
      destructiveAck: "delete-mailbox-with-contents",
    },
  });
}

function isLocked(state: FolderManagerViewState, mailbox: string): boolean {
  const mb = mailbox.trim();
  return (state.report?.lockedMailboxes ?? []).some((m) => m.trim().toLowerCase() === mb.toLowerCase());
}

function isAutoArchive(state: FolderManagerViewState, mailbox: string): boolean {
  const mb = mailbox.trim();
  return (state.report?.autoArchiveMailboxes ?? []).some((m) => m.trim().toLowerCase() === mb.toLowerCase());
}

function nodeExpanded(
  state: FolderManagerViewState,
  key: string,
  selectedMailbox: string | null,
  hasChildren: boolean,
): boolean {
  if (!hasChildren) return false;
  const stored = state.expandedNodes[key];
  if (stored === false) return false;
  if (stored === true) return true;
  return folderNodeOpenBySelection(selectedMailbox ?? "", key);
}

function renderTreeNode(
  state: FolderManagerViewState,
  node: MailboxTreeNode,
  depth: number,
  entryByMb: Map<string, MailboxTreeEntry>,
  deps: FolderManagerRenderDeps,
): string {
  const { escapeHtml, escapeAttr, iconSvg } = deps;
  const hasChildren = node.children.length > 0;
  const mb = node.mailboxFull ?? (hasChildren ? undefined : node.label);
  const selected = mb && mb === state.selectedMailbox;
  const open = nodeExpanded(state, node.key, state.selectedMailbox, hasChildren);
  const entry = mb ? entryByMb.get(mb) : undefined;
  const locked = mb ? isLocked(state, mb) : false;
  const auto = mb ? isAutoArchive(state, mb) : false;
  const empty = entry?.isEmpty ?? (entry ? entry.messageCount === 0 : false);
  const busy = mb && state.busyMailbox === mb;
  const dropTarget = mb && state.dropTarget === mb;
  const dragging = mb && state.dragFolder === mb;

  const badges = [
    empty ? `<span class="folder-tree-tag folder-tree-tag--empty">vide</span>` : "",
    auto ? `<span class="folder-tree-tag folder-tree-tag--auto" title="Archivage mémorisé">Auto</span>` : "",
    locked ? `<span class="folder-tree-tag folder-tree-tag--locked" title="Dossier verrouillé">🔒</span>` : "",
  ]
    .filter(Boolean)
    .join(" ");

  const counts =
    entry ?
      `<span class="folder-tree-counts dim">${entry.threadCount} fil${entry.threadCount === 1 ? "" : "s"} · ${entry.messageCount} msg</span>`
    : "";

  const actions =
    mb ?
      `<span class="folder-tree-actions">
        <button type="button" class="icon-pill folder-tree-act folder-tree-act--open ${selected ? "is-active" : ""}" data-action="fm-select" data-mailbox="${escapeAttr(mb)}" title="Afficher les mails dans le panneau" aria-label="Afficher les mails de ${escapeAttr(node.label)}">${iconSvg("panel")}</button>
        <button type="button" class="icon-pill folder-tree-act" data-action="fm-sync" data-mailbox="${escapeAttr(mb)}" title="Synchroniser">↻</button>
        <button type="button" class="icon-pill folder-tree-act" data-action="fm-archive" data-mailbox="${escapeAttr(mb)}" title="Archiver">A</button>
        <button type="button" class="icon-pill folder-tree-act ${locked ? "is-active" : ""}" data-action="fm-toggle-lock" data-mailbox="${escapeAttr(mb)}" data-locked="${locked ? "1" : "0"}" title="Cadenas">🔒</button>
        ${
          !locked
            ? `<button type="button" class="icon-pill folder-tree-act" data-action="fm-delete" data-mailbox="${escapeAttr(mb)}" title="Supprimer">×</button>
        <span class="folder-tree-drag-handle" draggable="true" data-action="fm-drag-start" data-mailbox="${escapeAttr(mb)}" title="Déplacer">⠿</span>`
            : ""
        }
        <button type="button" class="icon-pill folder-tree-act" data-action="fm-create-child" data-mailbox="${escapeAttr(mb)}" title="Sous-dossier">+</button>
      </span>`
    : "";

  const chev = hasChildren ? (open ? "▾" : "▸") : "";

  const rowCls = [
    "folder-tree-row",
    selected ? "folder-tree-row--selected" : "",
    empty ? "folder-tree-node--empty" : "",
    locked ? "folder-tree-node--locked" : "",
    dropTarget ? "folder-tree-node--drop-target" : "",
    dragging ? "folder-tree-node--dragging" : "",
    busy ? "folder-tree-row--busy" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const childrenHtml =
    hasChildren && open ?
      node.children.map((c) => renderTreeNode(state, c, depth + 1, entryByMb, deps)).join("")
    : "";

  const labelHtml = `<span class="folder-tree-label">${escapeHtml(node.label)}</span>`;

  const toggleBtn =
    hasChildren
      ? `<button type="button" class="folder-tree-chevron" data-action="fm-toggle-node" data-node-key="${escapeAttr(node.key)}" aria-expanded="${open}">${chev}</button>`
      : `<span class="folder-tree-chevron-spacer"></span>`;

  return `<div class="folder-tree-node" data-node-key="${escapeAttr(node.key)}" style="--fm-depth:${depth}">
    <div class="${rowCls}" ${mb ? `data-drop-mailbox="${escapeAttr(mb)}"` : ""}>
      <div class="folder-tree-main">
        ${toggleBtn}
        <span class="folder-tree-body">
          ${labelHtml}
          ${badges}
          ${counts}
        </span>
      </div>
      ${actions}
    </div>
    ${childrenHtml ? `<div class="folder-tree-children">${childrenHtml}</div>` : ""}
  </div>`;
}

function renderDeleteModal(state: FolderManagerViewState, deps: FolderManagerRenderDeps): string {
  if (!state.deleteConfirmOpen || !state.pendingDeleteMailbox) return "";
  const mb = state.pendingDeleteMailbox;
  const entry = state.report?.entries.find((e) => e.mailbox === mb);
  const { escapeHtml, escapeAttr } = deps;
  return `<div class="modal-backdrop" data-action="fm-delete-cancel">
    <div class="modal surface-elevated modal-shell-stop-prop folder-manager-modal" role="dialog" aria-modal="true">
      <div class="modal-header"><strong>Supprimer le dossier</strong></div>
      <div class="modal-body">
        <p>Supprimer <strong>${escapeHtml(mb)}</strong> et son contenu ?</p>
        ${
          entry
            ? `<p class="dim">${entry.threadCount} fil(s), ${entry.messageCount} message(s)${entry.isEmpty ? " — dossier vide en cache" : ""}.</p>`
            : ""
        }
        <p class="dim">Cette action supprime définitivement les mails du serveur IMAP.</p>
        <label class="settings-form-check">
          <input type="checkbox" id="fm-delete-check" ${state.deleteConfirmChecked ? "checked" : ""} data-action="fm-delete-check-toggle" />
          Je comprends que les mails seront définitivement supprimés
        </label>
      </div>
      <div class="modal-footer">
        <button type="button" class="ghost-button" data-action="fm-delete-cancel">Annuler</button>
        <button type="button" class="primary-button" data-action="fm-delete-confirm" data-mailbox="${escapeAttr(mb)}" ${state.deleteConfirmChecked ? "" : "disabled"}>Supprimer</button>
      </div>
    </div>
  </div>`;
}

function renderArchiveModal(state: FolderManagerViewState, deps: FolderManagerRenderDeps): string {
  if (!state.archiveConfirmOpen || !state.pendingArchiveMailbox) return "";
  const mb = state.pendingArchiveMailbox;
  const entry = state.report?.entries.find((e) => e.mailbox === mb);
  const { escapeHtml, escapeAttr } = deps;
  const remembered = isAutoArchive(state, mb);
  return `<div class="modal-backdrop" data-action="fm-archive-cancel">
    <div class="modal surface-elevated modal-shell-stop-prop folder-manager-modal" role="dialog" aria-modal="true">
      <div class="modal-header"><strong>Archiver le dossier</strong></div>
      <div class="modal-body">
        <p>Archiver ${entry?.threadCount ?? "?"} fil(s) de <strong>${escapeHtml(mb)}</strong> vers l’archive IMAP ?</p>
        <label class="settings-form-check">
          <input type="checkbox" id="fm-archive-remember" ${state.archiveRemember || remembered ? "checked" : ""} data-action="fm-archive-remember-toggle" />
          Mémoriser ce dossier pour archivage futur
        </label>
        ${state.archiveProgress ? `<p class="dim">${escapeHtml(state.archiveProgress)}</p>` : ""}
      </div>
      <div class="modal-footer">
        <button type="button" class="ghost-button" data-action="fm-archive-cancel">Annuler</button>
        <button type="button" class="primary-button" data-action="fm-archive-confirm" data-mailbox="${escapeAttr(mb)}">Archiver</button>
      </div>
    </div>
  </div>`;
}

export function renderFolderManagerView(
  state: FolderManagerViewState,
  deps: FolderManagerRenderDeps,
): string {
  const { escapeHtml, renderListPanel, renderSearchFilters, mailboxLabel } = deps;
  const personal = (state.report?.entries ?? []).map((e) => e.mailbox);
  const drop = commonPrefixSegments(personal);
  const tree = buildPersonalMailboxTree(personal, drop);
  const entryByMb = entryMapByMailbox(state.report?.entries ?? []);

  const treeHtml =
    tree.length
      ? tree.map((n) => renderTreeNode(state, n, 0, entryByMb, deps)).join("")
      : `<p class="dim folder-tree-empty">Aucun dossier personnel. Créez-en un avec le bouton ci-dessous.</p>`;

  const sel = state.selectedMailbox;
  const selEntry = sel ? entryByMb.get(sel) : undefined;
  const autoBanner =
    sel && isAutoArchive(state, sel) && selEntry && selEntry.threadCount > 0
      ? `<div class="folder-manager-auto-banner">
          <span>Archivage mémorisé — ${selEntry.threadCount} fil(s) en attente</span>
          <button type="button" class="ghost-button ghost-button-sm" data-action="fm-archive" data-mailbox="${deps.escapeAttr(sel)}">Archiver maintenant</button>
        </div>`
      : "";

  const pageTitle = sel ? mailboxLabel(sel) : "Dossiers personnels";
  const pageSubtitle = state.loading
    ? "Chargement…"
    : state.message ||
      (sel && selEntry
        ? `${selEntry.threadCount} fil${selEntry.threadCount === 1 ? "" : "s"} · ${selEntry.messageCount} message${selEntry.messageCount === 1 ? "" : "s"}`
        : `${personal.length} dossier(s) personnel(s)`);

  const folderHeadActions =
    sel
      ? `<button type="button" class="ghost-button" data-action="fm-sync" data-mailbox="${deps.escapeAttr(sel)}">Sync</button>
         <button type="button" class="ghost-button" data-action="fm-archive" data-mailbox="${deps.escapeAttr(sel)}">Archiver tout</button>
         <button type="button" class="ghost-button" data-action="fm-open-inbox" data-mailbox="${deps.escapeAttr(sel)}">Ouvrir en liste</button>`
      : "";

  const searchBar =
    sel
      ? `<div class="folder-manager-search inbox-appbar inbox-appbar--folder-manager" aria-label="Recherche dans le dossier">${renderSearchFilters()}</div>`
      : "";

  return `<div class="folder-manager-page">
    ${navRenderTrailHtml(sel ? mailboxLabel(sel) : "Dossiers", escapeHtml, deps.escapeAttr, { navClass: "secondary-view-nav" })}
    ${searchBar}
    <header class="folder-manager-head">
      <div>
        <h1 class="org-page-title">${escapeHtml(pageTitle)}</h1>
        <p class="dim">${escapeHtml(pageSubtitle)}</p>
      </div>
      <div class="folder-manager-head-actions">
        ${folderHeadActions}
        <button type="button" class="ghost-button" data-action="fm-refresh">Actualiser</button>
        <button type="button" class="primary-button" data-action="fm-create-root">+ Nouveau dossier</button>
      </div>
    </header>
    <div class="folder-manager-split">
      <aside class="folder-manager-tree surface-sm" aria-label="Arbre des dossiers">
        <div class="folder-tree-scroll">${treeHtml}</div>
      </aside>
      <section class="folder-manager-list">
        ${autoBanner}
        <div class="folder-manager-list-body">${
          sel
            ? `<div class="inbox-index inbox-index--folder-embed">${renderListPanel()}</div>`
            : `<p class="dim folder-manager-pick">Cliquez sur le bouton panneau (⊞) d’un dossier pour afficher ses mails ici.</p>`
        }</div>
      </section>
    </div>
    ${renderDeleteModal(state, deps)}
    ${renderArchiveModal(state, deps)}
  </div>`;
}
