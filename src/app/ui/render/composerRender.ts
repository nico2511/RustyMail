import { isAiFeatureEnabled } from "../../../aiFeatures";
import { escapeAttr, escapeHtml } from "../../../ui/sanitize";
import { iconSvg } from "../../lib/iconSvg";
import { renderComposeToolbar } from "./composeToolbarRender";
import { isTauriRuntime } from "../../lib/tauriRuntime";
import { composeSourcePlainText } from "../../mail/composeHtmlBody";
import { summarizeDraftDiffLines } from "../../mail/composeDraftRevisionDiffAlgoRun";
import {
  draftRevisionEventKindLabelFr,
  formatCharsDelta,
} from "../../mail/composeDraftRevisionEventKind";
import { grammarOccurrenceCount, retainGrammarSuggestionsInText } from "../../mail/composeGrammarReplace";
import { state } from "../../state";
import type { Draft, MicDictationTarget } from "../../types";
import { renderDeps } from "./renderDeps";

function fileBaseName(path: string): string {
  const normalized = String(path).replace(/\\/g, "/");
  const last = normalized.split("/").pop() ?? normalized;
  return last || normalized;
}

function renderComposerHistoriquePane(): string {
  if (!isTauriRuntime()) {
    return `<aside class="composer-history-pane composer-history-pane--disabled" aria-label="Historique du brouillon">
      <p class="composer-history-pane__hint dim">L’historique local des versions est disponible dans l’app bureau (Tauri).</p>
    </aside>`;
  }
  const revs = state.draftRevisions;
  const expanded = state.draftVersionsListExpanded;
  const n = revs.length;
  const summaryLabel =
    n === 0 ? "Aucune version" : n === 1 ? "1 version" : `${n} versions`;

  const rows =
    revs.length ?
      revs
        .map((rev, i) => {
          const eventLabel = draftRevisionEventKindLabelFr(rev.eventKind);
          const kind = i === 0 ? `${eventLabel} · dernier` : eventLabel;
          const delta = formatCharsDelta(rev.charsDelta);
          const heavy =
            Math.abs(Number(rev.charsDelta ?? 0)) >= 80
              ? " composer-history-pane__delta--heavy"
              : "";
          const active = state.draftDiffRevisionId === rev.id;
          return `<li class="composer-history-pane__rev${active ? " is-active" : ""}">
              <button type="button" class="composer-history-pane__icon-action" data-action="compare-draft-revision" data-revision-id="${escapeAttr(rev.id)}" title="Comparer avec le brouillon actuel">
                ⇄
              </button>
              <button type="button" class="composer-history-pane__icon-action" data-action="restore-draft-revision" data-revision-id="${escapeAttr(rev.id)}" title="Restaurer cette version">
                ↩
              </button>
              <span class="composer-history-pane__meta">
                <span class="composer-history-pane__kind">${escapeHtml(kind)}</span>
                <span class="composer-history-pane__delta${heavy}" title="Variation de longueur">${escapeHtml(delta)} car.</span>
                <span class="composer-history-pane__stamp dim">${escapeHtml(renderDeps().formatDraftRevisionStamp(rev.createdAt))}</span>
              </span>
            </li>`;
        })
        .join("")
    : "";

  const listBlock =
    expanded || n === 0
      ? `<ul class="composer-history-pane__list" role="list">${
          n ? rows : `<li class="composer-history-pane__empty dim">Pas encore de snapshot (éditez quelques secondes puis revenez).</li>`
        }</ul>`
      : "";

  const diffStats =
    !state.draftDiffLoading && state.draftDiffRevisionId && state.draftDiffLines.length
      ? summarizeDraftDiffLines(state.draftDiffLines)
      : null;
  const diffStatsHtml = diffStats
    ? `<p class="composer-history-pane__diff-stats">
        <strong>${escapeHtml(diffStats.label)}</strong>
        <span class="dim"> · </span>
        <span class="composer-history-pane__diff-add">+${diffStats.addedChars}</span>
        <span class="dim"> / </span>
        <span class="composer-history-pane__diff-del">−${diffStats.removedChars}</span>
        <span class="dim"> car. · +${diffStats.addedLines}/−${diffStats.removedLines} lignes</span>
      </p>`
    : "";

  const comparisonBlock =
    state.draftDiffRevisionId
      ? `
        <div class="composer-history-pane__detail" role="region" aria-label="Comparaison">
          <div class="composer-history-pane__detail-head">
            <span class="composer-history-pane__detail-label dim">Comparaison</span>
            <button type="button" class="ghost-button composer-history-pane__mode-toggle" data-action="toggle-draft-compare-view" ${
              state.draftDiffLoading ? "disabled" : ""
            } title="Basculer aperçu HTML / diff +/−">
              ${state.draftDiffView === "preview" ? "Diff" : "Aperçu"}
            </button>
          </div>
          ${diffStatsHtml}
          ${
            state.draftDiffLoading
              ? `<p class="composer-history-pane__microhint dim">Chargement…</p>`
              : state.draftDiffView === "preview"
                ? `<div class="preview preview--revision">${renderDeps().sanitizeEmailHtml(state.draftRevisionPreview?.html ?? "").html}</div>`
                : state.draftDiffLines.length
                  ? `<pre class="draft-diff__pre draft-diff__pre--composer">${state.draftDiffLines
                      .map((l) => {
                        const cls =
                          l.kind === "add"
                            ? "draft-diff__line draft-diff__line--add"
                            : l.kind === "del"
                              ? "draft-diff__line draft-diff__line--del"
                              : "draft-diff__line";
                        const prefix = l.kind === "add" ? "+" : l.kind === "del" ? "-" : " ";
                        const heavy =
                          (l.kind === "add" || l.kind === "del") && l.text.length >= 80
                            ? " draft-diff__line--heavy"
                            : "";
                        return `<span class="${cls}${heavy}">${escapeHtml(prefix)} ${escapeHtml(l.text)}</span>`;
                      })
                      .join("\n")}</pre>`
                  : `<p class="composer-history-pane__microhint dim">Aucune différence.</p>`
          }
        </div>`
      : !state.draftDiffRevisionId && n > 0 && !expanded
        ? `<p class="composer-history-pane__microhint dim">Liste repliée — ouvrir pour choisir une version (⇄ comparer).</p>`
        : n > 0 && !state.draftDiffRevisionId && expanded
          ? `<p class="composer-history-pane__microhint dim">⇄ comparer · ↩ restaurer · type d’événement · ± caractères</p>`
          : "";

  return `<aside class="composer-history-pane" aria-label="Historique du brouillon">
      <div class="composer-history-pane__bar">
        <button
          type="button"
          class="composer-history-pane__summary"
          data-action="toggle-draft-versions-expanded"
          aria-expanded="${expanded}"
          title="Afficher ou masquer la liste des versions"
          ${state.draftRevisionsLoading ? "disabled" : ""}
        >
          <span class="composer-history-pane__chev" aria-hidden="true">${expanded ? "▾" : "▸"}</span>
          <span class="composer-history-pane__summary-text">${escapeHtml(summaryLabel)}</span>
          ${state.draftRevisionsLoading ? `<span class="composer-history-pane__spinner dim" aria-hidden="true"> …</span>` : ""}
        </button>
        <button type="button" class="composer-history-pane__mini-refresh" data-action="refresh-draft-history" title="Rafraîchir la liste" aria-label="Rafraîchir la liste" ${
          state.draftRevisionsLoading ? "disabled" : ""
        }>↻</button>
      </div>
      ${listBlock}
      ${comparisonBlock}
    </aside>`;
}

export function renderComposer() {
  const draft = state.draft;
  const attachments = draft?.attachmentPaths ?? [];
  const layout = state.composeLayout;
  const isHistorique = layout === "historique";
  const showPreviewPane = layout !== "write" && !isHistorique;
  const textareaOffscreen = layout === "preview";
  const forcedCcBcc = renderDeps().draftHasRecipientsExtra(draft);
  const showCcBccRows = Boolean(state.composeCcBccOpen || forcedCcBcc);
  const ccBccToggle =
    forcedCcBcc ?
      ""
    : `<button type="button" class="compose-link" data-action="toggle-compose-cc-bcc">${
        state.composeCcBccOpen ? "Réduire" : "Cc · Cci"
      }</button>`;

  const ccRows = showCcBccRows ?
    `<div class="field-row"><label class="compose-field-label">Cc</label><div id="compose-cc-host" class="compose-recipients-host compose-to-cell"></div></div>
     <div class="field-row"><label class="compose-field-label">Cci</label><div id="compose-bcc-host" class="compose-recipients-host compose-to-cell"></div></div>`
    : "";

  const correctionPlain = composeSourcePlainText(state.composeCanonicalBody || state.composeBody || "");
  const correctionSuggestions = retainGrammarSuggestionsInText(state.composeGrammarSuggestions, correctionPlain);
  if ((state.composeGrammarSuggestions?.length ?? 0) !== correctionSuggestions.length) {
    state.composeGrammarSuggestions = correctionSuggestions.length ? correctionSuggestions : null;
  }
  const correctionPanelHtml =
    correctionSuggestions.length ?
      `<aside class="compose-correction-panel surface-sm" role="complementary" aria-label="Correction de texte">
        <div class="compose-correction-panel__head">
          <strong>Correction de texte</strong>
          <button type="button" class="ghost-button compose-correction-dismiss" data-action="compose-grammar-dismiss">Fermer</button>
        </div>
        <ul class="compose-correction-list" role="list">
          ${correctionSuggestions
            .map((g, i) => {
              const occurrences = grammarOccurrenceCount(state.composeBody, state.composeCanonicalBody, g);
              const applyTitle =
                occurrences > 1
                  ? `Remplacer la première des ${occurrences} occurrences`
                  : "Remplacer cette occurrence dans le texte";
              const countBtn =
                occurrences > 1
                  ? `<button type="button" class="ghost-button compose-correction-count" data-action="compose-grammar-apply-all" data-grammar-i="${i}" title="Remplacer les ${occurrences} occurrences">${occurrences}×</button>`
                  : "";
              return `
            <li class="compose-correction-item" role="listitem">
              <div class="compose-correction-item__main">
                <p class="compose-correction-reason dim">${escapeHtml(g.reason)}</p>
                <p class="compose-correction-diff"><span class="compose-correction-del">${escapeHtml(g.original)}</span> → <strong>${escapeHtml(g.replacement)}</strong>${countBtn}</p>
              </div>
              <button type="button" class="ghost-button compose-correction-apply" data-action="compose-grammar-apply" data-grammar-i="${i}" title="${escapeAttr(applyTitle)}">Appliquer</button>
            </li>`;
            })
            .join("")}
        </ul>
      </aside>`
    : "";

  return `
    <section class="compose-view composer-mail-shell composer-fullscreen-shell" aria-label="Composer">
      <header class="compose-fs-header">
        <div class="compose-fs-hintbar">
          <p class="compose-fs-layout-hint dim" aria-hidden="true">
            Éditeur · <span class="kbd">M</span> basculer la vue du compositeur
          </p>
        </div>
        <div class="compose-fs-header-row">
          <button type="button" class="icon-button compose-fs-close" data-action="close-compose" aria-label="Fermer le composer">×</button>
          <div class="compose-fs-title-block">
            <span class="compose-fs-kicker">Composer</span>
            <span class="compose-fs-subtitle dim">${escapeHtml(renderDeps().composeKindTitle(draft?.kind))}</span>
          </div>
          <div class="compose-fs-tabs-stack">
            <nav class="compose-fs-tabs" role="tablist" aria-label="Mode d’affichage du composer">
              <button type="button" role="tab" aria-selected="${layout === "split"}" class="compose-fs-tab ${layout === "split" ? "is-active" : ""}" data-action="set-compose-layout" data-compose-layout="split">Split</button>
              <button type="button" role="tab" aria-selected="${layout === "write"}" class="compose-fs-tab ${layout === "write" ? "is-active" : ""}" data-action="set-compose-layout" data-compose-layout="write">Écrire</button>
              <button type="button" role="tab" aria-selected="${layout === "preview"}" class="compose-fs-tab ${layout === "preview" ? "is-active" : ""}" data-action="set-compose-layout" data-compose-layout="preview">Aperçu</button>
              <button type="button" role="tab" aria-selected="${layout === "historique"}" class="compose-fs-tab ${layout === "historique" ? "is-active" : ""}" data-action="set-compose-layout" data-compose-layout="historique"${
                isTauriRuntime() ? "" : " disabled"
              } title="Comparer les versions locales du brouillon (app bureau)">Historique</button>
            </nav>
          </div>
          ${
            isTauriRuntime()
              ? `<button type="button" class="ghost-button compose-fs-save-saved-draft" data-action="save-saved-draft" title="Enregistrer dans la liste Brouillons sauvegardés (barre latérale)">Enregistrer</button>`
              : ""
          }
          <button type="button" class="primary-button compose-fs-send compose-send" data-action="send">Envoyer</button>
        </div>
      </header>
      <div class="compose-workspace">
        <div class="compose-meta-card surface-sm">
          <div class="field-row compose-to-row">
            <label for="compose-to" class="compose-field-label">À</label>
            <div class="compose-to-cell">
              <div id="compose-to-host" class="compose-recipients-host"></div>
              ${ccBccToggle ? `<span class="compose-recipient-extra">${ccBccToggle}</span>` : ""}
            </div>
          </div>
          ${ccRows}
          <div class="field-row compose-subject-row"><label for="compose-subject" class="compose-field-label">Objet</label><input id="compose-subject" class="compose-subject-input" placeholder="Objet du message" value="${escapeAttr(draft?.subject ?? "")}" /></div>
          <div class="field-row compose-files-row">
            <label class="compose-field-label">Fichiers</label>
            <div class="attachments-row attachments-row--unified">
              <div class="compose-attachments-chips-scroll" aria-label="Liste des pièces jointes">
                <div class="attachments-chips compose-attachments-chips" aria-label="Pièces jointes">
                ${
                  attachments.length ?
                    attachments
                      .map((p) => {
                        const base = fileBaseName(p);
                        return `<span class="attachment-chip surface-sm" title="${escapeAttr(p)}">
              <span class="chip-icon" aria-hidden="true">${iconSvg("attachment")}</span>
              <span class="chip-name">${escapeHtml(base)}</span>
              <button class="chip-remove" data-action="remove-attachment" data-path="${escapeAttr(p)}" aria-label="Retirer ${escapeAttr(base)}" title="Retirer">×</button>
            </span>`;
                      })
                      .join("")
                  : `<span class="dim compose-attachments-empty">Aucune pièce jointe</span>`
                }
                </div>
              </div>
              <div class="attachments-actions">
                <button class="ghost-button composer-accent-outline" type="button" data-action="pick-attachments" title="Ajouter des pièces jointes">Ajouter…</button>
                <button class="ghost-button" type="button" data-action="clear-attachments" title="Vider la liste" ${attachments.length ? "" : "disabled"}>Effacer</button>
              </div>
            </div>
            <input id="compose-attachments" value="${escapeAttr(renderDeps().attachmentPathsJoinedForHiddenField(attachments))}" style="display:none" />
          </div>
        </div>
      <div class="compose-editor-sheet">
        ${renderComposeToolbar({
          tone: state.tone,
          llmJobLabel: state.llmJobLabel,
          micState: state.micState,
          micTitle: renderDeps().composeMicButtonTitle(),
          micAria: renderDeps().micAriaLabel("compose"),
          rewriteEnabled: isAiFeatureEnabled(state.appPrefs.ai, "featureComposeRewriteEnabled"),
          grammarEnabled: isAiFeatureEnabled(state.appPrefs.ai, "featureComposeGrammarEnabled"),
          quickRepliesEnabled: isAiFeatureEnabled(state.appPrefs.ai, "featureQuickReplyComposeEnabled"),
        })}
        ${correctionPanelHtml}
        <div class="composer-body composer-body--${isHistorique ? "historique" : layout}">
          <div
            id="compose-body"
            class="compose-tiptap${textareaOffscreen ? " composer-source-offscreen" : ""}"
            data-compose-editor="tiptap"
          ></div>
          ${isHistorique ? renderComposerHistoriquePane() : showPreviewPane ? `<div class="preview">${state.preview?.html ?? ""}</div>` : ""}
          <div class="drop-hint" aria-hidden="true">
            <strong>Déposez des fichiers dans cette fenêtre</strong>
            <span>Pièces jointes : glisser-déposer depuis l’explorateur (chemins locaux, app bureau).</span>
          </div>
        </div>
      </div>
      </div>
    </section>
  `;
}