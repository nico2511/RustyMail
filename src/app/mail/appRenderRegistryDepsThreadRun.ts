/** Thread / message / security helpers for `buildAppRenderDeps`. */
import type { RenderDeps } from "../ui/render/renderDeps";
import { buildThreadAiRenderDepsFragment } from "./appRenderRegistryDepsThreadAiRun";
import { buildThreadComposeRenderDepsFragment } from "./appRenderRegistryDepsThreadComposeRun";
import { buildThreadMessageRenderDepsFragment } from "./appRenderRegistryDepsThreadMessageRun";

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
    ...buildThreadMessageRenderDepsFragment(),
    ...buildThreadComposeRenderDepsFragment(),
    ...buildThreadAiRenderDepsFragment(),
  };
}
