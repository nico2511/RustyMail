import { escapeAttr, escapeHtml } from "../../../ui/sanitize";
import { formatTag } from "../../lib/tags";
import {
  tagToSearchDraft,
  threadTagFamilyLabel,
  threadTagsForModal,
} from "../../lib/threadTagsModal";
import { iconSvg } from "../../lib/iconSvg";
import { state } from "../../state";
import type { Tag } from "../../types";
import { renderDeps } from "./renderDeps";

export function renderThreadTagChip(tag: Tag): string {
  const label = formatTag(tag);
  const draft = tagToSearchDraft(tag);
  if (!draft) {
    return `<span class="thread-tag-chip">${escapeHtml(label)}</span>`;
  }
  const fam = String(tag.family).toLowerCase();
  return `<button type="button" class="thread-tag-chip thread-tag-chip--search" data-action="search-from-tag" data-tag-family="${escapeAttr(fam)}" data-tag-value="${escapeAttr(tag.value)}" title="Rechercher · ${escapeAttr(label)}">${escapeHtml(label)}</button>`;
}

export function renderThreadTagsChipsHtml(tags: Tag[]): string {
  if (!tags.length) return `<p class="dim thread-tags-empty">Aucun tag.</p>`;
  const byFamily = new Map<Tag["family"], Tag[]>();
  for (const tag of tags) {
    const list = byFamily.get(tag.family) ?? [];
    list.push(tag);
    byFamily.set(tag.family, list);
  }
  const order: Tag["family"][] = ["Kind", "Source", "State", "Entity"];
  return order
    .filter((family) => byFamily.has(family))
    .map((family) => {
      const chips = (byFamily.get(family) ?? [])
        .map((tag) => renderThreadTagChip(tag))
        .join("");
      return `<section class="thread-tags-group" aria-label="${escapeAttr(threadTagFamilyLabel(family))}">
        <p class="thread-tags-group-kicker dim">${escapeHtml(threadTagFamilyLabel(family))}</p>
        <div class="thread-tags-group-chips">${chips}</div>
      </section>`;
    })
    .join("");
}

export function renderThreadTagsDialog(): string {
  if (!state.threadTagsModalOpen || state.view !== "thread" || !state.selectedThread) return "";
  const d = renderDeps();
  const thread = state.selectedThread;
  const threadTags = threadTagsForModal(thread.tags ?? []);
  const msgs = d.sortMessagesByReceivedDescending(thread.messages ?? []);
  const perMessageHtml = msgs
    .map((message, i) => {
      const tags = threadTagsForModal(message.tags ?? []);
      if (!tags.length) return "";
      const label = d.normalizeThreadSenderLabel(message.sender) || `Message ${i + 1}`;
      const when = d.formatThreadReadingWhen(message.receivedAt);
      return `<section class="thread-tags-msg-block" aria-label="Tags message ${i + 1}">
        <p class="thread-tags-msg-kicker dim">${escapeHtml(label)}${when ? ` · ${escapeHtml(when)}` : ""}</p>
        ${renderThreadTagsChipsHtml(tags)}
      </section>`;
    })
    .filter(Boolean)
    .join("");
  const nThread = threadTags.length;
  const nMsg = msgs.reduce((s, m) => s + threadTagsForModal(m.tags ?? []).length, 0);
  const countHint =
    nThread + nMsg === 0 ? "Aucun tag indexé"
    : nMsg > 0 ? `${nThread} sur le fil · tags par message ci-dessous`
    : `${nThread} tag${nThread === 1 ? "" : "s"}`;
  return `
    <div class="modal-backdrop" data-action="close-thread-tags">
      <div class="modal surface-elevated thread-tags-modal modal-shell-stop-prop" role="dialog" aria-modal="true" aria-labelledby="thread-tags-title">
        <div class="modal-header">
          <strong id="thread-tags-title">Tags du fil</strong>
          <button type="button" class="icon-pill" data-action="close-thread-tags" aria-label="Fermer">${iconSvg("close")}</button>
        </div>
        <p class="thread-tags-subtitle dim">${escapeHtml(thread.subject)} · ${escapeHtml(countHint)}</p>
        <div class="modal-body thread-tags-body">
          <section class="thread-tags-section" aria-label="Tags du fil">
            <p class="thread-tags-section-kicker">Fil</p>
            ${renderThreadTagsChipsHtml(threadTags)}
          </section>
          ${perMessageHtml ? `<section class="thread-tags-section" aria-label="Tags par message"><p class="thread-tags-section-kicker">Par message</p>${perMessageHtml}</section>` : ""}
        </div>
        <div class="modal-footer">
          <button type="button" class="ghost-button" data-action="retag-thread" data-thread-id="${escapeAttr(state.selectedThreadId ?? "")}">Recalculer les tags</button>
          <button type="button" class="ghost-button" data-action="close-thread-tags">Fermer</button>
        </div>
      </div>
    </div>
  `;
}
