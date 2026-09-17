/** registerRenderDeps wiring — extracted from appModuleRegistry.ts */
import { escapeAttr, escapeHtml } from "../../ui/sanitize";
import { renderFolderManagerView } from "../../folderManagerView";
import { renderOrganizationView } from "../../organizationView";
import { renderOrganizationV2View } from "../../organizationViewV2";
import { threadMailboxListLabel } from "../../mailboxKinds";
import { renderContactDetailPage, renderContactsListPage } from "../../contactsView";
import { currentAccount } from "../core/accountContext";
import { iconSvg } from "../lib/iconSvg";
import { registerRenderDeps } from "../ui/render/renderDeps";
import { renderList } from "../ui/render/listRender";
import { renderOrgThreadSampleRow } from "../ui/render/orgSampleRowRender";
import { renderComposer } from "../ui/render/composerRender";
import { renderSettings } from "../ui/render/settingsRender";
import { renderThread } from "../ui/render/threadViewRender";
import { state } from "../state";
import { threadIdsMatch } from "../lib/threadIdsMatch";
import {
  getAddressBookListQuery,
  getAddressBookRowsCache,
} from "./addressBookListState";
import { getAddressBookEditEmail } from "./appShellRender";
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
import { formatThreadReadingWhen } from "./threadMessageSort";
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

export function registerAppRenderDeps(): void {
  registerRenderDeps({
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
    renderOrganizationPage: () =>
      renderOrganizationView(state.organization, {
        escapeHtml,
        escapeAttr,
        iconSvg: (name) => iconSvg(name as Parameters<typeof iconSvg>[0]),
        renderThreadSample: renderOrgThreadSampleRow,
        mailboxLabel: (mb) => threadMailboxListLabel(mb).label,
      }),
    renderOrganizationV2Page: () =>
      renderOrganizationV2View(state.organizationV2, {
        escapeHtml,
        escapeAttr,
        iconSvg: (name) => iconSvg(name as Parameters<typeof iconSvg>[0]),
        renderThreadSample: renderOrgThreadSampleRow,
        mailboxLabel: (mb) => threadMailboxListLabel(mb).label,
      }),
    renderFolderManagerPage: () =>
      renderFolderManagerView(state.folderManager, {
        escapeHtml,
        escapeAttr,
        iconSvg: (name) => iconSvg(name as Parameters<typeof iconSvg>[0]),
        mailboxLabel: (mb) => threadMailboxListLabel(mb).label,
        renderSearchFilters: () => renderList("filters-only"),
        renderListPanel: () => renderList("threads-only"),
      }),
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
  });
}
