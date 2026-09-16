import { isAiFeatureEnabled } from "../../../aiFeatures";
import {
  assistModeLabel,
  assistSafetyFlagLabel,
  assistSkillLabel,
  getAssistSkillUi,
} from "../../../assistAgent";
import type { AssistSkillId } from "../../../assistAgent";
import { escapeAttr, escapeHtml } from "../../../ui/sanitize";
import { renderActionBriefHtml } from "./actionBriefHtml";
import { formatPlainTextWithLinks } from "../../lib/textFormat";
import { iconSvg } from "../../lib/iconSvg";
import { threadTagsForModal } from "../../lib/threadTagsModal";
import { isTauriRuntime } from "../../lib/tauriRuntime";
import { mailboxDigestSlotInList } from "../../mail/mailboxDigest";
import { renderBriefMailViewShell } from "../briefMailShell";
import { state } from "../../state";
import { renderDeps } from "./renderDeps";
import { renderThreadParticipantLink } from "./threadViewRender";

const ENABLE_CLEAN_MESSAGE_VIEW = true;

function renderThreadQaBlockHtml(): string {
  if (!isAiFeatureEnabled(state.appPrefs.ai, "featureThreadQaEnabled")) return "";
  const dictationMic =
    isTauriRuntime() && state.appPrefs.ai.dictationEnabled
      ? `<div class="ai-qa-mic-cluster compose-mic-cluster" title="${escapeAttr(renderDeps().threadQaMicButtonTitle())}">
          <button
            class="mic-button ${state.micState}"
            type="button"
            data-action="mic-thread-qa"
            aria-label="${escapeAttr(renderDeps().micAriaLabel("thread-qa"))}"
            aria-pressed="${state.micState === "recording"}"
          >
            <span class="mic-button__ico" aria-hidden="true">${iconSvg("mic")}</span>
          </button>
        </div>`
      : "";
  return `<div class="ai-qa-block surface-sm">
        <p class="dim ai-qa-block__title">Questions sur le fil</p>
        <label class="dim ai-qa-block__label" for="thread-qa-input">Votre question</label>
        <div class="ai-qa-input-row">
          <textarea id="thread-qa-input" class="settings-ctl ai-qa-input" rows="2" placeholder="Ex. Quelles dates ont été proposées ? (dictée possible)">${escapeHtml(state.threadQaDraft)}</textarea>
          ${dictationMic}
        </div>
        <div class="ai-qa-block__actions">
          <button type="button" class="ghost-button ghost-button-sm" data-action="llm-qa-thread">Poser la question</button>
          ${
            state.threadQaAnswer || state.threadQaStreamText
              ? `<button type="button" class="ghost-button ghost-button-sm" data-action="llm-qa-clear">Effacer</button>`
              : ""
          }
        </div>
        ${
          state.threadQaStreamText.trim()
            ? `<div class="ai-qa-answer ai-qa-answer--stream"><p class="ai-qa-answer__text">${formatPlainTextWithLinks(state.threadQaStreamText)}</p></div>`
            : ""
        }
        ${
          state.threadQaAnswer
            ? `<div class="ai-qa-answer">
          <p class="ai-qa-answer__text">${formatPlainTextWithLinks(state.threadQaAnswer.answer)}</p>
          ${
            state.threadQaAnswer.evidenceMessageIds.length
              ? `<p class="dim ai-qa-block__evidence-label">Messages sources</p>
          <div class="ai-qa-evidence">${state.threadQaAnswer.evidenceMessageIds
            .map(
              (mid) =>
                `<button type="button" class="ghost-button ghost-button-sm ai-qa-evidence__btn" data-action="qa-open-message" data-msg-id="${escapeAttr(mid)}">${escapeHtml(mid.slice(0, 24))}${mid.length > 24 ? "…" : ""}</button>`
            )
            .join("")}</div>`
              : ""
          }
        </div>`
            : ""
        }
      </div>`;
}

function renderThreadSummaryPanelHtml(): string {
  /** Même contenu que `thread-zen` dans la colonne fil — ne pas dupliquer dans Détails. */
  if (renderDeps().threadAiSummaryShownInZen()) return "";
  if (!renderDeps().threadAiSummaryForCurrentThread()) return "";
  const tid = String(state.aiThreadScope);
  const row = state.threads.find((t) => String(t.id) === tid);
  const subject = state.selectedThread?.subject || row?.subject || "Fil";
  return `
    <div class="ai-thread-summary surface-sm" aria-label="Synthèse du fil">
      <div class="ai-thread-summary__head">
        <span class="thread-kicker thread-kicker-strong">Résumé</span>
      </div>
      <p class="dim ai-thread-summary__subject">${escapeHtml(subject)}</p>
      <div class="thread-zen-body ai-thread-summary__body">${renderDeps().zenSummaryHtmlFragments(state.aiOutput!.trim())}</div>
    </div>`;
}

function renderAgentTelemetryHtml(session: NonNullable<typeof state.agentSession>): string {
  if (!session.telemetry.length) return "";
  const rows = session.telemetry
    .map((t) => {
      const label = assistSkillLabel(t.skill);
      const lat = t.latencyMs > 0 ? `${t.latencyMs} ms` : "—";
      const status =
        t.status === "ok"
          ? "OK"
          : t.status === "skipped"
            ? "Ignoré"
            : t.status === "blocked"
              ? "Bloqué"
              : t.status === "error"
              ? "Erreur"
              : t.status;
      const detail = t.message ? `<span class="dim"> · ${escapeHtml(t.message)}</span>` : "";
      return `<li><span>${escapeHtml(label)}</span><span class="dim">${escapeHtml(status)} · ${lat}</span>${detail}</li>`;
    })
    .join("");
  return `<details class="agent-panel__telemetry" open><summary>Exécution</summary><ul>${rows}</ul></details>`;
}

function renderAgentPrepareReplyPanelHtml(): string {
  const s = state.agentSession;
  if (!s || !renderDeps().threadIdsMatch(s.threadId, state.selectedThreadId)) return "";
  const stepLabel = renderDeps().agentStepProgressLabel(s);
  const modeSelect = `
    <label class="agent-panel__mode dim">
      Mode
      <select class="settings-ctl" data-action="agent-set-mode" ${s.busy ? "disabled" : ""}>
        <option value="quick" ${s.assistMode === "quick" ? "selected" : ""}>${escapeHtml(assistModeLabel("quick"))}</option>
        <option value="deep" ${s.assistMode === "deep" ? "selected" : ""}>${escapeHtml(assistModeLabel("deep"))}</option>
        <option value="strictSafe" ${s.assistMode === "strictSafe" ? "selected" : ""}>${escapeHtml(assistModeLabel("strictSafe"))}</option>
      </select>
    </label>`;
  const intentBlock = s.intent
    ? `<p class="agent-panel__intent">${escapeHtml(s.intent.intent)}</p><p class="dim">Ton : ${escapeHtml(s.intent.toneHint)}</p>`
    : "";
  const factsBlock =
    s.facts?.facts?.length ?
      `<ul class="agent-panel__facts">${s.facts.facts
        .slice(0, 8)
        .map((f) => `<li><span class="dim">${escapeHtml(f.kind)}</span> ${escapeHtml(f.text)}</li>`)
        .join("")}</ul>`
    : "";
  const clarificationBlock =
    s.step === "clarification" && s.clarificationQuestions.length ?
      `<div class="agent-panel__clarification"><p><strong>Précisions utiles</strong></p><ul>${s.clarificationQuestions
        .map((q) => `<li>${escapeHtml(q)}</li>`)
        .join("")}</ul></div>`
    : "";
  const safetyBlock =
    s.safetyFlags.length || s.consistencyIssues.length ?
      `<div class="agent-panel__warnings">${[
        ...s.consistencyIssues.map((i) => `<p class="agent-warn">⚠ ${escapeHtml(i)}</p>`),
        ...s.safetyFlags.map((f) => `<p class="agent-warn dim">${escapeHtml(assistSafetyFlagLabel(f))}</p>`),
      ].join("")}</div>`
    : "";
  const draftBlock =
    (s.step === "draftReply" || s.draft.trim()) && (s.draft.trim() || s.busy) ?
      `<textarea class="settings-ctl agent-panel__draft" id="agent-draft-text" rows="6" ${s.busy ? 'aria-busy="true"' : ""}>${escapeHtml(s.draft)}</textarea>`
    : "";
  const actionsBlock =
    s.recommendations.filter((r) => r.kind === "action").length ?
      `<div class="agent-panel__actions-list"><p class="dim"><strong>Actions</strong></p><ul>${s.recommendations
        .filter((r) => r.kind === "action")
        .map(
          (r) =>
            `<li>${escapeHtml(r.label)}${r.detail ? `<span class="dim"> · ${escapeHtml(r.detail)}</span>` : ""}</li>`,
        )
        .join("")}</ul></div>`
    : "";
  const slotsBlock =
    s.slots.length ?
      `<ul class="agent-panel__slots">${s.slots.map((sl) => `<li><button type="button" class="ghost-button" data-action="agent-append-slot" data-slot="${escapeAttr(sl)}">${escapeHtml(sl)}</button></li>`).join("")}</ul>`
    : "";
  const skillToggles = getAssistSkillUi().map((sk: { id: AssistSkillId; label: string }) => {
    const on = renderDeps().agentSkillEnabled(sk.id);
    const dis = s.busy || sk.id === "analyzeIntent" || sk.id === "draftReply";
    return `<label class="agent-skill-toggle"><input type="checkbox" data-action="agent-toggle-skill" data-skill="${sk.id}" ${on ? "checked" : ""} ${dis ? "disabled" : ""}/> ${escapeHtml(sk.label)}</label>`;
  }).join("");
  const skillsBlock = `<details class="agent-panel__skills"><summary>Skills</summary><div class="agent-skill-toggles">${skillToggles}</div></details>`;
  return `
    <div class="agent-panel surface-sm">
      <div class="agent-panel__head">
        <strong>Assistant réponse</strong>
        <span class="dim">${stepLabel}</span>
        ${modeSelect}
      </div>
      ${s.busy ? `<p class="dim">Génération…</p>` : ""}
      ${s.step === "analyzeIntent" ? intentBlock : ""}
      ${skillsBlock}
      ${factsBlock}
      ${actionsBlock}
      ${clarificationBlock}
      ${safetyBlock}
      ${draftBlock}
      ${s.step === "suggestSlots" ? slotsBlock : ""}
      ${renderAgentTelemetryHtml(s)}
      <div class="agent-panel__actions">
        <button type="button" class="ghost-button" data-action="agent-prepare-cancel">Annuler</button>
        ${
          s.step === "draftReply" && s.draft.trim()
            ? `<button type="button" class="ghost-button" data-action="agent-insert-compose">Insérer dans compose</button>`
            : ""
        }
        ${
          s.step !== "suggestSlots" &&
          !s.busy &&
          (s.step === "clarification" || s.step !== "draftReply" || renderDeps().agentOfferSlotsStep(s))
            ? `<button type="button" class="primary-button" data-action="agent-prepare-continue">${
                s.step === "clarification"
                  ? "Générer le brouillon quand même"
                  : s.step === "draftReply"
                    ? "Créneaux alternatifs"
                    : "Continuer"
              }</button>`
            : ""
        }
        ${
          s.step === "suggestSlots" && s.slots.length
            ? `<button type="button" class="ghost-button" data-action="agent-append-all-slots">Ajouter au message</button>`
            : ""
        }
      </div>
    </div>`;
}

export function renderAiPanel() {
  if (mailboxDigestSlotInList()) {
    const digestMboxTitle = escapeHtml(state.selectedMailbox || "INBOX");
    const accountId = renderDeps().currentAccount()?.id?.trim() ?? "";
    const mailboxKey = state.selectedMailbox || "INBOX";
    const k = `${accountId}|${mailboxKey}`;
    const keyMatches = state.mailboxDigestKey === k;
    const banner = state.mailboxBriefBannerHtml.trim();
    const brief = state.mailboxActionBrief;
    const hasBrief = Boolean(brief && keyMatches);
    const hasBanner = Boolean(banner);
    const hasRenderable = hasBrief || hasBanner;
    let digestBody = "";
    if (state.mailboxDigestRefreshing && !hasRenderable) {
      digestBody = `<div class="inbox-brief-body">${renderBriefMailViewShell(
        `<p class="thread-zen-par dim" role="status">Génération du brief d’action…</p>`,
        { kicker: "Brief d’action" }
      )}</div>`;
    } else if (hasBrief) {
      digestBody = `<div class="inbox-brief-body">${renderActionBriefHtml(brief!)}</div>`;
    } else if (keyMatches && hasBanner) {
      digestBody = `<div class="inbox-brief-body">${banner}</div>`;
    } else if (state.mailboxDigestKey && !keyMatches) {
      digestBody = `<div class="inbox-brief-body">${renderBriefMailViewShell(
        `<p class="thread-zen-par dim" role="status">Changement de dossier — actualisation du brief…</p>`,
        { kicker: "Brief d’action" }
      )}</div>`;
    } else {
      digestBody = `<div class="inbox-brief-body">${renderBriefMailViewShell(
        `<p class="thread-zen-par dim">Le brief se charge automatiquement après chaque synchronisation ou chargement des conversations.</p>`,
        { kicker: "Brief d’action" }
      )}</div>`;
    }
    const busyLine =
      state.mailboxDigestRefreshing && keyMatches && hasRenderable
        ? `<p class="inbox-digest-busy dim" style="margin:0 14px 8px" aria-live="polite">Mise à jour…</p>`
        : "";
    const modeSel = state.mailboxBriefMode;
    const briefModeApplied = state.mailboxActionBrief?.mode?.trim();
    const ctxHint =
      state.llmRuntimeStatus?.llamaServerNCtx ??
      state.appPrefs.ai.localLlmContextSize ??
      null;
    const modeTitle =
      modeSel === "auto"
        ? `Auto : Quick / Decision / Deep selon la fenêtre de contexte${ctxHint ? ` (≈ ${ctxHint} jetons)` : ""}`
        : `Plafond ${modeSel} ; le mode effectif peut être réduit si le contexte est petit`;
    return `
    <aside class="ai-panel ai-panel--digest-slot" aria-label="Brief d'action du dossier">
      <header class="pane-header ai-panel-digest-head" style="display:flex;align-items:flex-start;justify-content:space-between;gap:10px">
        <div>
          <strong>Brief d'action</strong>
          <small class="dim" style="display:block;margin-top:3px">${briefModeApplied ? `${escapeHtml(briefModeApplied)} · ` : ""}${digestMboxTitle}</small>
        </div>
        <div style="display:flex;align-items:center;gap:6px;flex-shrink:0;flex-wrap:wrap;justify-content:flex-end">
          <label class="dim" style="font-size:11px;display:flex;align-items:center;gap:4px">Mode
            <select class="settings-ctl" data-action="mailbox-brief-mode" title="${escapeAttr(modeTitle)}" style="font-size:11px;padding:2px 6px;min-width:0">
              <option value="auto" ${modeSel === "auto" ? "selected" : ""}>Auto</option>
              <option value="quick" ${modeSel === "quick" ? "selected" : ""}>Quick</option>
              <option value="decision" ${modeSel === "decision" ? "selected" : ""}>Decision</option>
              <option value="deep" ${modeSel === "deep" ? "selected" : ""}>Deep</option>
            </select>
          </label>
          <button type="button" class="ghost-button inbox-digest-dismiss" data-action="llm-inbox-digest" title="Relancer le brief du dossier">Rafraîchir</button>
          <button type="button" class="icon-button" data-action="dismiss-mailbox-digest" aria-label="Fermer le brief">×</button>
        </div>
      </header>
      ${busyLine}
      <div class="ai-panel-digest-scroll inbox-brief-scroll">
        ${digestBody}
      </div>
    </aside>`;
  }

  const threadReading = state.view === "thread" && state.selectedThread;
  const thread = threadReading ? state.selectedThread : undefined;
  const participantLinks = thread ? renderDeps().threadParticipantsWithEmails(thread.messages) : [];
  const detailsTagCount = thread ? threadTagsForModal(thread.tags ?? []).length : 0;
  return `
    <aside class="ai-panel" aria-label="Détails">
      <header class="pane-header" style="display:flex;align-items:center;justify-content:space-between;gap:12px">
        <div><strong>Détails</strong><small class="dim" style="display:block;margin-top:3px">${threadReading ? "Conversation" : "Lecture d’un fil requise"}</small></div>
        <button type="button" class="icon-button" data-action="toggle-ai" aria-label="Fermer le panneau Détails">×</button>
      </header>
      <div class="ai-panel-body-scroll">

      ${
        threadReading && thread
          ? `
            <div class="details-block">
              <div class="details-row"><span class="dim">Sujet</span><strong style="font-weight:700">${escapeHtml(thread.subject)}</strong></div>
              <div class="details-row"><span class="dim">Participants</span><span>${participantLinks.map((p) => renderThreadParticipantLink(p)).join("") || '<span class="dim">—</span>'}</span></div>
              ${
                ENABLE_CLEAN_MESSAGE_VIEW
                  ? `<div class="details-row"><span class="dim">Vue</span><span class="label" style="background:rgba(173,188,216,.06);color:var(--text)">${state.messageViewMode === "clean" ? "Lisible (auto)" : "Tout brut"}</span></div>`
                  : ""
              }
              <div class="details-row"><span class="dim">Tags</span><span><button type="button" class="ghost-button thread-tags-details-link" data-action="open-thread-tags">${detailsTagCount ? `Voir les tags (${detailsTagCount})` : "Voir les tags"}</button></span></div>
            </div>
          `
          : `
            <div class="details-block details-block-muted">
              <p class="dim" style="margin:0;line-height:1.5;font-size:12px">
                Les détails du fil et les actions associées sont disponibles après ouverture d’une conversation.
              </p>
            </div>
          `
      }

      ${threadReading && thread ? `<div class="ai-actions" style="margin-top:8px">
        <button class="ai-action surface-sm" data-action="summarize"><span>[S]</span><span><strong>Aperçu du fil</strong><small class="dim" style="display:block">Résumé LLM · streaming</small></span></button>
        ${
          renderDeps().shouldOfferThreadTranslate(thread, state.appPrefs.general.motherLanguage?.trim() || "fr")
            ? `<button class="ai-action surface-sm" data-action="llm-translate-thread"><span>[T]</span><span><strong>Traduire le fil</strong><small class="dim" style="display:block">Tout le fil en un bloc (langue mère · LLM)</small></span></button>`
            : ""
        }
        ${
          renderDeps().threadIsAutoMail(thread)
            ? ""
            : `<button class="ai-action surface-sm" data-action="llm-quick-replies-thread"><span>[Q]</span><span><strong>Réponses rapides</strong><small class="dim" style="display:block">Propositions LLM · injecter dans le compositeur</small></span></button>${
                isAiFeatureEnabled(state.appPrefs.ai, "featureAgentPrepareReplyEnabled")
                  ? `<button class="ai-action surface-sm" data-action="agent-prepare-start"><span>[A]</span><span><strong>Assistant réponse</strong><small class="dim" style="display:block">Faits · brouillon · cohérence</small></span></button>`
                  : ""
              }`
        }
      </div>` : ""}
      ${threadReading && thread && !renderDeps().threadIsAutoMail(thread) ? renderAgentPrepareReplyPanelHtml() : ""}
      ${threadReading && thread ? renderThreadQaBlockHtml() : ""}

      ${
        threadReading &&
        !renderDeps().threadIsAutoMail(thread) &&
        state.quickReplySuggestions.length &&
        renderDeps().threadIdsMatch(state.aiThreadScope, state.selectedThreadId)
          ? `<div class="ai-quick-replies" role="list">${state.quickReplySuggestions
              .map(
                (s, i) => `
            <div class="ai-quick-reply-card surface-sm" role="listitem">
              <div class="ai-quick-reply-card__tone dim">${escapeHtml(s.tone)}</div>
              <p class="ai-quick-reply-card__text">${escapeHtml(s.text)}</p>
              ${s.rationale?.trim() ? `<p class="ai-quick-reply-card__why dim">${escapeHtml(s.rationale.trim())}</p>` : ""}
              <div class="ai-quick-reply-card__actions">
                <button type="button" class="ghost-button ai-quick-reply-card__btn" data-action="quick-reply-compose" data-qr-index="${i}">Composer</button>
                <button type="button" class="ghost-button ai-quick-reply-card__btn" data-action="quick-reply-copy" data-qr-index="${i}">Copier</button>
              </div>
            </div>`
              )
              .join("")}</div>`
          : ""
      }
      ${renderThreadSummaryPanelHtml()}
      </div>
    </aside>
  `;
}