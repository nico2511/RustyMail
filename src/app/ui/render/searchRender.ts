import { isAiFeatureEnabled } from "../../../aiFeatures";
import { threadMailboxListLabel } from "../../../mailboxKinds";
import { escapeAttr } from "../../../ui/sanitize";
import { formatNewsletterRuleInput } from "../../lib/newsletterRuleFormat";
import { SAVED_VIEW_BATCH_MAX } from "../../lib/savedViewBatch";
import { SEARCH_LIST_FILTER_LABELS } from "../../lib/searchListFilterLabels";
import { truncateSearchBadgeLabel } from "../../lib/searchBadgeLabel";
import { searchScopeBadgeShort, searchScopeLabel } from "../../lib/searchScopeLabels";
import { isTauriRuntime } from "../../lib/tauriRuntime";
import { iconSvg } from "../../lib/iconSvg";
import { state } from "../../state";
import { renderDeps } from "./renderDeps";
import { renderSearchBadgeChip } from "./searchBadgeChip";

export function inboxSearchIconSvg(): string {
  return `<svg class="inbox-search-svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.35-4.35"/></svg>`;
}

export function renderSearchBadgesHtml(): string {
  const d = renderDeps();
  const parts: string[] = [];

  const q = state.search.trim();
  if (q) {
    const short = truncateSearchBadgeLabel(q, 24);
    parts.push(
      renderSearchBadgeChip({
        kind: "text",
        label: `« ${short} »`,
        title: `Texte : ${q}`,
        action: "clear-search-text",
      }),
    );
  }

  for (const sender of state.searchSenders) {
    const at = sender.indexOf("@");
    const local = at >= 0 ? sender.slice(0, at) : sender;
    const isDomainOnly = at < 0 && sender.includes(".");
    parts.push(
      renderSearchBadgeChip({
        kind: "sender",
        label: isDomainOnly
          ? truncateSearchBadgeLabel(sender, 20)
          : `@${truncateSearchBadgeLabel(local, 18)}`,
        title: isDomainOnly ? `Domaine expéditeur : ${sender}` : `Contact : ${sender}`,
        action: "clear-search-sender-one",
        dataEmail: sender,
      }),
    );
  }

  const explicitMb = d.effectiveSearchMailboxPath();
  if (explicitMb) {
    const { label, full } = threadMailboxListLabel(explicitMb);
    parts.push(
      renderSearchBadgeChip({
        kind: "scope-mailbox",
        label: truncateSearchBadgeLabel(label, 18),
        title: label === full ? `Dossier : ${full}` : `Dossier : ${label} — ${full}`,
        action: "clear-search-mailbox",
      }),
    );
  }

  if (state.searchAccountOverrideId?.trim()) {
    const acc = state.accounts.find((a) => a.id === state.searchAccountOverrideId);
    const label = acc?.email ?? state.searchAccountOverrideId;
    parts.push(
      renderSearchBadgeChip({
        kind: "scope-account",
        label: truncateSearchBadgeLabel(label, 20),
        title: `Compte : ${label}`,
        action: "clear-search-account",
      }),
    );
  }

  for (const tag of state.searchTags) {
    const fam = String(tag.family).toLowerCase();
    parts.push(
      renderSearchBadgeChip({
        kind: "tags",
        label: truncateSearchBadgeLabel(`#${fam}:${tag.value}`, 24),
        title: `Tag ${fam}:${tag.value} — domaine expéditeur (source) ou dossier/type (kind)`,
        action: "clear-search-tag-one",
        dataTag: `${fam}:${tag.value}`,
      }),
    );
  }

  if (state.searchNewsletterRule) {
    const rule = formatNewsletterRuleInput(state.searchNewsletterRule);
    parts.push(
      renderSearchBadgeChip({
        kind: "auto-rule",
        label: truncateSearchBadgeLabel(rule, 22),
        title: `Règle auto : ${rule}`,
        action: "clear-search-newsletter-rule",
      }),
    );
  }

  const lf = state.listFilter;
  if (state.searchModifiersTouched && lf !== "all") {
    parts.push(
      renderSearchBadgeChip({
        kind: `filter-${lf}`,
        label: SEARCH_LIST_FILTER_LABELS[lf],
        title: "Retirer ce filtre de la recherche",
        action: "clear-search-list-filter",
      }),
    );
  }

  if (state.searchNlMode || state.searchLanguageFilter) {
    const bits: string[] = [];
    if (state.searchNlMode) bits.push(`mode ${state.searchNlMode}`);
    if (state.searchLanguageFilter) bits.push(`langue ${state.searchLanguageFilter.toUpperCase()}`);
    parts.push(
      renderSearchBadgeChip({
        kind: "nl",
        label: truncateSearchBadgeLabel(`IA : ${bits.join(" · ") || "interprétation"}`, 28),
        title: "Recherche interprétée en langage naturel. Cliquez pour retirer les modificateurs IA.",
        action: "clear-search-nl-filters",
      }),
    );
  }

  const lang = state.searchLanguageFilter?.trim();
  if (lang) {
    parts.push(
      renderSearchBadgeChip({
        kind: "language",
        label: lang.toUpperCase(),
        title: `Langue : ${lang}`,
        action: "clear-search-nl-filters",
      }),
    );
  }

  if (!explicitMb && state.view !== "folderManager" && d.inboxSearchContextActive()) {
    parts.push(
      renderSearchBadgeChip({
        kind: state.searchScope === "account" ? "scope-account" : "scope-mailbox",
        label: searchScopeBadgeShort(),
        title: `${searchScopeLabel()} — cliquer pour basculer avec « tout le compte »`,
        action: "toggle-search-scope",
        dismissible: false,
      }),
    );
  }

  if (
    state.searchSenders.length > 0 &&
    isTauriRuntime() &&
    isAiFeatureEnabled(state.appPrefs.ai, "featureThreadSummaryEnabled")
  ) {
    parts.push(
      `<button type="button" class="search-badge search-badge--summarize" role="listitem" data-action="summarize-sender-threads" title="Résumer le fil ouvert ou le contexte filtré"><span class="search-badge__label">Résumer</span></button>`,
    );
  }

  if (parts.length === 0) return "";

  return `<div class="inbox-search-badges" role="list" aria-label="Critères de recherche actifs">${parts.join("")}</div>`;
}

export function renderSaveSearchViewButtonHtml(): string {
  if (!renderDeps().canSaveSearchView()) return "";
  return `<button type="button" class="search-save-view-btn" data-action="save-saved-search" title="Enregistrer ces critères comme vue dans la sidebar">Enregistrer la vue</button>`;
}

export function renderSearchBarMetaRow(
  badgesHtml: string,
  trailingActionsHtml = "",
  opts?: { includeSaveButton?: boolean },
): string {
  const saveBtn = opts?.includeSaveButton !== false ? renderSaveSearchViewButtonHtml() : "";
  const actions = [saveBtn, trailingActionsHtml].filter(Boolean).join("");
  if (!badgesHtml && !actions) return "";
  return `<div class="search-bar-meta">
    ${badgesHtml ? `<div class="search-bar-meta__badges search-context-filters" aria-label="Critères actifs">${badgesHtml}</div>` : ""}
    ${actions ? `<div class="search-bar-meta__actions search-ctx-actions" role="toolbar">${actions}</div>` : ""}
  </div>`;
}

export function renderSearchBarFieldHtml(inputId: string, opts?: { showSlashHint?: boolean }): string {
  const showSlash = opts?.showSlashHint !== false;
  const showNl =
    isTauriRuntime() && isAiFeatureEnabled(state.appPrefs.ai, "featureSearchNlEnabled");
  return `
    <label class="inbox-search surface-sm">
      ${inboxSearchIconSvg()}
      <input id="${escapeAttr(inputId)}" type="search" value="${escapeAttr(state.searchDraft)}" placeholder="Rechercher… Entrée · @contact · #local:dossier (Tab) · #compte" aria-label="Rechercher : Entrée pour valider · #local:nom ou #local:&quot;Perso/Archives&quot;" autocomplete="off" />
      ${renderDeps().searchDraftDiffersFromCommitted() ? `<span class="inbox-search-pending dim" title="Entrée pour lancer la recherche">↵</span>` : ""}
      ${
        showNl
          ? `<button type="button" class="inbox-search-nl ghost-button" data-action="search-nl-assist" title="Assistant : décrire la recherche en langage naturel (LLM)">NL</button>`
          : ""
      }
      ${showSlash ? `<span class="kbd">/</span>` : ""}
    </label>`;
}

export function renderSearchBarStackHtml(
  inputId: string,
  opts?: { showSlashHint?: boolean; includeSaveButton?: boolean },
): string {
  const badges = renderSearchBadgesHtml();
  const meta = renderSearchBarMetaRow(badges, "", { includeSaveButton: opts?.includeSaveButton });
  return `<div class="inbox-search-stack search-bar-stack">${renderSearchBarFieldHtml(inputId, opts)}${meta}</div>`;
}

export function renderSearchViewActionsHtml(visibleCount: number): string {
  const d = renderDeps();
  if (!isTauriRuntime() || !d.inboxSearchContextActive()) return "";
  const n = Math.min(visibleCount, SAVED_VIEW_BATCH_MAX);
  const saved = d.activeSavedSearchItem();
  const btns: string[] = [];
  if (n > 0) {
    btns.push(
      `<button type="button" class="ghost-button search-ctx-btn" data-action="search-view-mark-read" title="Marquer comme lus (jusqu’à ${SAVED_VIEW_BATCH_MAX})">Lus</button>`,
    );
    btns.push(
      `<button type="button" class="ghost-button search-ctx-btn" data-action="search-view-archive" title="Archiver (jusqu’à ${SAVED_VIEW_BATCH_MAX})">Archiver</button>`,
    );
  }
  if (d.searchViewCanOpenOrganizer()) {
    btns.push(
      `<button type="button" class="ghost-button search-ctx-btn" data-action="search-view-open-organizer" title="Ouvrir Organiser V2 (structure boîte, sans rescan global)">Organiser</button>`,
    );
  }
  if (d.searchViewCanAffinerFlux()) {
    btns.push(
      `<button type="button" class="ghost-button search-ctx-btn search-ctx-btn--affiner" data-action="search-view-affiner" title="LLM : proposer un dossier IMAP pour ce flux (Propositions Organiser activées)">Affiner</button>`,
    );
  }
  if (state.activeSavedSearchId && saved && (saved.newCount ?? 0) > 0) {
    const marking = state.savedSearchMarkingSeenId === state.activeSavedSearchId;
    btns.push(
      marking
        ? `<button type="button" class="ghost-button search-ctx-btn search-ctx-btn--watch" disabled aria-busy="true">Marquage…</button>`
        : `<button type="button" class="ghost-button search-ctx-btn search-ctx-btn--watch" data-action="saved-search-mark-seen" title="Marquer la vue comme à jour (badge nouveaux)">+${saved.newCount} · vu</button>`,
    );
  }
  return btns.join("");
}

export function renderInboxSearchContextBlock(visibleCount: number): string {
  const badges = renderSearchBadgesHtml();
  const actionBtns = renderSearchViewActionsHtml(visibleCount);
  const meta = renderSearchBarMetaRow(badges, actionBtns);
  return `<div class="search-ctx-stack search-bar-stack search-bar-stack--context" data-search-bar-root>
    ${renderSearchBarFieldHtml("search-input", { showSlashHint: true })}
    ${meta}
  </div>`;
}

export function renderSearchModal(): string {
  if (!state.searchModalOpen) return "";
  const d = renderDeps();
  return `
    <div class="modal-backdrop search-modal-backdrop" data-action="close-search-modal">
      <div class="modal surface-elevated search-modal modal-shell-stop-prop" role="dialog" aria-modal="true" aria-labelledby="search-modal-title">
        <div class="modal-header">
          <strong id="search-modal-title">Recherche</strong>
          <button type="button" class="icon-pill" data-action="close-search-modal" aria-label="Fermer">${iconSvg("close")}</button>
        </div>
        <div class="modal-body search-modal-body">
          <p class="dim search-modal-hint">Vous pouvez taper librement (« mails de Jean avec factures en 2024 »), ou utiliser la syntaxe avancée : <code>@contact</code>, <code>#local:dossier</code>, <code>#compte</code>, tags. <kbd class="kbd">Entrée</kbd> pour lancer.</p>
          ${renderSearchBarStackHtml("search-modal-input", { showSlashHint: false, includeSaveButton: false })}
        </div>
        <div class="modal-footer">
          ${d.canSaveSearchViewInModal() ? `<button type="button" class="search-save-view-btn" data-action="save-saved-search" title="Enregistrer la recherche comme vue">Enregistrer la vue</button>` : ""}
          <button type="button" class="ghost-button" data-action="close-search-modal">Fermer</button>
          <button type="button" class="primary-button" data-action="search-modal-commit" style="padding:9px 14px">Rechercher</button>
        </div>
      </div>
    </div>
  `;
}
