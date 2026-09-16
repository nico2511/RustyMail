import {
  LOCAL_SAVED_DRAFTS_MAILBOX,
  isSavedDraftsVirtualMailbox,
  isUnifiedInboxMailbox,
  mailboxKind,
  mailboxesAllowedForMove,
  savedDraftIdFromThreadId,
  threadMailboxColumnTitle,
  threadMailboxListLabel,
} from "../../../mailboxKinds";
import {
  formatFriendlyThreadListDate,
  parseThreadListActivityDate,
  savedDraftDatesColumnSnippet,
  threadListActivityTooltip,
} from "../../../threadListDates";
import { escapeAttr, escapeHtml } from "../../../ui/sanitize";
import { renderMailboxDigestTriggerButton } from "../../mail/mailboxDigest";
import { iconSvg } from "../../lib/iconSvg";
import { initials } from "../../lib/tags";
import { isTauriRuntime } from "../../lib/tauriRuntime";
import { state } from "../../state";
import type { ThreadListItem } from "../../types";
import {
  renderAccountsRecoveryBanner,
  renderDefaultAccountPromptBanner,
  renderInboxChipBadge,
} from "./listChrome";
import { renderDeps } from "./renderDeps";
import {
  inboxSearchIconSvg,
  renderInboxSearchContextBlock,
  renderSearchBarStackHtml,
} from "./searchRender";
import { renderBackgroundActivityChips } from "./statusFooterRender";

function inboxListFooterInnerHtml(draftBoxVirtual: boolean, total: number): string {
  const loadMore =
    state.hasMoreThreads ?
      '<button type="button" class="ghost-button inbox-load-more" data-action="load-more">Charger plus</button>'
    : "";
  const chips = renderBackgroundActivityChips({ digestSlot: false });
  let center = "";
  if (chips) {
    center = `<div class="inbox-footer-activity" role="status" aria-live="polite">${chips}</div>`;
  } else if (!draftBoxVirtual && isTauriRuntime()) {
    center = `<span class="inbox-end-hint dim">Arrière-plan : en veille</span>`;
  } else if (draftBoxVirtual) {
    center = `<span class="inbox-end-hint dim">Stockage local SQLite · pas de sync IMAP</span>`;
  } else {
    center = `<span class="inbox-end-hint dim">Mode navigateur — lancez Tauri pour la sync</span>`;
  }
  const endList =
    !draftBoxVirtual && !state.hasMoreThreads && total > 0
      ? `<span class="inbox-end-hint dim" title="Pagination locale">Fin de liste (${total})</span>`
    : "";
  return `
    <div class="inbox-panel-footer__row">
      <div class="inbox-panel-footer__lead">${loadMore}</div>
      <div class="inbox-panel-footer__center">${center}</div>
      <div class="inbox-panel-footer__trail">${endList}</div>
    </div>`;
}

function renderThreadRow(thread: ThreadListItem): string {
  const d = renderDeps();
  const firstParticipant = thread.participants[0] ?? "??";
  const tid = String(thread.id);
  const savedRowId = savedDraftIdFromThreadId(tid);
  const unreadCls = thread.unread ? "thread-row--unread" : "";
  const mbRaw = thread.mailbox ?? state.selectedMailbox ?? "INBOX";
  const { label: folderLabel } = threadMailboxListLabel(mbRaw);
  const folderTitle = escapeAttr(threadMailboxColumnTitle(mbRaw));
  const accountBadge = (() => {
    const aid = thread.accountId?.trim();
    if (!aid || !isUnifiedInboxMailbox(state.selectedMailbox)) return "";
    const acc = state.accounts.find((a) => a.id === aid);
    const label = (acc?.email || acc?.displayName || aid).trim();
    if (!label) return "";
    return `<span class="inbox-thread-account-badge dim" title="${escapeAttr(label)}">${escapeHtml(label)}</span>`;
  })();
  const unread = Boolean(thread.unread);
  const toggleSeenTitle = unread ? "Marquer comme lu" : "Marquer comme non lu";
  const activityRaw = thread.lastActivity ?? "";
  const activityDisplay = formatFriendlyThreadListDate(activityRaw);
  const activityTip = escapeAttr(threadListActivityTooltip(activityRaw));
  const activityParsed = parseThreadListActivityDate(activityRaw);
  const activityDatetime = activityParsed ? escapeAttr(activityParsed.toISOString()) : "";
  const attachN = Math.max(0, Math.floor(Number(thread.attachmentCount) || 0));
  const attachAria = attachN === 1 ? "1 pièce jointe" : `${attachN} pièces jointes`;
  const attachGlyph =
    attachN > 0
      ? `<span class="inbox-thread-attach-hint dim" role="img" aria-label="${escapeAttr(attachAria)}">${iconSvg("attachment")}</span>`
      : "";
  const messageN = Math.max(1, Math.floor(Number(thread.messageCount) || 1));
  const threadAria = `Conversation, ${messageN} messages`;
  const threadGlyph =
    messageN > 1
      ? `<span class="inbox-thread-count-hint dim" role="img" aria-label="${escapeAttr(threadAria)}" title="${escapeAttr(threadAria)}">${iconSvg("thread")}<span class="inbox-thread-count-badge">${messageN}</span></span>`
      : "";

  if (savedRowId) {
    const revN = Math.max(0, Number(thread.savedRevisionCount) || 0);
    const verLabel = revN <= 1 ? "1 version locale" : `${revN} versions locales`;
    const { line1, line2, tip } = savedDraftDatesColumnSnippet(thread.savedCreatedAt, thread.lastActivity);
    const dateTip = escapeAttr(tip || activityTip);

    return `
    <div class="thread-row inbox-thread-row thread-row--saved-local" data-thread-id="${escapeAttr(tid)}" role="listitem">
      <button type="button" class="thread-row-main inbox-thread-row-main" data-open-thread="1" data-thread-id="${escapeAttr(tid)}">
        <span class="avatar inbox-thread-avatar" style="background:rgba(111,122,111,.2);color:var(--sm-primary)">${initials(firstParticipant)}</span>
        <span class="inbox-thread-stack">
          <span class="inbox-thread-line1">
            <span class="inbox-thread-from">${escapeHtml(firstParticipant)}</span>
          </span>
          <span class="inbox-thread-subject">
            <strong>${escapeHtml(thread.subject)}</strong>
          </span>
          <p class="thread-preview inbox-thread-preview dim">${escapeHtml(verLabel)} · ouvrir dans le compositeur</p>
        </span>
      </button>
      <div class="inbox-thread-date-col inbox-thread-date-col--saved-draft" title="${dateTip}">
        <div class="saved-draft-date-stack">
          ${
            line1
              ? `<div class="saved-draft-date-line saved-draft-date-line--primary">${escapeHtml(line1)}</div>`
              : ""
          }
          ${
            line2
              ? `<div class="saved-draft-date-line saved-draft-date-line--secondary dim">${escapeHtml(line2)}</div>`
              : ""
          }
        </div>
      </div>
      <div class="inbox-thread-folder-col" title="${folderTitle}">
        <span class="inbox-thread-folder-label">${escapeHtml(folderLabel)}</span>
      </div>
      <div class="thread-row-actions inbox-thread-actions row-actions" onclick="event.stopPropagation()">
        <button type="button" class="icon-pill danger" data-action="delete-saved-draft" data-saved-draft-id="${escapeAttr(savedRowId)}" title="Retirer de la liste" aria-label="Supprimer le brouillon enregistré">${iconSvg(
      "trash"
    )}</button>
      </div>
    </div>
  `;
  }

  const allowedTargets = mailboxesAllowedForMove(state.mailboxes);
  const sourceKey = mbRaw.trim().toLowerCase();
  const moveOptionsHtml = allowedTargets
    .filter((m) => m.toLowerCase() !== sourceKey)
    .map((m) => {
      const { label } = threadMailboxListLabel(m);
      const display = label === m ? m : `${label} — ${m}`;
      return `<option value="${escapeAttr(m)}">${escapeHtml(display)}</option>`;
    })
    .join("");
  const folderSelectHtml =
    allowedTargets.length > 0
      ? `<select class="inbox-thread-folder-move" data-action="move-thread-select" data-thread-id="${escapeAttr(tid)}" data-source-mailbox="${escapeAttr(mbRaw)}" title="Déplacer vers un autre dossier" aria-label="Déplacer ce fil vers un autre dossier"><option value="" selected>${escapeHtml(folderLabel)}</option>${moveOptionsHtml}</select>`
      : `<span class="inbox-thread-folder-label">${escapeHtml(folderLabel)}</span>`;
  const followed = Boolean(thread.followed);
  const followTitle = followed ? "Retirer du suivi" : "Suivre ce fil";
  const followIconHtml = `<button type="button" class="icon-pill inbox-thread-follow-toggle ${
    followed ? "inbox-thread-follow-toggle--on" : ""
  }" data-action="toggle-thread-follow" data-thread-id="${escapeAttr(tid)}" title="${escapeAttr(
    followTitle
  )}" aria-label="${escapeAttr(followTitle)}" aria-pressed="${followed}">${iconSvg(
    followed ? "starFilled" : "starOutline"
  )}</button>`;
  const previewClean = d.cleanThreadListPreview(thread.preview);

  return `
    <div class="thread-row inbox-thread-row ${unreadCls}" data-thread-id="${escapeAttr(tid)}" role="listitem">
      <button type="button" class="thread-row-main inbox-thread-row-main" data-open-thread="1" data-thread-id="${escapeAttr(tid)}">
        <span class="avatar inbox-thread-avatar" style="background:rgba(111,122,111,.2);color:var(--sm-primary)">${initials(firstParticipant)}</span>
        <span class="inbox-thread-stack">
          <span class="inbox-thread-line1">
            <span class="inbox-thread-from">${escapeHtml(firstParticipant)}</span>
            ${accountBadge}
            <time class="inbox-thread-time inbox-thread-time-narrow-only dim" datetime="${activityDatetime}" title="${activityTip}">${escapeHtml(activityDisplay)}</time>
          </span>
          <span class="inbox-thread-subject">
            ${thread.unread ? '<span class="inbox-unread-dot" aria-hidden="true"></span>' : ""}
            <strong>${escapeHtml(thread.subject)}</strong>
            ${attachGlyph}
            ${threadGlyph}
          </span>
          <p class="thread-preview inbox-thread-preview">${escapeHtml(previewClean)}</p>
        </span>
      </button>
      <div class="inbox-thread-date-col" title="${activityTip}">
        <time class="inbox-thread-date-label dim" datetime="${activityDatetime}">${escapeHtml(activityDisplay)}</time>
      </div>
      <div class="inbox-thread-folder-col" title="${folderTitle}" onclick="event.stopPropagation()">
        ${folderSelectHtml}
      </div>
      <div class="thread-row-actions inbox-thread-actions row-actions" onclick="event.stopPropagation()">
        ${followIconHtml}
        <span class="action-sep" aria-hidden="true"></span>
        <button type="button" class="icon-pill inbox-seen-toggle ${unread ? "inbox-seen-toggle--is-unread" : ""}" data-action="toggle-thread-seen" data-thread-id="${escapeAttr(
    tid
  )}" title="${escapeAttr(toggleSeenTitle)}" aria-label="${escapeAttr(toggleSeenTitle)}">${iconSvg(unread ? "read" : "unread")}</button>
        <span class="action-sep" aria-hidden="true"></span>
        <button type="button" class="icon-pill danger" data-mv="trash" data-thread-id="${escapeAttr(tid)}" title="Corbeille" aria-label="Corbeille">${iconSvg("trash")}</button>
        <button type="button" class="icon-pill" data-mv="archive" data-thread-id="${escapeAttr(tid)}" title="Archiver" aria-label="Archiver">${iconSvg("archive")}</button>
      </div>
    </div>
  `;
}

export function renderList(mode: "full" | "threads-only" | "filters-only" = "full"): string {
  const d = renderDeps();
  const visible = d.threadsVisibleInList();
  const total = state.threads.length;
  const panelMb = d.folderManagerPanelMailbox();
  const listMailbox = panelMb ?? state.selectedMailbox;
  const draftBoxVirtual = isSavedDraftsVirtualMailbox(listMailbox);
  const mailboxKey = listMailbox || "INBOX";
  const fc = state.inboxFilterCounts;
  const allN = draftBoxVirtual ? 0 : (fc?.all ?? state.mailboxTotal[mailboxKey] ?? total);
  const unreadN = draftBoxVirtual ? 0 : (fc?.unread ?? state.mailboxUnread[mailboxKey] ?? 0);
  const starredN = draftBoxVirtual ? 0 : (fc?.starred ?? 0);
  const focusedN = draftBoxVirtual ? 0 : (fc?.focused ?? 0);
  const autoN = draftBoxVirtual ? 0 : (fc?.auto ?? 0);
  const listEntityPlural = draftBoxVirtual ? `brouillon${total === 1 ? "" : "s"}` : `conversation${total === 1 ? "" : "s"}`;
  const imapToolbarLocked = draftBoxVirtual;
  const filterAll = state.listFilter === "all";
  const filterUnread = state.listFilter === "unread";
  const filterStarred = state.listFilter === "starred";
  const filterFocused = state.listFilter === "focused";
  const filterAuto = state.listFilter === "auto";
  const showEmptyTrash =
    !draftBoxVirtual && isTauriRuntime() && mailboxKind(listMailbox || "") === "trash";
  const showBulkTrashVisible =
    !draftBoxVirtual &&
    isTauriRuntime() &&
    !d.isSearchActive() &&
    mailboxKind(listMailbox || "") !== "trash" &&
    visible.length > 0 &&
    (state.listFilter === "all" ||
      state.listFilter === "unread" ||
      state.listFilter === "focused" ||
      state.listFilter === "auto" ||
      state.listFilter === "starred");

  const searchContext = d.inboxSearchContextActive();
  const savedView = d.activeSavedSearchItem();
  const mailboxTitleRaw = draftBoxVirtual
    ? threadMailboxListLabel(LOCAL_SAVED_DRAFTS_MAILBOX).label
    : panelMb
      ? threadMailboxListLabel(panelMb).label
      : state.selectedMailbox || "INBOX";
  const listTitle = searchContext
    ? savedView
      ? savedView.name
      : "Recherche"
    : mailboxTitleRaw;
  const mailboxLabel = escapeHtml(listTitle);
  const batchJobMsg = d.searchViewBatchJobStatusText();
  const listSubtitle = searchContext
    ? `${visible.length} fil${visible.length === 1 ? "" : "s"} affiché${visible.length === 1 ? "" : "s"}${savedView && (savedView.newCount ?? 0) > 0 ? ` · ${savedView.newCount} nouveau${savedView.newCount === 1 ? "" : "x"}` : ""}${batchJobMsg ? ` · ${batchJobMsg}` : state.syncMessage ? ` · ${state.syncMessage}` : ""}`
    : `${visible.length} sur ${total} ${listEntityPlural}${state.syncMessage ? ` · ${state.syncMessage}` : ""}`;

  const imapFiltersBlock =
    draftBoxVirtual ?
      `
        <label class="inbox-search surface-sm inbox-search--sauves-only">
          ${inboxSearchIconSvg()}
          <input id="search-input" type="search" value="${escapeAttr(state.searchDraft)}" placeholder="Filtrer… Entrée pour appliquer" aria-label="Filtrer les brouillons sauvegardés" autocomplete="off" />
          ${d.searchDraftDiffersFromCommitted() ? `<span class="inbox-search-pending dim" title="Entrée pour appliquer le filtre">↵</span>` : ""}
        </label>
      `
    : searchContext
      ? renderInboxSearchContextBlock(visible.length)
    : `
        ${renderSearchBarStackHtml("search-input", { showSlashHint: true })}

        <div class="inbox-chips" role="toolbar" aria-label="Filtres de la boîte">
          <button type="button" class="inbox-chip ${filterAll ? "inbox-chip-active" : ""}" data-action="list-filter-all">Tout${renderInboxChipBadge(allN)}</button>
          <button type="button" class="inbox-chip ${filterUnread ? "inbox-chip-active" : ""}" data-action="list-filter-unread">
            Non lus${renderInboxChipBadge(unreadN)}
          </button>
          <button type="button" class="inbox-chip ${filterStarred ? "inbox-chip-active" : ""}" data-action="list-filter-starred" title="Fils marqués « Suivre » (étoile) — tous dossiers">
            Suivis${renderInboxChipBadge(starredN)}
          </button>
          <button type="button" class="inbox-chip ${filterFocused ? "inbox-chip-active" : ""}" data-action="list-filter-focused" title="Masquer les fils classés expéditeur automatique">
            Priorité${renderInboxChipBadge(focusedN)}
          </button>
          <button type="button" class="inbox-chip ${filterAuto ? "inbox-chip-active" : ""}" data-action="list-filter-auto" title="Uniquement les fils expéditeur automatique">
            Auto${renderInboxChipBadge(autoN)}
          </button>
        </div>
      `;

  const sauvesHint =
    draftBoxVirtual ?
      `<p class="inbox-mailbox-note dim">Stockage local (SQLite). Aucune donnée envoyée au serveur IMAP.</p>`
    : "";

  const inboxListPanelHtml = `
      <div class="inbox-panel surface">
        <div class="inbox-thread-list" role="list">
          ${
            visible.length
              ? visible.map(renderThreadRow).join("")
              : `<div class="inbox-empty">
                  <p class="inbox-empty-title">${draftBoxVirtual ? "Aucun brouillon sauvegardé" : "Aucune conversation"}</p>
                  <p class="inbox-empty-hint dim">${
                    draftBoxVirtual
                      ? "Dans le compositeur, appuyez sur « Enregistrer » pour ajouter un brouillon à cette liste."
                      : d.isSearchActive()
                        ? "Aucun message ne correspond. Essayez un autre mot-clé, le dossier « Tout », ou synchronisez la boîte."
                        : "Changez de filtre ou de dossier, ou lancez une synchronisation."
                  }</p>
                </div>`
          }
        </div>
        <div class="inbox-panel-footer">
          ${inboxListFooterInnerHtml(draftBoxVirtual, total)}
        </div>
      </div>`;

  if (mode === "threads-only") return inboxListPanelHtml;
  if (mode === "filters-only") return imapFiltersBlock;

  return `
    <section class="thread-view inbox-index ${draftBoxVirtual ? "inbox-index--sauves" : ""}${searchContext ? " inbox-index--search-context" : ""}" aria-label="Inbox">
      <header class="inbox-appbar${searchContext ? " inbox-appbar--search-context" : ""}">
        <div class="inbox-appbar-top">
          <div class="inbox-appbar-intro">
            <div class="inbox-mailbox-title-row">
              ${
                draftBoxVirtual ?
                  `<button type="button" class="ghost-button inbox-back-imap-btn" data-action="leave-saved-drafts-mailbox" title="Revenir aux dossiers IMAP">← IMAP</button>`
                : searchContext
                  ? `<button type="button" class="ghost-button inbox-back-imap-btn" data-action="clear-search-exit" title="Quitter la recherche et revenir au dossier">← ${escapeHtml(threadMailboxListLabel(mailboxTitleRaw).label)}</button>`
                : ""
              }
              <h1 class="inbox-mailbox-title${searchContext ? " inbox-mailbox-title--search" : ""}">${mailboxLabel}</h1>
              ${
                savedView && (savedView.newCount ?? 0) > 0
                  ? `<span class="inbox-view-new-pill" aria-label="${savedView.newCount} nouveau${savedView.newCount === 1 ? "" : "x"}">+${savedView.newCount}</span>`
                  : ""
              }
            </div>
            <p class="inbox-mailbox-sub">${escapeHtml(listSubtitle)}</p>
            ${
              state.mailListError && !draftBoxVirtual
                ? `<p class="inbox-load-error" role="alert">${escapeHtml(state.mailListError)}</p>`
                : ""
            }
            ${sauvesHint}
          </div>
          <div class="inbox-appbar-actions">
            ${!imapToolbarLocked ? renderMailboxDigestTriggerButton("inbox-toolbar-btn") : ""}
            <button type="button" class="ghost-button inbox-toolbar-btn" data-action="open-mailbox-manage" title="Gérer les dossiers" ${
              imapToolbarLocked ? "disabled" : ""
            }>Dossiers</button>
            <button type="button" class="ghost-button inbox-toolbar-btn" data-action="sync-inbox" title="Synchroniser la boîte IMAP (Ctrl+F5)" ${
              imapToolbarLocked || state.syncInProgress ? "disabled" : ""
            }>
              ${state.syncInProgress ? `<span class="mini-sync"><span class="spinner" aria-hidden="true"></span><span>Sync…</span></span>` : "Sync"}
            </button>
            ${
              showEmptyTrash
                ? `<button type="button" class="ghost-button inbox-toolbar-btn" style="color:var(--danger)" data-action="empty-trash-mailbox" title="Supprimer définitivement tous les messages de ce dossier">Tout supprimer</button>`
                : ""
            }
            ${
              showBulkTrashVisible
                ? `<button type="button" class="ghost-button inbox-toolbar-btn" style="color:var(--danger)" data-action="bulk-trash-visible" title="Mettre à la corbeille toutes les conversations actuellement affichées">Tout supprimer</button>`
                : ""
            }
          </div>
        </div>

        ${imapFiltersBlock}
      </header>
      ${renderAccountsRecoveryBanner()}
      ${renderDefaultAccountPromptBanner()}

      ${inboxListPanelHtml}
    </section>
  `;
}
