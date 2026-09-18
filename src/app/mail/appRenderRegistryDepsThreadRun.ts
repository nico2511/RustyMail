/** Thread / message / security helpers for `buildAppRenderDeps`. */
import type { RenderDeps } from "../ui/render/renderDeps";
import { renderComposer } from "../ui/render/composerRender";
import { renderThread } from "../ui/render/threadViewRender";
import { attachmentPathsJoinedForHiddenField } from "./composeAttachmentPaths";
import { composeKindTitle, formatDraftRevisionStamp } from "./composeFormLabels";
import {
  composeMicButtonTitle,
  micAriaLabel,
  threadQaMicButtonTitle,
} from "./composeMicUiHints";
import { draftHasRecipientsExtra } from "./composeDraftRecipients";
import {
  extractUnsubscribeLinksFromHtml,
  messageHtmlForDisplay,
  sanitizeEmailHtml,
} from "./mailEmailHtmlSanitize";
import {
  activeSecurityLlmAugmentCount,
  isSecurityLlmAugmentPending,
  mailSecurityFindingsForDisplay,
  mailSecurityTierClass,
  normalizedMailSecurity,
} from "./mailSecurityDisplay";
import { threadIdsMatch } from "../lib/threadIdsMatch";
import {
  agentOfferSlotsStep,
  agentSkillEnabled,
  agentStepProgressLabel,
  threadAiSummaryForCurrentThread,
  threadAiSummaryShownInZen,
} from "./threadAiStreamDom";
import { threadIsAutoMail } from "./threadAutoMail";
import { shouldOfferPerMessageTranslate, shouldOfferThreadTranslate } from "./threadLangGuess";
import { threadMessageAnchorId } from "./threadMessageAnchor";
import {
  dayKey,
  formatThreadReadingWhen,
  parseMaybeDate,
  receivedAtIsoDatetime,
  sortMessagesByReceivedDescending,
} from "./threadMessageSort";
import { activeMessageTranslationJobCount } from "./threadStatusJobCounts";
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

export function buildThreadRenderDepsFragment(): Pick<
  RenderDeps,
  | "normalizeThreadSenderLabel"
  | "formatThreadReadingWhen"
  | "sortMessagesByReceivedDescending"
  | "activeMessageTranslationJobCount"
  | "activeSecurityLlmAugmentCount"
  | "renderThread"
  | "renderComposer"
  | "threadParticipantsWithEmails"
  | "threadQuickReplyTargetName"
  | "threadParticipantFirstMessageIds"
  | "threadRecipientPresenceEventsByMessageId"
  | "threadAiSummaryShownInZen"
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
  | "isSecurityLlmAugmentPending"
  | "draftHasRecipientsExtra"
  | "attachmentPathsJoinedForHiddenField"
  | "composeKindTitle"
  | "composeMicButtonTitle"
  | "micAriaLabel"
  | "formatDraftRevisionStamp"
  | "sanitizeEmailHtml"
  | "threadQaMicButtonTitle"
  | "threadAiSummaryForCurrentThread"
  | "threadIdsMatch"
  | "agentStepProgressLabel"
  | "agentSkillEnabled"
  | "agentOfferSlotsStep"
  | "shouldOfferThreadTranslate"
> {
  return {
    normalizeThreadSenderLabel,
    formatThreadReadingWhen,
    sortMessagesByReceivedDescending,
    activeMessageTranslationJobCount,
    activeSecurityLlmAugmentCount,
    renderThread,
    renderComposer,
    threadParticipantsWithEmails,
    threadQuickReplyTargetName,
    threadParticipantFirstMessageIds,
    threadRecipientPresenceEventsByMessageId,
    threadAiSummaryShownInZen,
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
    isSecurityLlmAugmentPending,
    draftHasRecipientsExtra,
    attachmentPathsJoinedForHiddenField,
    composeKindTitle,
    composeMicButtonTitle,
    micAriaLabel,
    formatDraftRevisionStamp,
    sanitizeEmailHtml,
    threadQaMicButtonTitle,
    threadAiSummaryForCurrentThread,
    threadIdsMatch,
    agentStepProgressLabel,
    agentSkillEnabled,
    agentOfferSlotsStep,
    shouldOfferThreadTranslate,
  };
}
