import {
  threadMailboxColumnTitle,
  threadMailboxListLabel,
} from "../../../mailboxKinds";
import {
  formatFriendlyThreadListDate,
  parseThreadListActivityDate,
  threadListActivityTooltip,
} from "../../../threadListDates";
import type { OrgProposal, OrgThreadRef } from "../../../organizationView";
import { escapeAttr, escapeHtml } from "../../../ui/sanitize";
import { iconSvg } from "../../lib/iconSvg";
import { initials } from "../../lib/tags";
import { state } from "../../state";
import { newsletterEmailListed } from "../../mail/newsletterRulesMatch";
import { cleanThreadListPreview } from "../../mail/mailListPreviewClean";
import { renderDeps } from "./renderDeps";
import { renderThreadNlRuleButton } from "./threadViewRender";

export function renderOrgThreadSampleRow(ref: OrgThreadRef, proposal: OrgProposal): string {
  const d = renderDeps();
  const syncBtn = (mailbox: string, title: string) => {
    const mbAttr = escapeAttr(mailbox);
    const syncing = state.organization.rowSyncMailbox === mailbox;
    return `<button type="button" class="icon-pill${syncing ? " is-loading" : ""}" data-action="org-sync-mailbox" data-mailbox="${mbAttr}" title="${escapeAttr(title)}" aria-label="${escapeAttr(title)}" ${syncing ? "disabled" : ""}>${iconSvg("sync")}</button>`;
  };
  if (ref.threadId.startsWith("mailbox:")) {
    const mbRaw = ref.mailbox.trim();
    const { label: folderLabel } = threadMailboxListLabel(mbRaw);
    const mbAttr = escapeAttr(mbRaw);
    const rowActions = [
      syncBtn(mbRaw, "Resynchroniser ce dossier"),
      `<span class="action-sep" aria-hidden="true"></span>`,
      `<button type="button" class="icon-pill danger" data-action="org-delete-mailbox-one" data-mailbox="${mbAttr}" data-mailbox-ref-id="${escapeAttr(ref.threadId)}" title="Supprimer ce dossier vide" aria-label="Supprimer le dossier">${iconSvg("trash")}</button>`,
    ].join("");
    return `
    <div class="thread-row inbox-thread-row org-thread-row org-thread-row--mailbox" data-mailbox-ref="${mbAttr}" role="listitem">
      <button type="button" class="thread-row-main inbox-thread-row-main" data-action="org-open-mailbox" data-mailbox="${mbAttr}" title="Ouvrir ce dossier">
        <span class="avatar inbox-thread-avatar" style="background:rgba(111,122,111,.12);color:var(--sm-primary)">${iconSvg("archive")}</span>
        <span class="inbox-thread-stack">
          <span class="inbox-thread-line1">
            <span class="inbox-thread-from">${escapeHtml(folderLabel)}</span>
          </span>
          <span class="inbox-thread-subject"><strong>${escapeHtml(ref.subject)}</strong></span>
        </span>
      </button>
      <div class="inbox-thread-folder-col" title="${escapeAttr(mbRaw)}" onclick="event.stopPropagation()">
        <button type="button" class="org-mailbox-link inbox-thread-folder-label" data-action="org-open-mailbox" data-mailbox="${mbAttr}" title="Ouvrir ce dossier">${escapeHtml(folderLabel)}</button>
      </div>
      <div class="thread-row-actions inbox-thread-actions row-actions org-thread-row-actions" onclick="event.stopPropagation()">${rowActions}</div>
    </div>`;
  }
  const tid = ref.threadId;
  const senderRaw = (ref.senderEmail ?? ref.fromLabel ?? "").trim();
  const from = senderRaw || ref.mailbox || "??";
  const unread = Boolean(ref.unread);
  const unreadCls = unread ? "thread-row--unread" : "";
  const mbRaw = ref.mailbox || "INBOX";
  const { label: folderLabel } = threadMailboxListLabel(mbRaw);
  const folderTitle = escapeAttr(threadMailboxColumnTitle(mbRaw));
  const previewClean = cleanThreadListPreview(ref.preview ?? "");
  const activityRaw = ref.lastActivity ?? "";
  const activityDisplay = formatFriendlyThreadListDate(activityRaw);
  const activityTip = escapeAttr(threadListActivityTooltip(activityRaw));
  const activityParsed = parseThreadListActivityDate(activityRaw);
  const activityDatetime = activityParsed ? escapeAttr(activityParsed.toISOString()) : "";
  const nlListed = senderRaw ? newsletterEmailListed(senderRaw) : false;
  const autoBtn = senderRaw.includes("@") ? renderThreadNlRuleButton(senderRaw, nlListed) : "";
  const mbAttr = escapeAttr(mbRaw);
  const rowActions: string[] = [];
  if (autoBtn) rowActions.push(autoBtn);
  if (rowActions.length) rowActions.push(`<span class="action-sep" aria-hidden="true"></span>`);
  rowActions.push(
    `<button type="button" class="icon-pill danger" data-mv="trash" data-thread-id="${escapeAttr(tid)}" data-source-mailbox="${mbAttr}" title="Corbeille (ce fil)" aria-label="Corbeille">${iconSvg("trash")}</button>`,
  );
  rowActions.push(`<span class="action-sep" aria-hidden="true"></span>`);
  rowActions.push(
    `<button type="button" class="icon-pill" data-mv="archive" data-thread-id="${escapeAttr(tid)}" data-source-mailbox="${mbAttr}" title="Archiver (ce fil)" aria-label="Archiver">${iconSvg("archive")}</button>`,
  );
  rowActions.push(`<span class="action-sep" aria-hidden="true"></span>`);
  rowActions.push(syncBtn(mbRaw, "Resynchroniser le dossier de ce fil"));
  const rowActionsHtml = rowActions.join("");
  const unsubCol = (() => {
    const isUnsubCard =
      proposal.kind === "unsubscribeNewsletter" || proposal.kind === "unsubscribeTransactional";
    if (!isUnsubCard) return "";
    const links = d.sortUnsubscribeLinks((ref.unsubscribeLinks ?? []).filter(Boolean)).slice(0, 3);
    if (!links.length) return `<div class="org-unsub-col dim" title="Aucun lien de désinscription indexé">—</div>`;
    const primary = links[0];
    const extra = links.length > 1 ? ` (+${links.length - 1})` : "";
    return `<div class="org-unsub-col" onclick="event.stopPropagation()" onmousedown="event.stopPropagation()">
      <button type="button" class="org-unsub-link" data-action="mail-unsubscribe-open" data-href="${escapeAttr(primary)}" title="${escapeAttr(primary)}">Se désinscrire${escapeHtml(extra)}</button>
    </div>`;
  })();
  return `
    <div class="thread-row inbox-thread-row org-thread-row ${unreadCls}" data-thread-id="${escapeAttr(tid)}" role="listitem">
      <button type="button" class="thread-row-main inbox-thread-row-main" data-open-thread="1" data-thread-id="${escapeAttr(tid)}" title="Lire le fil">
        <span class="avatar inbox-thread-avatar" style="background:rgba(111,122,111,.2);color:var(--sm-primary)">${initials(from)}</span>
        <span class="inbox-thread-stack">
          <span class="inbox-thread-line1">
            <span class="inbox-thread-from">${escapeHtml(from)}</span>
            <time class="inbox-thread-time inbox-thread-time-narrow-only dim" datetime="${activityDatetime}" title="${activityTip}">${escapeHtml(activityDisplay)}</time>
          </span>
          <span class="inbox-thread-subject">
            ${unread ? '<span class="inbox-unread-dot" aria-hidden="true"></span>' : ""}
            <strong>${escapeHtml(ref.subject || "(sans sujet)")}</strong>
          </span>
          <p class="thread-preview inbox-thread-preview">${escapeHtml(previewClean)}</p>
        </span>
      </button>
      <div class="inbox-thread-date-col" title="${activityTip}">
        <time class="inbox-thread-date-label dim" datetime="${activityDatetime}">${escapeHtml(activityDisplay)}</time>
      </div>
      <div class="inbox-thread-folder-col" title="${folderTitle}" onclick="event.stopPropagation()">
        <button type="button" class="org-mailbox-link inbox-thread-folder-label" data-action="org-open-mailbox" data-mailbox="${mbAttr}" title="Ouvrir ce dossier">${escapeHtml(folderLabel)}</button>
      </div>
      ${unsubCol}
      <div class="thread-row-actions inbox-thread-actions row-actions" onclick="event.stopPropagation()">${rowActionsHtml}</div>
    </div>
  `;
}
