import { isAiFeatureEnabled } from "../../../aiFeatures";
import { isVirtualMailbox } from "../../../mailboxKinds";
import { t } from "../../../i18n";
import { escapeAttr, escapeHtml } from "../../../ui/sanitize";
import { formatNewsletterRuleInput } from "../../lib/newsletterRuleFormat";
import { formatAttachmentSizeKb } from "../../lib/attachmentSize";
import { mailHtmlMountAttrs } from "../../lib/htmlMessage";
import { iconSvg } from "../../lib/iconSvg";
import { initials } from "../../lib/tags";
import { isTauriRuntime } from "../../lib/tauriRuntime";
import { state } from "../../state";
import { messageAccordionOpen, threadMessageFoldPreview } from "../../mail/threadAccordion";
import { canonicalEmailForNlMatch } from "../../mail/searchAccountResolve";
import { renderThreadLoopChangeNote } from "../../mail/threadViewUiRecipientPresenceRun";
import { firstMatchingNewsletterRule, newsletterEmailListed } from "../../mail/newsletterRulesMatch";
import type {
  CleanedMessageView,
  MailSecuritySignals,
  MailUnsubscribeLink,
  MessageViewMode,
  Tag,
  ThreadParticipantLink,
} from "../../types";
import { renderDimmedBlocksFold } from "../../mail/dimmedBlocksFold";
import { renderHistoryFold } from "../../mail/historyFold";
import { unsubscribeHrefScore } from "../../mail/mailUnsubscribeLinks";
import { renderActionMenuHtml } from "../../mail/actionMenu";
import { renderViewNavTrail } from "./listChrome";
import { renderDeps } from "./renderDeps";

const ENABLE_CLEAN_MESSAGE_VIEW = true;

function renderMailUnsubscribeBar(links: MailUnsubscribeLink[]): string {
  if (!links.length) return "";
  const sorted = [...links].sort((a, b) => unsubscribeHrefScore(b.href) - unsubscribeHrefScore(a.href));
  const btns = sorted
    .map(
      (l) =>
        `<button type="button" class="mail-unsubscribe-bar__btn" data-action="mail-unsubscribe-open" data-href="${escapeAttr(l.href)}" title="${escapeAttr(l.href)}">${escapeHtml(l.label)}</button>`
    )
    .join("");
  const hint =
    sorted.length > 1 ? `${sorted.length} liens détectés dans le message` : "Lien extrait du corps du message";
  return `<div class="mail-unsubscribe-bar" role="region" aria-label="Désabonnement">
    <div class="mail-unsubscribe-bar__lead">
      <span class="mail-unsubscribe-bar__kicker">Désabonnement</span>
      <span class="mail-unsubscribe-bar__hint dim">${escapeHtml(hint)}</span>
    </div>
    <div class="mail-unsubscribe-bar__actions">${btns}</div>
  </div>`;
}

export function renderThreadParticipantLink(p: ThreadParticipantLink, className = "thread-participant-link"): string {
  if (p.email) {
    return `<button type="button" class="${className} label" data-action="contacts-open-detail" data-email="${escapeAttr(p.email)}" title="${escapeAttr(p.email)}">${escapeHtml(p.name)}</button>`;
  }
  return `<span class="label" style="margin-right:6px;background:rgba(173,188,216,.06);color:var(--text)">${escapeHtml(p.name)}</span>`;
}

function renderMessageSenderLink(message: CleanedMessageView, className = "thread-msg-from"): string {
  const email = (message.senderEmail ?? "").trim().toLowerCase();
  if (email.includes("@")) {
    return `<button type="button" class="${className} thread-participant-link" data-action="contacts-open-detail" data-email="${escapeAttr(email)}" title="${escapeAttr(email)}">${escapeHtml(message.sender)}</button>`;
  }
  return `<strong class="${className}">${escapeHtml(message.sender)}</strong>`;
}

export function renderThreadNlRuleButton(seSenderRaw: string, nlListedHere: boolean): string {
  if (!isTauriRuntime()) return "";
  const seNorm = canonicalEmailForNlMatch(seSenderRaw);
  if (!seNorm) return "";
  if (nlListedHere) {
    const matched = firstMatchingNewsletterRule(seSenderRaw);
    const key = matched ? formatNewsletterRuleInput(matched) : (seNorm as string);
    const tip = `Expéditeur auto (activé) — cliquer pour désactiver · ${key}`;
    return `<button type="button" class="icon-pill icon-pill-sm thread-auto-sender thread-auto-sender--on" data-action="newsletter-msg-remove-rule" data-rule="${escapeAttr(key)}" title="${escapeAttr(tip)}" aria-label="${escapeAttr(tip)}"><span class="thread-auto-sender__glyph" aria-hidden="true">A</span></button>`;
  }
  const tip = `Expéditeur auto — cliquer pour activer · ${seNorm}`;
  return `<button type="button" class="icon-pill icon-pill-sm thread-auto-sender thread-auto-sender--off" data-action="newsletter-msg-add-rule" data-rule="${escapeAttr(seNorm)}" title="${escapeAttr(tip)}" aria-label="${escapeAttr(tip)}"><span class="thread-auto-sender__glyph" aria-hidden="true">A</span></button>`;
}

function renderThreadMsgHeadActions(
  message: CleanedMessageView,
  nlRuleHtml: string,
  threadTags?: Tag[]
): string {
  const motherRaw = state.appPrefs.general.motherLanguage?.trim() || "fr";
  const offerTr = renderDeps().shouldOfferPerMessageTranslate(message, motherRaw, threadTags);
  const security = renderMailSecurityPop(message, { compact: true });
  const replyBtn = `<button type="button" class="icon-pill icon-pill-sm thread-reply-one" data-action="reply-one" data-msg-id="${escapeAttr(message.messageId)}" title="Répondre à ce mail" aria-label="Répondre à ce mail">${iconSvg("reply")}</button>`;
  const forwardOneBtn = `<button type="button" class="icon-pill icon-pill-sm thread-forward-one" data-action="forward-one" data-msg-id="${escapeAttr(message.messageId)}" title="Transférer ce message" aria-label="Transférer ce message">${iconSvg("forward")}</button>`;

  const moreItems = [
    ...(offerTr
      ? [
          {
            action: "llm-translate-message",
            label: "Traduire",
            extraAttrs: `data-msg-id="${escapeAttr(message.messageId)}"`,
          },
        ]
      : []),
    ...(state.selectedThreadId?.trim()
      ? [
          {
            action: "retag-thread",
            label: "Recalculer les tags",
            extraAttrs: `data-thread-id="${escapeAttr(state.selectedThreadId)}"`,
          },
        ]
      : []),
    ...(message.collapsedQuotes.length
      ? [
          {
            action: "open-quote-fold",
            label: "Citations repliées",
            extraAttrs: `data-msg-id="${escapeAttr(message.messageId)}"`,
          },
        ]
      : []),
  ];
  // nlRuleHtml is a full button — keep as compact sibling if present
  const secBar = security ? `<div class="action-bar action-bar--sec action-bar--compact">${security}</div>` : "";
  const opsBar = `<div class="action-bar action-bar--ops action-bar--compact">${replyBtn}${forwardOneBtn}</div>`;
  const moreMenu =
    moreItems.length > 0
      ? renderActionMenuHtml({
          label: "Plus",
          ariaLabel: "Plus d’actions sur ce message",
          triggerClass: "ghost-button action-menu__trigger action-menu__trigger--sm",
          items: moreItems,
        })
      : "";
  const nlBar = nlRuleHtml ? `<div class="action-bar action-bar--util action-bar--compact">${nlRuleHtml}</div>` : "";

  return `<div class="thread-msg-head-actions" role="group" aria-label="Actions sur ce message">${secBar}${opsBar}${moreMenu}${nlBar}</div>`;
}

function renderMessageInlineTranslation(message: CleanedMessageView, targetLang: string, offerTranslationUi: boolean): string {
  if (!isTauriRuntime()) return "";
  if (!offerTranslationUi) {
    const busy = Boolean(state.messageTranslationBusy[message.messageId]);
    if (!busy) return "";
  }
  const key = `${message.messageId}|${targetLang}`;
  const tText = state.messageTranslations[key];
  const busy = Boolean(state.messageTranslationBusy[message.messageId]);
  if (!offerTranslationUi && !busy && tText?.trim()) return "";
  const langLabel = escapeHtml(targetLang.toUpperCase());
  if (!tText?.trim()) {
    if (!busy) return "";
    return `<div class="message-inline-translation message-inline-translation--busy" aria-live="polite">
      <span class="dim message-inline-translation__wait">Traduction en cours…</span>
    </div>`;
  }
  const body = escapeHtml(tText);
  const busyLine = busy ? `<p class="dim message-inline-translation__wait" style="margin:0 0 6px">Actualisation…</p>` : "";
  return `<div class="message-inline-translation" lang="${escapeAttr(targetLang)}" dir="auto">
    <div class="message-inline-translation__badge">Traduction · ${langLabel}</div>
    ${busyLine}
    <div class="message-inline-translation__body">${body}</div>
    <div class="message-inline-translation__meta">
      <button type="button" class="ghost-button ghost-button-sm" data-action="llm-translate-message" data-msg-id="${escapeAttr(message.messageId)}" data-llm-translate-refresh="1">Actualiser</button>
    </div>
  </div>`;
}

function renderThreadMessageAttachmentSection(message: CleanedMessageView): string {
  const n = message.attachments.length;
  if (!n) return "";
  const cards = message.attachments
    .map(
      (att) =>
        `<div class="thread-attach-card surface-sm">
          <span class="thread-attach-ico" aria-hidden="true">${iconSvg("attachment")}</span>
          <div class="thread-attach-info">
            <strong class="thread-attach-name">${escapeHtml(att.fileName)}</strong>
            <span class="thread-attach-size dim">${escapeHtml(formatAttachmentSizeKb(att.sizeBytes))}</span>
          </div>
          <button type="button" class="icon-pill icon-pill-sm thread-attach-dl" data-att-download="${escapeAttr(att.id)}" data-msg-id="${escapeAttr(message.messageId)}" title="Télécharger">${iconSvg("download")}</button>
        </div>`
    )
    .join("");
  const framed = `<div class="thread-msg-attachments thread-msg-attachments--framed">${cards}</div>`;
  if (n > 6) {
    return `<details class="thread-attachments-fold"><summary class="thread-attachments-fold__sum">${escapeHtml(`Pièces jointes (${n})`)}</summary>${framed}</details>`;
  }
  return framed;
}

export function renderThread() {
  const thread = state.selectedThread;
  if (!thread) {
    return `<section class="thread-view" aria-label="Fil"><div class="pane-header thread-load-empty">Fil indisponible — utilisez « ← Boîte de réception » ou relancez la synchronisation.</div></section>`;
  }
  const userMode = state.messageViewMode;
  /** Derniers reçus en premier ; regroupement visuel si le même expéditeur envoie plusieurs mails d’affilée dans cet ordre. */
  const msgs = renderDeps().sortMessagesByReceivedDescending(thread.messages);
  const attachmentCount = msgs.reduce((total, message) => total + message.attachments.length, 0);
  const participantLinks = renderDeps().threadParticipantsWithEmails(thread.messages);
  const avCap = 5;
  const avExtra = participantLinks.length > avCap ? participantLinks.length - avCap : 0;
  const replyTarget = escapeHtml(renderDeps().threadQuickReplyTargetName(msgs));
  const translationTargetLang = state.appPrefs.general.motherLanguage?.trim() || "fr";
  const recipientEventsById = renderDeps().threadRecipientPresenceEventsByMessageId(thread.messages);
  const zenOut = renderDeps().threadAiSummaryShownInZen() ? (state.aiOutput?.trim() ?? "") : "";
  const blockReply = renderDeps().threadIsAutoMail(thread);
  const listRow =
    state.selectedThreadId ?
      state.threads.find((t) => String(t.id) === String(state.selectedThreadId))
    : undefined;
  const toolbarFollowed = listRow ? renderDeps().threadListFollowed(listRow) : false;
  const threadUnreadNav = Boolean(listRow?.unread ?? thread?.unread);
  const readingSimple = true;
  const threadReadingLayoutClass = " thread-reading--reading-layout";

  return `
    <section class="thread-view thread-reading${threadReadingLayoutClass}" aria-label="Fil de discussion">
      <header class="thread-reading-head">
        ${renderViewNavTrail(`<div class="action-bar action-bar--util" role="toolbar" aria-label="Synchronisation">
              <button type="button" class="icon-pill thread-nav-sync${state.syncInProgress ? " is-loading" : ""}" data-action="sync-inbox" title="Synchroniser (Ctrl+F5)" aria-label="Synchroniser" ${state.syncInProgress ? "disabled" : ""}>${state.syncInProgress ? `<span class="mini-sync"><span class="spinner" aria-hidden="true"></span></span>` : iconSvg("sync")}</button>
            </div>`)}

        <div class="thread-reading-hero">
          <h1 class="thread-reading-title">${escapeHtml(thread.subject)}</h1>
          <p class="thread-reading-stats dim">
            ${msgs.length} message${msgs.length === 1 ? "" : "s"}${attachmentCount > 0 ? ` · ${attachmentCount} pièce${attachmentCount === 1 ? "" : "s"} jointe${attachmentCount === 1 ? "" : "s"}` : ""}
          </p>
          ${
            msgs.length > 1
              ? `<div class="thread-accordion-bar" role="group" aria-label="Pliage des messages">
                  <button type="button" class="ghost-button thread-accordion-btn" data-action="thread-accordion-collapse-all" aria-pressed="${state.threadAccordion === "none" ? "true" : "false"}">Tout replier</button>
                  <button type="button" class="ghost-button thread-accordion-btn" data-action="thread-accordion-expand-all" aria-pressed="${state.threadAccordion === "all" ? "true" : "false"}">Tout développer</button>
                </div>`
              : ""
          }

          ${participantLinks.length ? `<div class="thread-participants-block">
              <span class="thread-kicker">Participants</span>
              <div class="thread-participants-chips">
                ${participantLinks
                  .slice(0, avCap)
                  .map((p) => renderThreadParticipantLink(p, "thread-participant-chip"))
                  .join("")}
                ${avExtra ? `<span class="dim thread-participant-more">+${avExtra}</span>` : ""}
              </div>
            </div>` : ""}

          <div class="thread-action-bar">
            <div class="thread-more-actions">
              <div class="action-bar action-bar--primary" role="toolbar" aria-label="Répondre">
                <button type="button" class="icon-pill inbox-thread-follow-toggle ${toolbarFollowed ? "inbox-thread-follow-toggle--on" : ""}" data-action="toggle-thread-follow" data-thread-id="${escapeAttr(state.selectedThreadId ?? "")}" title="${escapeAttr(toolbarFollowed ? "Retirer du suivi" : "Suivre ce fil")}" aria-label="${escapeAttr(toolbarFollowed ? "Retirer du suivi" : "Suivre ce fil")}" aria-pressed="${toolbarFollowed}">${iconSvg(toolbarFollowed ? "starFilled" : "starOutline")}</button>
                ${
                  blockReply
                    ? ""
                    : `<button type="button" class="primary-button thread-reply-primary" data-action="reply" title="Répondre" aria-label="Répondre">${iconSvg("reply")}<span>Répondre</span></button>
                       <button type="button" class="icon-pill" data-action="reply-all" title="Répondre à tous" aria-label="Répondre à tous">${iconSvg("replyAll")}</button>`
                }
                <button type="button" class="icon-pill" data-action="forward" title="Transférer" aria-label="Transférer">${iconSvg("forward")}</button>
              </div>
              <div class="action-bar action-bar--menus" role="toolbar" aria-label="Plus d’actions">
                ${renderActionMenuHtml({
                  label: "Organiser",
                  title: "Archiver, déplacer, corbeille…",
                  triggerClass: "ghost-button action-menu__trigger",
                  items: [
                    { action: "thread-archive-cur", label: "Archiver" },
                    { action: "thread-unarchive-cur", label: "Désarchiver" },
                    { action: "thread-move-cur", label: "Déplacer" },
                    {
                      action: "toggle-thread-seen-cur",
                      label: threadUnreadNav ? "Marquer comme lu" : "Marquer comme non lu",
                    },
                    { action: "thread-trash-cur", label: "Corbeille", danger: true },
                  ],
                })}
                ${renderActionMenuHtml({
                  label: "IA",
                  title: "Résumer, traduire, panneau détails",
                  triggerClass: "ghost-button action-menu__trigger",
                  items: [
                    { action: "summarize", label: "Résumer" },
                    ...(msgs.some((m) =>
                      renderDeps().shouldOfferPerMessageTranslate(m, translationTargetLang, thread.tags),
                    )
                      ? [{ action: "llm-translate-thread", label: "Traduire le fil" }]
                      : []),
                    {
                      action: "toggle-ai",
                      label: state.aiOpen ? "Masquer le panneau" : "Panneau Détails",
                    },
                  ],
                })}
                ${renderActionMenuHtml({
                  label: "Plus",
                  title: "Tags, vue, options",
                  triggerClass: "ghost-button action-menu__trigger",
                  items: [
                    { action: "open-thread-tags", label: "Tags du fil" },
                    {
                      action: "retag-thread",
                      label: "Recalculer les tags",
                      extraAttrs: `data-thread-id="${escapeAttr(state.selectedThreadId ?? "")}"`,
                    },
                    ...(ENABLE_CLEAN_MESSAGE_VIEW
                      ? [{ action: "toggle-message-view", label: userMode === "clean" ? "Afficher brut" : "Vue lisible" }]
                      : []),
                  ],
                })}
              </div>
            </div>
          </div>
        </div>
      </header>

      ${zenOut ? `<aside class="thread-zen surface-sm" aria-label="Résumé">
          <div class="thread-zen-top">
            <span class="thread-zen-brand" aria-hidden="true">${iconSvg("spark")}</span>
            <span class="thread-kicker thread-kicker-strong">Résumé</span>
          </div>
          <div class="thread-zen-body">${renderDeps().zenSummaryHtmlFragments(zenOut)}</div>
        </aside>` : ""}

      <div class="thread-messages thread-messages-reading">
        ${(() => {
          const messageIdsDesc = msgs.map((m) => m.messageId);
          return msgs
          .map((message, i) => {
            const prev = msgs[i - 1];
            const sameSenderAsPrev =
              Boolean(prev) && renderDeps().normalizeThreadSenderLabel(prev!.sender) === renderDeps().normalizeThreadSenderLabel(message.sender);
            const showMeta = !sameSenderAsPrev;
            const showAvatar = !sameSenderAsPrev;
            const daySeparator = renderDaySeparator(prev?.receivedAt, message.receivedAt);
            const laneTree = renderDeps().threadTreeLaneRight(thread, message);
            const isMine = renderDeps().isOwnSender(message.sender);
            const isRoot = laneTree.isRoot;
            const isSolo = msgs.length === 1;
            const accentVars = renderDeps().senderAccentVars(message.sender);
            const isoWhen = renderDeps().receivedAtIsoDatetime(message.receivedAt);
            const eff = renderDeps().effectiveMessageViewMode(message, userMode);
            const showsHtmlBubble =
              eff === "original"
                ? Boolean(message.htmlBody)
                : Boolean(message.cleanedHtmlBody?.trim());
            const seSenderRaw = message.senderEmail?.trim() ?? "";
            /** Liste côté client + drapeaux renvoyés par open_thread après enrichissement SQLite. */
            const nlListedHere =
              Boolean(message.isNewsletter) || newsletterEmailListed(seSenderRaw);
            const suppressAutoEnvelope = renderDeps().threadSuppressAutoEnvelopeMeta(thread, message, nlListedHere);
            const nlRuleRow = renderThreadNlRuleButton(seSenderRaw, nlListedHere);
            const loopChangeHtml = suppressAutoEnvelope
              ? ""
              : renderThreadLoopChangeNote(recipientEventsById.get(message.messageId), iconSvg("thread"));
            const offerMsgTranslate = renderDeps().shouldOfferPerMessageTranslate(message, translationTargetLang, thread.tags);
            const inlineTr = renderMessageInlineTranslation(message, translationTargetLang, offerMsgTranslate);
            const htmlForDisplay = showsHtmlBubble ? renderDeps().messageHtmlForDisplay(message, eff) : null;
            const unsubLinks = htmlForDisplay ? renderDeps().extractUnsubscribeLinksFromHtml(htmlForDisplay) : [];
            const headActionsHtml = renderThreadMsgHeadActions(message, nlRuleRow, thread.tags);
            const headMainHtml =
              showMeta ?
                readingSimple
                  ? `${renderMessageSenderLink(message)}
                        <span class="thread-msg-head-sep" aria-hidden="true">·</span>
                        <time class="thread-msg-time"${isoWhen ? ` datetime="${escapeAttr(isoWhen)}"` : ""}>${escapeHtml(renderDeps().formatThreadReadingWhen(message.receivedAt))}</time>`
                  : `<time class="thread-msg-time"${isoWhen ? ` datetime="${escapeAttr(isoWhen)}"` : ""}>${escapeHtml(renderDeps().formatThreadReadingWhen(message.receivedAt))}</time>
                        <span class="thread-msg-head-sep" aria-hidden="true">·</span>
                        ${renderMessageSenderLink(message)}`
              : `<time class="thread-msg-time thread-msg-time--inline"${isoWhen ? ` datetime="${escapeAttr(isoWhen)}"` : ""}>${escapeHtml(renderDeps().formatThreadReadingWhen(message.receivedAt))}</time>`;
            const anchorId = renderDeps().threadMessageAnchorId(message.messageId, i);
            const anchorName = message.messageId.trim() || anchorId;
            const msgOpen = messageAccordionOpen(state.threadAccordion, message.messageId, messageIdsDesc);
            const unreadMark = Boolean(threadUnreadNav) && i === 0;
            const foldPreview = threadMessageFoldPreview(message.cleanedText || message.sourceText || "");
            const foldLabel = msgOpen ? "Replier ce message" : "Développer ce message";
            return `
              ${daySeparator}
              ${loopChangeHtml}
              <a class="thread-msg-anchor" name="${escapeAttr(anchorName)}" id="${escapeAttr(anchorId)}" aria-hidden="true"></a>
              <article class="message thread-msg ${msgOpen ? "thread-msg--open" : "thread-msg--folded"} ${unreadMark ? "thread-msg--unread" : ""} ${isMine ? "mine" : ""} ${isRoot ? "thread-msg--root" : ""} ${isSolo ? "thread-msg--solo" : ""} ${showsHtmlBubble ? "has-html" : ""} ${showMeta ? "thread-msg--head" : "compact"}" style="${accentVars}">
                ${showAvatar ? `<span class="avatar thread-msg-avatar">${initials(message.sender)}</span>` : `<span class="avatar avatar-spacer" aria-hidden="true"></span>`}
                <div class="message-stack">
                  <header class="message-head-row${showMeta ? "" : " message-head-row--compact"}">
                    <button type="button" class="thread-msg-fold" data-action="thread-accordion-toggle" data-msg-id="${escapeAttr(message.messageId)}" aria-expanded="${msgOpen ? "true" : "false"}" aria-label="${escapeAttr(foldLabel)}" title="${escapeAttr(foldLabel)}">
                      <span class="thread-msg-fold-chevron" aria-hidden="true"></span>
                    </button>
                    <div class="thread-msg-head-main">${headMainHtml}</div>
                  </header>
                  ${
                    msgOpen
                      ? ""
                      : `<button type="button" class="thread-msg-fold-preview" data-action="thread-accordion-toggle" data-msg-id="${escapeAttr(message.messageId)}">${escapeHtml(foldPreview)}</button>`
                  }
                  <div class="thread-msg-card mail-security-tier ${renderDeps().mailSecurityTierClass(renderDeps().normalizedMailSecurity(message))}">
                    ${headActionsHtml}
                    ${renderMessageBody(message, eff, unsubLinks)}
                    ${inlineTr}
                    ${
                      message.attachments.length > 1
                        ? `<div class="thread-attach-bulk-row">
                        <button type="button" class="ghost-button thread-attach-bulk-btn" data-action="download-all-attachments" data-msg-id="${escapeAttr(message.messageId)}" title="Enregistrer toutes les pièces jointes de ce message dans Téléchargements">
                          ${iconSvg("download")}<span>Tout télécharger (${message.attachments.length})</span>
                        </button>
                      </div>`
                        : ""
                    }
                    ${renderThreadMessageAttachmentSection(message)}
                    ${""}
                  </div>
                </div>
              </article>
            `;
          })
          .join("");
        })()}
      </div>

      ${
        blockReply
          ? ""
          : `<div class="thread-quick-zone">
        <div class="thread-quick-reveal-bar">
          <button
            type="button"
            class="thread-quick-reveal${state.threadQuickReplyOpen ? " is-open" : ""}"
            data-action="toggle-thread-quick-reply"
            aria-expanded="${state.threadQuickReplyOpen ? "true" : "false"}"
            aria-controls="thread-quick-panel"
            title="${state.threadQuickReplyOpen ? "Masquer la réponse rapide" : "Afficher la réponse rapide"}"
          >
            ${iconSvg("reply")}
            <span class="thread-quick-reveal-label">Répondre à <strong>${replyTarget}</strong></span>
            <span class="thread-quick-reveal-chevron" aria-hidden="true"></span>
          </button>
        </div>
        <div id="thread-quick-panel" class="thread-quick-panel${state.threadQuickReplyOpen ? " is-open" : ""}">
          <div class="thread-quick-panel-inner">
            <footer class="quick-reply thread-quick-footer">
              <div class="thread-quick-sheet">
                <p class="thread-quick-kicker"><span>Répondre à</span> <strong>${replyTarget}</strong></p>
                <input
                  type="text"
                  class="thread-quick-field"
                  placeholder="Écrivez votre réponse…"
                  data-quick-reply
                  autocomplete="off"
                  ${state.threadQuickReplyOpen ? "" : " tabindex=\"-1\""}
                />
                <div class="thread-quick-bottom">
                  <div class="thread-quick-links">
                    <button type="button" class="thread-linkish" data-action="quick-reply-compose" title="Composer">Composer</button>
                    <span class="thread-quick-div" aria-hidden="true"></span>
                    <button type="button" class="thread-linkish" data-action="forward" title="Transférer">Transférer</button>
                  </div>
                  <div class="thread-quick-send">
                    <button type="button" class="ghost-button thread-quick-secondary" data-action="quick-reply-send-all">Tous</button>
                    <button type="button" class="primary-button thread-quick-primary" data-action="quick-reply-send">Envoyer la réponse</button>
                  </div>
                </div>
              </div>
            </footer>
          </div>
        </div>
      </div>`
      }
    </section>
  `;
}

function renderMailSecurityPop(message: CleanedMessageView, opts?: { compact?: boolean }): string {
  const ms = renderDeps().normalizedMailSecurity(message);
  // UX: ne pas afficher de badge quand tout va bien (évite "RAS" omniprésent et inutile).
  if (ms.severity === "ok") return "";
  const label = ms.severity === "attention" ? t("security.attention") : t("security.suspicion");
  const chipClass =
    ms.severity === "attention" ? "mail-security-hit--attention" : "mail-security-hit--suspicion";
  // Badge IA seulement s’il y a un finding d’intention réel (pas un budget cosmétique).
  const hasLlmHint = ms.findings?.some((f) => f.kind === "llmIntent") ?? false;
  const iaPill = hasLlmHint
    ? `<span class="mail-security-ia-pill" title="${escapeAttr(t("security.iaHint"))}">IA</span>`
    : "";
  const mid = message.messageId?.trim();
  const iaSecurityOn = isAiFeatureEnabled(state.appPrefs.ai, "featureSecurityLlmEnabled");
  const iaPending = Boolean(mid && iaSecurityOn && renderDeps().isSecurityLlmAugmentPending(mid));
  const displayFindings = renderDeps().mailSecurityFindingsForDisplay(message, ms);
  const findings =
    displayFindings.map(
      (f) =>
        `<li class="mail-security-finding mail-security-finding--${escapeAttr(String(f.severity))}">${escapeHtml(f.messageFr)}${
          f.kind === "llmIntent" ?
            ` <span class="dim mail-security-kind-ia" title="${escapeAttr(t("security.iaContribution"))}">(IA)</span>`
          : ""
        }</li>`
    ) ?? [];
  const findingsBlock = findings.length
    ? `<ul class="mail-security-findings" role="list">${findings.join("")}</ul>`
    : iaPending
      ? `<p class="mail-security-panel__pending dim">${escapeHtml(t("security.iaPending"))}</p>`
      : "";
  const senderEmail = (message.senderEmail || "").trim();
  const tid = state.selectedThreadId ?? "";
  const sourceMb = (state.selectedMailbox || "INBOX").trim();
  const actions =
    opts?.compact || isVirtualMailbox(sourceMb)
      ? ""
      : `<div class="mail-security-panel__actions" style="display:flex;flex-wrap:wrap;gap:8px;margin-top:10px">
          <button type="button" class="ghost-button" data-action="security-move-junk" data-thread-id="${escapeAttr(tid)}" data-source-mailbox="${escapeAttr(sourceMb)}">${escapeHtml(t("security.moveJunk"))}</button>
          <button type="button" class="ghost-button" data-action="security-filter-search" title="Filtrer les mails à score de sécurité élevé">Filtrer #security</button>
          ${
            senderEmail.includes("@")
              ? `<button type="button" class="ghost-button" data-action="security-mark-newsletter" data-sender-email="${escapeAttr(senderEmail)}">${escapeHtml(t("security.markNewsletter"))}</button>`
              : ""
          }
        </div>`;
  const wrap = opts?.compact ? "mail-security-pop mail-security-pop--compact" : "mail-security-pop";
  return `<details class="${wrap}">
  <summary class="mail-security-hit ${chipClass}" title="${escapeAttr(t("security.chipTitle", { label }))}" aria-label="${escapeAttr(t("security.chipAria", { label }))}">
    <span class="mail-security-hit__ico" aria-hidden="true">${iconSvg("shield")}</span>
    ${iaPill}
  </summary>
  <div class="mail-security-panel">
    <p class="mail-security-panel__lead">${escapeHtml(ms.summaryFr)}</p>
    ${findingsBlock ? `<p class="mail-security-panel__kicker">${escapeHtml(t("security.detail"))}</p>${findingsBlock}` : ""}
    ${actions}
  </div>
</details>`;
}

function renderMessageBody(message: CleanedMessageView, mode: MessageViewMode, unsubLinks?: MailUnsubscribeLink[]) {
  const unsubBar =
    unsubLinks === undefined
      ? ""
      : renderMailUnsubscribeBar(unsubLinks);
  if (mode === "original") {
    if (message.htmlBody)
      return `${unsubBar}<div class="message-html" ${mailHtmlMountAttrs(message.messageId, message.htmlBody)}></div>`;
    return `<div class="message-text">${escapeHtml(message.sourceText)}</div>`;
  }
  // clean: HTML nettoyé côté Rust quand disponible, sinon texte (signatures / citations)
  const cleanHtml = message.cleanedHtmlBody?.trim();
  if (cleanHtml) {
    return `${unsubBar}<div class="message-html message-html--clean" ${mailHtmlMountAttrs(message.messageId, cleanHtml)}></div>`;
  }
  const reply = escapeHtml(message.cleanedText || message.sourceText);
  return `<div class="message-text message-text--clean"><div class="rm-mail-reply">${reply}</div>${renderHistoryFold(message.collapsedQuotes)}${renderDimmedBlocksFold(message.dimmedBlocks)}</div>`;
}

function renderDaySeparator(prevReceivedAt: string | undefined, curReceivedAt: string) {
  const cur = renderDeps().parseMaybeDate(curReceivedAt);
  if (!cur) return "";
  const prev = prevReceivedAt ? renderDeps().parseMaybeDate(prevReceivedAt) : null;
  if (prev && renderDeps().dayKey(prev) === renderDeps().dayKey(cur)) return "";

  const today = new Date();
  const label =
    renderDeps().dayKey(cur) === renderDeps().dayKey(today)
      ? "Aujourd’hui"
      : renderDeps().dayKey(cur) === renderDeps().dayKey(new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1))
        ? "Hier"
        : cur.toLocaleDateString(undefined, { weekday: "long", day: "2-digit", month: "short" });

  return `<div class="day-separator"><span>${escapeHtml(label)}</span></div>`;
}