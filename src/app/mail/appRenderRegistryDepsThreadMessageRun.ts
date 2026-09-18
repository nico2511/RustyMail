/** Message / thread display helpers for `buildAppRenderDeps`. */
import type { RenderDeps } from "../ui/render/renderDeps";
import { renderThread } from "../ui/render/threadViewRender";
import {
  extractUnsubscribeLinksFromHtml,
  messageHtmlForDisplay,
} from "./mailEmailHtmlSanitize";
import {
  mailSecurityFindingsForDisplay,
  mailSecurityTierClass,
  normalizedMailSecurity,
} from "./mailSecurityDisplay";
import { threadIdsMatch } from "../lib/threadIdsMatch";
import { threadIsAutoMail } from "./threadAutoMail";
import { shouldOfferPerMessageTranslate } from "./threadLangGuess";
import { threadMessageAnchorId } from "./threadMessageAnchor";
import {
  dayKey,
  formatThreadReadingWhen,
  parseMaybeDate,
  receivedAtIsoDatetime,
  sortMessagesByReceivedDescending,
} from "./threadMessageSort";
import {
  effectiveMessageViewMode,
  isOwnSender,
  normalizeThreadSenderLabel,
  senderAccentVars,
  threadParticipantFirstMessageIds,
  threadParticipantsWithEmails,
  threadQuickReplyTargetName,
  threadRecipientPresenceEventsByMessageId,
  threadSuppressAutoEnvelopeMeta,
  threadTreeLaneRight,
  zenSummaryHtmlFragments,
} from "./threadViewUiHelpers";

export function buildThreadMessageRenderDepsFragment(): Pick<
  RenderDeps,
  | "normalizeThreadSenderLabel"
  | "formatThreadReadingWhen"
  | "sortMessagesByReceivedDescending"
  | "renderThread"
  | "threadParticipantsWithEmails"
  | "threadQuickReplyTargetName"
  | "threadParticipantFirstMessageIds"
  | "threadRecipientPresenceEventsByMessageId"
  | "threadIsAutoMail"
  | "shouldOfferPerMessageTranslate"
  | "threadTreeLaneRight"
  | "isOwnSender"
  | "senderAccentVars"
  | "receivedAtIsoDatetime"
  | "effectiveMessageViewMode"
  | "threadSuppressAutoEnvelopeMeta"
  | "messageHtmlForDisplay"
  | "extractUnsubscribeLinksFromHtml"
  | "threadMessageAnchorId"
  | "normalizedMailSecurity"
  | "mailSecurityTierClass"
  | "mailSecurityFindingsForDisplay"
  | "zenSummaryHtmlFragments"
  | "parseMaybeDate"
  | "dayKey"
  | "threadIdsMatch"
> {
  return {
    normalizeThreadSenderLabel,
    formatThreadReadingWhen,
    sortMessagesByReceivedDescending,
    renderThread,
    threadParticipantsWithEmails,
    threadQuickReplyTargetName,
    threadParticipantFirstMessageIds,
    threadRecipientPresenceEventsByMessageId,
    threadIsAutoMail,
    shouldOfferPerMessageTranslate,
    threadTreeLaneRight,
    isOwnSender,
    senderAccentVars,
    receivedAtIsoDatetime,
    effectiveMessageViewMode,
    threadSuppressAutoEnvelopeMeta,
    messageHtmlForDisplay,
    extractUnsubscribeLinksFromHtml,
    threadMessageAnchorId,
    normalizedMailSecurity,
    mailSecurityTierClass,
    mailSecurityFindingsForDisplay,
    zenSummaryHtmlFragments,
    parseMaybeDate,
    dayKey,
    threadIdsMatch,
  };
}
