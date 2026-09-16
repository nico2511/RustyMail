import { isAiFeatureEnabled } from "../../../aiFeatures";
import { escapeAttr, escapeHtml } from "../../../ui/sanitize";
import { toneLabelsFr, tones } from "../../core/composeTone";
import { iconSvg } from "../../lib/iconSvg";
import { isTauriRuntime } from "../../lib/tauriRuntime";
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
        .map(
          (rev) => `<li class="composer-history-pane__rev">
              <button type="button" class="composer-history-pane__icon-action" data-action="compare-draft-revision" data-revision-id="${escapeAttr(rev.id)}" title="Comparer avec le brouillon actuel">
                ⇄
              </button>
              <button type="button" class="composer-history-pane__icon-action" data-action="restore-draft-revision" data-revision-id="${escapeAttr(rev.id)}" title="Restaurer cette version">
                ↩
              </button>
              <span class="composer-history-pane__stamp dim">${escapeHtml(renderDeps().formatDraftRevisionStamp(rev.createdAt))}</span>
            </li>`
        )
        .join("")
    : "";

  const listBlock =
    expanded || n === 0
      ? `<ul class="composer-history-pane__list" role="list">${
          n ? rows : `<li class="composer-history-pane__empty dim">Pas encore de snapshot (éditez quelques secondes puis revenez).</li>`
        }</ul>`
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
                        return `<span class="${cls}">${escapeHtml(prefix)} ${escapeHtml(l.text)}</span>`;
                      })
                      .join("\n")}</pre>`
                  : `<p class="composer-history-pane__microhint dim">Aucune différence.</p>`
          }
        </div>`
      : !state.draftDiffRevisionId && n > 0 && !expanded
        ? `<p class="composer-history-pane__microhint dim">Liste repliée — ouvrir pour choisir une version (⇄ comparer).</p>`
        : n > 0 && !state.draftDiffRevisionId && expanded
          ? `<p class="composer-history-pane__microhint dim">⇄ comparer · ↩ restaurer</p>`
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

  const correctionPanelHtml =
    state.composeGrammarSuggestions?.length ?
      `<aside class="compose-correction-panel surface-sm" role="complementary" aria-label="Correction de texte">
        <div class="compose-correction-panel__head">
          <strong>Correction de texte</strong>
          <button type="button" class="ghost-button compose-correction-dismiss" data-action="compose-grammar-dismiss">Fermer</button>
        </div>
        <ul class="compose-correction-list" role="list">
          ${state.composeGrammarSuggestions
            .map(
              (g, i) => `
            <li class="compose-correction-item" role="listitem">
              <div class="compose-correction-item__main">
                <p class="compose-correction-reason dim">${escapeHtml(g.reason)}</p>
                <p class="compose-correction-diff"><span class="compose-correction-del">${escapeHtml(g.original)}</span> → <strong>${escapeHtml(g.replacement)}</strong></p>
              </div>
              <button type="button" class="ghost-button compose-correction-apply" data-action="compose-grammar-apply" data-grammar-i="${i}">Appliquer</button>
            </li>`
            )
            .join("")}
        </ul>
      </aside>`
    : "";

  return `
    <section class="compose-view composer-mail-shell composer-fullscreen-shell" aria-label="Composer">
      <header class="compose-fs-header">
        <div class="compose-fs-hintbar">
          <p class="compose-fs-layout-hint dim" aria-hidden="true">
            Markdown · <span class="kbd">M</span> basculer la vue du compositeur
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
          <div class="composer-advanced composer-advanced--footnote">
            <button
              type="button"
              class="composer-advanced-micro"
              data-action="toggle-compose-advanced"
              aria-expanded="${state.composeAdvancedOpen}"
            >
              <span class="composer-advanced-chevron" aria-hidden="true">${state.composeAdvancedOpen ? "▾" : "▸"}</span>
              <span>${state.composeAdvancedOpen ? "Masquer les options techniques" : "Options techniques"}</span>
              <span class="composer-advanced-micro-hint dim">multipart HTML</span>
            </button>
            ${
              state.composeAdvancedOpen
                ? `<div class="composer-advanced-body composer-advanced-body--footnote">
                    <div class="field-row field-row--tight-top field-row--advanced">
                      <label for="compose-send-html" class="dim">HTML</label>
                      <label class="composer-checkbox-inline">
                        <input id="compose-send-html" type="checkbox" ${draft?.sendHtml ? "checked" : ""} />
                        <span class="dim composer-checkbox-help">Envoyer en multipart (texte brut + HTML)</span>
                      </label>
                    </div>
                  </div>`
                : ""
            }
          </div>
        </div>
      <div class="compose-editor-sheet">
        <div class="compose-secondary-toolbar">
          <div
            class="compose-toolbar-voice"
            title="Dictée : Whisper transcrit l’audio. Les boutons Style déterminent le ton si « Réécrire avec le style » est activé dans IA → Dictée (réécriture LLM après dictée)."
          >
            <span class="composer-toolbar-caption dim">Dictée</span>
            <div class="tone-inline tone-inline--voice">
              <span class="composer-toolbar-caption dim composer-toolbar-caption--sub">Style</span>
              ${tones
                .map(
                  (tone) =>
                    `<button type="button" class="tone-button ${tone === state.tone ? "active" : ""}" data-tone="${tone}" title="Style par défaut pour Réécriture IA (${toneLabelsFr[tone]})">${escapeHtml(toneLabelsFr[tone])}</button>`
                )
                .join("")}
            </div>
            <div class="compose-mic-cluster">
              <button
                class="mic-button ${state.micState}"
                type="button"
                data-action="mic"
                title="${escapeAttr(renderDeps().composeMicButtonTitle())}"
                aria-label="${escapeAttr(renderDeps().micAriaLabel("compose"))}"
                aria-pressed="${state.micState === "recording"}"
              >
                <span class="mic-button__ico" aria-hidden="true">${iconSvg("mic")}</span>
              </button>
            </div>
          </div>
          <div class="md-toolbar md-toolbar-rich" role="toolbar" aria-label="Mise en forme Markdown">
            <button type="button" class="ghost-button md-button" data-md="bold" title="Gras (Ctrl+B)">Gras</button>
            <button type="button" class="ghost-button md-button" data-md="italic" title="Italique (Ctrl+I)">Italique</button>
            <button type="button" class="ghost-button md-button md-button-underline" data-md="underline" title="Souligné (Ctrl+U)">Soul.</button>
            <span class="md-toolbar-sep" aria-hidden="true"></span>
            <button type="button" class="ghost-button md-button" data-md="h1" title="Titre 1 (#)">Titre 1</button>
            <button type="button" class="ghost-button md-button" data-md="h2" title="Titre 2 (##)">Titre 2</button>
            <button type="button" class="ghost-button md-button" data-md="h3" title="Titre 3 (###)">Titre 3</button>
            <span class="md-toolbar-sep" aria-hidden="true"></span>
            <button type="button" class="ghost-button md-button" data-md="ul" title="Liste à puces">Puces</button>
            <button type="button" class="ghost-button md-button" data-md="ol" title="Liste numérotée">Num.</button>
            <button type="button" class="ghost-button md-button" data-md="link" title="Lien (Ctrl+K)">Lien</button>
            <button type="button" class="ghost-button md-button" data-md="image" title="Image (URL Markdown)">Image</button>
            <button type="button" class="ghost-button md-button" data-md="table" title="Tableau Markdown">Tableau</button>
            <span class="md-toolbar-sep" aria-hidden="true"></span>
            <button type="button" class="ghost-button md-button" data-md="code" title="Code">&lt;&gt;</button>
            <button type="button" class="ghost-button md-button" data-md="quote" title="Citation">Citation</button>
            <span class="md-toolbar-sep" aria-hidden="true"></span>
            <button type="button" class="ghost-button md-button" data-md="undo" title="Annuler">Annuler</button>
            <button type="button" class="ghost-button md-button" data-md="redo" title="Refaire">Refaire</button>
          </div>
          <div class="compose-llm-strip dim" role="group" aria-label="Brouillon · réécriture IA" style="display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin-top:8px;font-size:11px">
            <span>Réécriture ·</span>
            <button
              type="button"
              class="ghost-button md-button"
              data-action="compose-ai-rewrite-selected-tone"
              title="Réécrire tout le texte avec le style choisi à gauche (Dictée · Réécriture)"
            >
              Style sélectionné
            </button>
            <button type="button" class="ghost-button md-button" data-action="compose-ai-rewrite" data-rewrite-style="Formal" title="Ton formel (LLM)">Formel</button>
            <button type="button" class="ghost-button md-button" data-action="compose-ai-rewrite" data-rewrite-style="Casual" title="Ton décontracté">Décontracté</button>
            <button type="button" class="ghost-button md-button" data-action="compose-ai-rewrite" data-rewrite-style="Concise" title="Concis">Concis</button>
            <span class="md-toolbar-sep" aria-hidden="true"></span>
            <button type="button" class="ghost-button md-button" data-action="compose-ai-grammar" title="Orthographe & formulation (LLM)">Correction</button>
            ${
              isAiFeatureEnabled(state.appPrefs.ai, "featureQuickReplyComposeEnabled")
                ? `<span class="md-toolbar-sep" aria-hidden="true"></span>
            <button type="button" class="ghost-button md-button" data-action="llm-quick-replies-compose" title="Suggestions de réponses (sans fil ouvert)">Réponses rapides</button>`
                : ""
            }
          </div>
        </div>
        ${correctionPanelHtml}
        <div class="composer-body composer-body--${isHistorique ? "historique" : layout}">
          <textarea
            id="compose-body"
            class="${textareaOffscreen ? "composer-source-offscreen" : ""}"
            placeholder="Rédiger en Markdown…"
            ${textareaOffscreen ? 'tabindex="-1" aria-hidden="true"' : ""}
          >${escapeHtml(state.composeBody)}</textarea>
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