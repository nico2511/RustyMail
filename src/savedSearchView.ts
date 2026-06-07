/** Rendu sidebar « Vues » enregistrées + suggestions. */

import type { SuggestedSavedView } from "./activity";
import type { SavedSearchListItem } from "./savedSearches";

export function renderSuggestedViewsCardHtml(
  suggestions: SuggestedSavedView[],
  escapeHtml: (s: string) => string,
  escapeAttr: (s: string) => string,
): string {
  if (!suggestions.length) return "";
  const rows = suggestions
    .map(
      (s) => `<li class="suggested-view-row">
        <div class="suggested-view-main">
          <strong class="suggested-view-name">${escapeHtml(s.suggestedName || s.displayName)}</strong>
          <span class="suggested-view-rationale dim">${escapeHtml(s.rationaleFr)}</span>
        </div>
        <div class="suggested-view-actions">
          <button type="button" class="ghost-button suggested-view-btn" data-action="accept-view-suggestion" data-sender-email="${escapeAttr(s.senderEmail)}" title="Enregistrer comme vue">Enregistrer</button>
          <button type="button" class="icon-pill suggested-view-dismiss" data-action="dismiss-view-suggestion" data-sender-email="${escapeAttr(s.senderEmail)}" title="Ignorer">×</button>
          <button type="button" class="ghost-button suggested-view-snooze" data-action="snooze-view-suggestion" data-sender-email="${escapeAttr(s.senderEmail)}" title="Reporter 7 jours">Plus tard</button>
        </div>
      </li>`,
    )
    .join("");
  return `<div class="suggested-views-card" role="region" aria-label="Vues suggérées">
    <p class="suggested-views-card__title">Vues suggérées</p>
    <p class="suggested-views-card__hint dim">Basé sur votre activité locale — rien n’est envoyé en ligne.</p>
    <ul class="suggested-views-list">${rows}</ul>
  </div>`;
}

export function renderSavedSearchesSidebarHtml(
  items: SavedSearchListItem[],
  activeId: string | null,
  escapeHtml: (s: string) => string,
  escapeAttr: (s: string) => string,
): string {
  if (!items.length) {
    return `<p class="saved-views-empty dim">Enregistrez une recherche avec le bouton « Enregistrer la vue » sous la barre.</p>`;
  }
  return items
    .map((item) => {
      const active = item.id === activeId;
      const count = item.newCount ?? 0;
      const badge =
        count > 0
          ? `<span class="saved-view-badge" aria-label="${count} nouveau${count === 1 ? "" : "x"}">+${count}</span>`
          : "";
      const pin = item.pinned ? `<span class="saved-view-pin dim" aria-hidden="true">★</span>` : "";
      return `<div class="saved-view-row">
        <button type="button" class="folder-button saved-view-button ${active ? "active" : ""}" data-action="apply-saved-search" data-saved-search-id="${escapeAttr(item.id)}" title="Ouvrir la vue · ${escapeAttr(item.name)}">
          <span class="folder-icon">Vu</span>
          <span class="folder-name">${escapeHtml(item.name)}</span>
          ${pin}${badge}
        </button>
        <button type="button" class="icon-pill saved-view-delete" data-action="delete-saved-search" data-saved-search-id="${escapeAttr(item.id)}" title="Supprimer la vue" aria-label="Supprimer ${escapeAttr(item.name)}">×</button>
      </div>`;
    })
    .join("");
}
