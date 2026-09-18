/** Assembles `RenderDeps` for registerRenderDeps (split from appRenderRegistry). */
import { renderContactDetailPage, renderContactsListPage } from "../../contactsView";
import { currentAccount } from "../core/accountContext";
import { threadIdsMatch } from "../lib/threadIdsMatch";
import type { RenderDeps } from "../ui/render/renderDeps";
import { renderComposer } from "../ui/render/composerRender";
import { renderList } from "../ui/render/listRender";
import { renderSettings } from "../ui/render/settingsRender";
import { renderThread } from "../ui/render/threadViewRender";
import {
  getAddressBookListQuery,
  getAddressBookRowsCache,
} from "./addressBookListState";
import { getAddressBookEditEmail } from "./appShellRender";
import {
  renderFolderManagerPageForState,
  renderOrganizationPageForState,
  renderOrganizationV2PageForState,
} from "./appRenderRegistryPagesRun";
import { attachmentPathsJoinedForHiddenField } from "./composeAttachmentPaths";
import { composeKindTitle, formatDraftRevisionStamp } from "./composeFormLabels";
import {
  composeMicButtonTitle,
  micAriaLabel,
  threadQaMicButtonTitle,
} from "./composeMicUiHints";
import { draftHasRecipientsExtra } from "./composeDraftRecipients";
import { folderManagerPanelMailbox } from "./mailboxPanelContext";
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
import { threadsVisibleInList, threadListFollowed } from "./mailListThreadFilter";
import { navCurrentBreadcrumbSegment } from "./navBreadcrumbSegments";
import {
  buildSettingsAiPanelDeps,
  mergedProfileForAccountsForm,
  settingsDraftProfile,
} from "./settingsRenderHelpers";
import { getAccountsFormIdentityScratch } from "./settingsAccountsFormState";
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
import { sourceMailboxForThread } from "./threadListActions";
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
import { effectiveSearchMailboxPath, isSearchActive } from "./searchQueryContext";
import { searchDraftDiffersFromCommitted } from "./searchCommitQuery";
import {
  activeSavedSearchItem,
  canSaveSearchView,
  canSaveSearchViewInModal,
  inboxSearchContextActive,
  searchViewCanAffinerFlux,
  searchViewCanOpenOrganizer,
} from "./searchViewContext";

export function buildAppRenderDeps(): RenderDeps {
  return {
    navCurrentBreadcrumbSegment,
    normalizeThreadSenderLabel,
    formatThreadReadingWhen,
    sortMessagesByReceivedDescending,
    effectiveSearchMailboxPath,
    inboxSearchContextActive,
    canSaveSearchView,
    canSaveSearchViewInModal,
    searchDraftDiffersFromCommitted,
    activeSavedSearchItem,
    searchViewCanOpenOrganizer,
    searchViewCanAffinerFlux,
    sourceMailboxForThread,
    currentAccount,
    activeMessageTranslationJobCount,
    activeSecurityLlmAugmentCount,
    renderThread,
    renderComposer,
    renderSettings,
    renderContactsListPage,
    renderContactDetailPage,
    renderOrganizationPage: renderOrganizationPageForState,
    renderOrganizationV2Page: renderOrganizationV2PageForState,
    renderFolderManagerPage: renderFolderManagerPageForState,
    renderList,
    threadsVisibleInList,
    isSearchActive,
    folderManagerPanelMailbox,
    threadParticipantsWithEmails,
    threadQuickReplyTargetName,
    threadParticipantFirstMessageIds,
    threadRecipientPresenceEventsByMessageId,
    threadAiSummaryShownInZen,
    threadIsAutoMail,
    threadListFollowed,
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
    settingsDraftProfile,
    mergedProfileForAccountsForm,
    buildSettingsAiPanelDeps,
    addressBookRowsCache: getAddressBookRowsCache,
    addressBookEditEmail: () => getAddressBookEditEmail(),
    addressBookListQuery: getAddressBookListQuery,
    accountsFormIdentityScratch: getAccountsFormIdentityScratch,
    threadQaMicButtonTitle,
    threadAiSummaryForCurrentThread,
    threadIdsMatch,
    agentStepProgressLabel,
    agentSkillEnabled,
    agentOfferSlotsStep,
    shouldOfferThreadTranslate,
  };
}
