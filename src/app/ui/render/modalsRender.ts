import { mailboxesAllowedForMove, threadMailboxListLabel } from "../../../mailboxKinds";
import { formatFriendlyThreadListDate } from "../../../threadListDates";
import { escapeAttr, escapeHtml } from "../../../ui/sanitize";
import { formatAttachmentSizeKb } from "../../lib/attachmentSize";
import { iconSvg } from "../../lib/iconSvg";
import { state } from "../../state";
import { renderDeps } from "./renderDeps";

export function renderCloseComposeDialog(): string {
  const m = state.closeComposeModal;
  if (!m) return "";
  const title = (m.subject || "").trim() || "Sans objet";
  const already = m.hasSavedRecord;
  return `
    <div class="modal-backdrop" data-action="close-close-compose-modal">
      <div class="modal surface-elevated modal-shell-stop-prop close-compose-modal" role="dialog" aria-modal="true" aria-label="Fermer le compositeur">
        <div class="modal-header">
          <strong>Fermer le compositeur ?</strong>
          <button type="button" class="icon-pill" data-action="close-close-compose-modal" aria-label="Annuler">${iconSvg("close")}</button>
        </div>
        <div class="modal-body" style="display:grid;gap:10px">
          <p style="margin:0">
            ${
              already
                ? `Ce brouillon est déjà dans <strong>Sauvés</strong> (autosave). Vous pouvez le garder ou le supprimer.`
                : `Le brouillon peut être conservé dans <strong>Sauvés</strong> (hors IMAP) ou supprimé définitivement.`
            }
          </p>
          <p class="dim" style="margin:0">
            Objet : <strong>${escapeHtml(title)}</strong>
          </p>
        </div>
        <div class="modal-footer close-compose-modal__footer">
          <button type="button" class="ghost-button" data-action="close-close-compose-modal">Annuler</button>
          <button type="button" class="ghost-button" data-action="close-compose-without-saving">Supprimer définitivement</button>
          <button type="button" class="primary-button" data-action="save-and-close-compose">Garder dans Sauvés</button>
        </div>
      </div>
    </div>
  `;
}

export function renderResumeDraftDialog(): string {
  const m = state.resumeDraftModal;
  if (!m?.sessions?.length) return "";
  const rows = m.sessions
    .map((s) => {
      const tip = escapeAttr(s.preview || s.title);
      return `
        <div class="resume-draft-row" style="display:grid;gap:6px;padding:10px 0;border-top:1px solid color-mix(in srgb, var(--border) 80%, transparent)">
          <div style="display:flex;justify-content:space-between;gap:12px;align-items:baseline">
            <strong title="${tip}">${escapeHtml(s.title)}</strong>
            <span class="dim" style="font-size:0.85em">${escapeHtml(formatFriendlyThreadListDate(s.updatedAt))}</span>
          </div>
          ${s.preview ? `<p class="dim" style="margin:0;font-size:0.9em">${escapeHtml(s.preview)}</p>` : ""}
          <div style="display:flex;gap:8px;flex-wrap:wrap">
            <button type="button" class="primary-button" data-action="resume-orphan-draft" data-session-id="${escapeAttr(s.sessionId)}">Reprendre</button>
            <button type="button" class="ghost-button" data-action="dismiss-orphan-draft" data-session-id="${escapeAttr(s.sessionId)}">Ignorer</button>
          </div>
        </div>`;
    })
    .join("");
  return `
    <div class="modal-backdrop" data-action="close-resume-draft-modal">
      <div class="modal surface-elevated modal-shell-stop-prop" role="dialog" aria-modal="true" aria-label="Reprendre un brouillon">
        <div class="modal-header">
          <strong>Brouillon non terminé</strong>
          <button type="button" class="icon-pill" data-action="close-resume-draft-modal" aria-label="Fermer">${iconSvg("close")}</button>
        </div>
        <div class="modal-body" style="display:grid;gap:4px">
          <p style="margin:0 0 8px">Une session précédente a laissé des versions locales. Reprendre ou ignorer ?</p>
          ${rows}
        </div>
        <div class="modal-footer">
          <button type="button" class="ghost-button" data-action="close-resume-draft-modal">Plus tard</button>
        </div>
      </div>
    </div>
  `;
}

export function renderImageDialog(): string {
  const m = state.imageModal;
  if (!m) return "";
  const safeSrc = escapeAttr(m.src);
  const label = (m.alt || "Image").trim();
  return `
    <div class="modal-backdrop" data-action="close-image-modal">
      <div class="modal surface-elevated image-modal modal-shell-stop-prop" role="dialog" aria-modal="true" aria-label="${escapeAttr(label)}">
        <div class="modal-header">
          <strong style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(label)}</strong>
          <button type="button" class="icon-pill" data-action="close-image-modal" aria-label="Fermer">${iconSvg("close")}</button>
        </div>
        <div class="modal-body image-modal-body">
          <img class="email-img-responsive" src="${safeSrc}" alt="${escapeAttr(label)}" />
        </div>
        <div class="modal-footer">
          <a class="ghost-button" href="${safeSrc}" target="_blank" rel="noreferrer noopener">Ouvrir dans un onglet</a>
          <button type="button" class="primary-button" data-action="close-image-modal">Fermer</button>
        </div>
      </div>
    </div>
  `;
}

export function renderSplitSendDialog(): string {
  const plan = state.splitSendConfirm;
  if (!plan || !plan.chunks.length) return "";
  const n = plan.chunks.length;
  const targetMo = (plan.serverTargetBytes / (1024 * 1024)).toFixed(0);
  const budgetMo = (plan.budgetBytes / (1024 * 1024)).toFixed(1);
  const warnHtml =
    plan.hasOversized ?
      `<div class="split-send-warn" role="alert">
        <strong>Fichier(s) au-delà du budget (~${budgetMo} Mo par mail, cible serveur ~${targetMo} Mo)</strong>
        <p class="dim" style="margin:6px 0 0;font-size:13px">L’envoi peut être refusé par le serveur pour ces lots. Vous pouvez quand même essayer.</p>
        <ul class="split-send-warn-list">
          ${plan.chunks
            .filter((c) => c.oversized)
            .map((c) => {
              const label = (c.displayNames?.[0] ?? c.paths[0] ?? "?").trim();
              return `<li>${escapeHtml(label)} — ${formatAttachmentSizeKb(c.totalBytes)}</li>`;
            })
            .join("")}
        </ul>
      </div>`
    : "";
  const listHtml = plan.chunks
    .map((ch, i) => {
      const names =
        ch.displayNames?.length ?
          ch.displayNames.map((x) => escapeHtml(x.trim())).join(", ")
        : ch.paths.map((p) => escapeHtml((p.split(/[/\\]/).pop() ?? p).trim())).join(", ");
      const tag = ch.oversized ? ` <span class="split-send-oversized-tag">limite</span>` : "";
      return `<li class="split-send-chunk-row"><span class="dim">Mail ${i + 1}/${n}</span> — ${names} — <strong>${formatAttachmentSizeKb(ch.totalBytes)}</strong>${tag}</li>`;
    })
    .join("");
  return `
    <div class="modal-backdrop" data-action="cancel-split-send">
      <div class="modal surface-elevated split-send-modal modal-shell-stop-prop" role="dialog" aria-modal="true" aria-labelledby="split-send-title">
        <div class="modal-header">
          <strong id="split-send-title">Envoi en ${n} parties</strong>
          <button type="button" class="icon-pill" data-action="cancel-split-send" aria-label="Fermer">${iconSvg("close")}</button>
        </div>
        <div class="modal-body split-send-modal-body">
          <p class="dim" style="margin:0 0 10px;font-size:13px">
            Les pièces jointes dépassent ~${budgetMo} Mo par message (limite côté serveur souvent ~${targetMo} Mo une fois encodées).
            Le message sera découpé en <strong>${n} e-mails</strong> dans la même conversation (réponses chaînées).
          </p>
          ${warnHtml}
          <p class="dim" style="margin:0 0 6px;font-size:12px">Répartition proposée :</p>
          <ul class="split-send-chunk-list">${listHtml}</ul>
        </div>
        <div class="modal-footer">
          <button type="button" class="ghost-button" data-action="cancel-split-send">Annuler</button>
          <button type="button" class="primary-button" data-action="confirm-split-send">Envoyer en ${n} parties</button>
        </div>
      </div>
    </div>
  `;
}

export function renderMoveDialog(): string {
  if (!state.moveOpen) return "";
  const tid = state.moveThreadId ?? "";
  const source = tid ? renderDeps().sourceMailboxForThread(tid) : state.selectedMailbox || "INBOX";
  const targets = mailboxesAllowedForMove(state.mailboxes).filter(
    (m) => m.toLowerCase() !== source.toLowerCase(),
  );
  const current = state.moveTargetMailbox;
  const optionsHtml = targets
    .map((m) => {
      const { label } = threadMailboxListLabel(m);
      const display = label === m ? m : `${label} — ${m}`;
      const selected = m.toLowerCase() === current.toLowerCase() ? " selected" : "";
      return `<option value="${escapeAttr(m)}"${selected}>${escapeHtml(display)}</option>`;
    })
    .join("");
  const sourceLabel = threadMailboxListLabel(source).label;
  const noTargets = targets.length === 0;
  return `
    <div class="modal-backdrop" data-action="close-move">
      <div class="modal surface-elevated modal-shell-stop-prop" role="dialog" aria-modal="true" aria-labelledby="move-modal-title">
        <div class="modal-header">
          <strong id="move-modal-title">Déplacer vers…</strong>
          <button class="icon-pill" data-action="close-move" aria-label="Fermer">${iconSvg("close")}</button>
        </div>
        <div class="modal-body" style="display:grid;gap:10px;min-width:320px">
          <p class="dim" style="margin:0;font-size:12px">Depuis <strong>${escapeHtml(sourceLabel)}</strong> — la corbeille et les messages envoyés ne sont pas proposés.</p>
          ${
            noTargets
              ? `<p class="dim" style="margin:0;font-size:12px">Aucun dossier cible disponible.</p>`
              : `<label class="dim" style="display:grid;gap:6px;font-size:12px">Dossier cible
                  <select id="move-target-select" data-action="move-target-change" style="padding:8px 10px;border-radius:var(--radius-btn,6px);background:transparent;color:var(--text);border:1px solid var(--border-weak)">
                    ${optionsHtml}
                  </select>
                </label>`
          }
        </div>
        <div class="modal-footer">
          <button class="ghost-button" data-action="close-move">Annuler</button>
          <button class="primary-button" data-action="confirm-move" style="padding:9px 14px"${noTargets ? " disabled" : ""}>Déplacer</button>
        </div>
      </div>
    </div>
  `;
}

export function renderQuoteFoldDialog(): string {
  const m = state.quoteFoldModal;
  if (!m || m.blocks.length === 0) return "";
  const blocksHtml =
    m.blocks.length === 1
      ? `<pre class="quote-fold-pre">${escapeHtml(m.blocks[0])}</pre>`
      : m.blocks
          .map(
            (block, i) => `
        <section class="quote-fold-block" aria-label="Citation ${i + 1}">
          <p class="quote-fold-block-kicker dim">Citation ${i + 1}/${m.blocks.length}</p>
          <pre class="quote-fold-pre">${escapeHtml(block)}</pre>
        </section>`,
          )
          .join("");
  const n = m.blocks.length;
  const extraitLbl = n === 1 ? "1 extrait cité" : `${n} extraits cités`;
  return `
    <div class="modal-backdrop" data-action="close-quote-fold">
      <div class="modal surface-elevated quote-fold-modal modal-shell-stop-prop" role="dialog" aria-modal="true" aria-labelledby="quote-fold-title">
        <div class="modal-header">
          <strong id="quote-fold-title">Historique masqué</strong>
          <button type="button" class="icon-pill" data-action="close-quote-fold" aria-label="Fermer">${iconSvg("close")}</button>
        </div>
        <p class="quote-fold-subtitle dim">${escapeHtml(m.senderLabel)} · ${m.foldedLines} lignes · ${extraitLbl}</p>
        <div class="modal-body quote-fold-body">${blocksHtml}</div>
        <div class="modal-footer">
          <button type="button" class="ghost-button" data-action="close-quote-fold">Fermer</button>
        </div>
      </div>
    </div>
  `;
}

export function renderMailboxManageDialog(): string {
  if (!state.mailboxManageOpen) return "";
  return `
    <div class="modal-backdrop" data-action="close-mailbox-manage">
      <div class="modal surface-elevated modal-shell-stop-prop" role="dialog" aria-modal="true" aria-label="Mailbox actions">
        <div class="modal-header">
          <strong>Mailbox</strong>
          <button class="icon-pill" data-action="close-mailbox-manage" aria-label="Close">${iconSvg("close")}</button>
        </div>
        <div class="modal-body" style="display:grid;gap:10px">
          <button class="ghost-button" data-action="mb-create">Create mailbox…</button>
          <button class="ghost-button" data-action="mb-rename">Rename mailbox…</button>
          <button class="ghost-button" data-action="mb-subscribe">Subscribe mailbox</button>
          <button class="ghost-button" data-action="mb-delete" style="color:var(--danger)">Delete mailbox…</button>
          <button class="ghost-button" data-action="open-folder-manager-view">Ouvrir la vue Dossiers…</button>
          <p class="dim" style="font-size:12px;margin:4px 0 0">Current: <strong>${escapeHtml(state.selectedMailbox || "INBOX")}</strong></p>
        </div>
        <div class="modal-footer">
          <button class="ghost-button" data-action="close-mailbox-manage">Close</button>
        </div>
      </div>
    </div>
  `;
}
