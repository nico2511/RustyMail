// @ts-nocheck
import {
  app,
  state,
  toast,
  invoke,
  t,
  isTauriRuntime,
  MAIL_ACTION_TIMEOUT_MS,
  BOOT_INVOKE_TIMEOUT_MS,
  OAUTH_DESKTOP_LOGIN_TIMEOUT_MS,
  openConfirmModal,
  finishConfirmModal,
  finishTextPromptModal,
  accountFieldTouched,
  setAllAiFeatures,
  normalizeAiPrefsMerged,
  navCanGoBack,
  composeRewriteStyleFromTone,
  mailboxDigestSlotInList,
  dismissMailboxDigestPanel,
  enqueueMailboxDigestRefreshWhenIdle,
  ipcThrottleMs,
  clearSuggestionShownKeys,
  setLocale,
  isSavedDraftsVirtualMailbox,
  captureAiPrefsFieldsFromDom,
  syncLlmEnginePrefsToDom,
  applyEngineConnectionMode,
  normalizeSettingsAiModalId,
  defaultEnabledSkillIds,
  invalidateIdleAiCachePrefetch,
  scheduleIdleAiCachePrefetch,
  loadContactsList,
  isContactsListLoading,
  contactsListHasMore,
  getContactDetail,
  getContactsKeywordDraft,
  setContactsKeywordDraft,
  loadContactDetail,
  loadContactProfile,
  isAiFeatureEnabled,
  markThreadsRecentlyRemoved,
  clearThreadsRecentlyRemoved,
  mailboxKind,
  threadMailboxListLabel,
  saveFolderTreeExpanded,
  setMailboxLocked,
  orgV2ScanAccount,
  orgUndoLast,
  orgScanAccount,
  orgRetagAccount,
  safeInvoke,
  setSkipAccountIdentityCaptureOnce,
  setAddressBookEditEmail,
  addressBookRowsCache,
  DEFAULT_ACCOUNT_PROMPT_DISMISS_KEY,
  LIST_FILTER_VALUES,
  ENABLE_CLEAN_MESSAGE_VIEW,
  type OAuthDesktopLoginOutcome,
  type Draft,
  type Tone,
  type PromptCatalogItem,
  type AssistMode,
  type AssistSkillId,
  type State,
} from "./deps";

export async function tryHandleOrgFolder(action: string, element?: HTMLElement): Promise<boolean> {
  switch (action) {
    case "open-contacts-view":
      void (app()["openContactsView"] as (...a: unknown[]) => unknown)();
      return true;
    case "open-organization-view":
      void (app()["openOrganizationView"] as (...a: unknown[]) => unknown)();
      return true;
    case "open-organization-v2-view":
      void (app()["openOrganizationV2View"] as (...a: unknown[]) => unknown)();
      return true;
    case "open-folder-manager-view":
      state.mailboxManageOpen = false;
      void (app()["openFolderManagerView"] as (...a: unknown[]) => unknown)();
      return true;
    case "fm-refresh":
      void (app()["refreshFolderManagerTree"] as (...a: unknown[]) => unknown)();
      return true;
    case "fm-create-root":
      void (app()["fmCreateMailbox"] as (...a: unknown[]) => unknown)();
      return true;
    case "fm-create-child": {
      const parent = element?.dataset.mailbox?.trim();
      if (parent) void (app()["fmCreateMailbox"] as (...a: unknown[]) => unknown)(parent);
      return true;
    }
    case "fm-select": {
      const mb = element?.dataset.mailbox?.trim();
      if (mb) void (app()["fmSelectMailbox"] as (...a: unknown[]) => unknown)(mb);
      return true;
    }
    case "fm-sync": {
      const mb = element?.dataset.mailbox?.trim();
      if (mb) void (app()["fmSyncMailbox"] as (...a: unknown[]) => unknown)(mb);
      return true;
    }
    case "fm-archive": {
      const mb = element?.dataset.mailbox?.trim();
      if (!mb) return true;
      state.folderManager.pendingArchiveMailbox = mb;
      state.folderManager.archiveRemember = (state.folderManager.report?.autoArchiveMailboxes ?? []).some(
        (m) => m.toLowerCase() === mb.toLowerCase(),
      );
      state.folderManager.archiveConfirmOpen = true;
      (app()["render"] as (...a: unknown[]) => unknown)();
      return true;
    }
    case "fm-archive-cancel":
      state.folderManager.archiveConfirmOpen = false;
      state.folderManager.pendingArchiveMailbox = null;
      (app()["render"] as (...a: unknown[]) => unknown)();
      return true;
    case "fm-archive-remember-toggle":
      state.folderManager.archiveRemember = Boolean(
        document.querySelector<HTMLInputElement>("#fm-archive-remember")?.checked,
      );
      return true;
    case "fm-archive-confirm":
      void (app()["fmConfirmArchiveMailbox"] as (...a: unknown[]) => unknown)();
      return true;
    case "fm-delete": {
      const mb = element?.dataset.mailbox?.trim();
      if (!mb) return true;
      state.folderManager.pendingDeleteMailbox = mb;
      state.folderManager.deleteConfirmOpen = true;
      state.folderManager.deleteConfirmChecked = false;
      (app()["render"] as (...a: unknown[]) => unknown)();
      return true;
    }
    case "fm-delete-cancel":
      state.folderManager.deleteConfirmOpen = false;
      state.folderManager.pendingDeleteMailbox = null;
      state.folderManager.deleteConfirmChecked = false;
      (app()["render"] as (...a: unknown[]) => unknown)();
      return true;
    case "fm-delete-check-toggle":
      state.folderManager.deleteConfirmChecked = Boolean(
        document.querySelector<HTMLInputElement>("#fm-delete-check")?.checked,
      );
      (app()["render"] as (...a: unknown[]) => unknown)();
      return true;
    case "fm-delete-confirm":
      void (app()["fmConfirmDeleteMailbox"] as (...a: unknown[]) => unknown)();
      return true;
    case "fm-toggle-lock": {
      const acc = (app()["currentAccount"] as (...a: unknown[]) => unknown)();
      const mb = element?.dataset.mailbox?.trim();
      if (!acc?.id || !mb) return true;
      const locked = element?.dataset.locked === "1";
      void setMailboxLocked(acc.id, mb, !locked)
        .then(async (list) => {
          if (state.folderManager.report) state.folderManager.report.lockedMailboxes = list;
          (app()["render"] as (...a: unknown[]) => unknown)();
        })
        .catch((e) => toast((app()["tauriErrorMessage"] as (...a: unknown[]) => unknown)(e)));
      return true;
    }
    case "fm-toggle-node": {
      const key = element?.dataset.nodeKey?.trim();
      if (!key) return true;
      const cur = state.folderManager.expandedNodes[key];
      state.folderManager.expandedNodes[key] = cur === true ? false : true;
      saveFolderTreeExpanded(state.folderManager.expandedNodes);
      (app()["render"] as (...a: unknown[]) => unknown)();
      return true;
    }
    case "fm-open-inbox": {
      const mb = element?.dataset.mailbox?.trim();
      if (mb) void (app()["openOrganizationMailbox"] as (...a: unknown[]) => unknown)(mb);
      return true;
    }
    case "org-v2-scan": {
      const acc = (app()["currentAccount"] as (...a: unknown[]) => unknown)();
      if (!acc?.id) return true;
      state.organizationV2.scanning = true;
      state.organizationV2.applyMessage = "Analyse…";
      (app()["render"] as (...a: unknown[]) => unknown)();
      const includeLlm = Boolean(state.appPrefs.ai.featureOrgProposalsEnabled);
      void orgV2ScanAccount(acc.id, includeLlm)
        .then((report) => {
          state.organizationV2.report = report;
          state.organizationV2.scanning = false;
          state.organizationV2.applyMessage = `${report.proposals.length} action(s).`;
          (app()["render"] as (...a: unknown[]) => unknown)();
        })
        .catch((e) => {
          state.organizationV2.scanning = false;
          state.organizationV2.applyMessage = "";
          toast((app()["tauriErrorMessage"] as (...a: unknown[]) => unknown)(e));
          (app()["render"] as (...a: unknown[]) => unknown)();
        });
      return true;
    }
    case "org-v2-undo": {
      const accUndo = (app()["currentAccount"] as (...a: unknown[]) => unknown)();
      if (!accUndo?.id) return true;
      state.organizationV2.applying = true;
      state.organizationV2.applyMessage = "Annulation…";
      (app()["render"] as (...a: unknown[]) => unknown)();
      void orgUndoLast(accUndo.id)
        .then((p) => {
          state.organizationV2.applying = false;
          state.organizationV2.applyMessage = p.message || "Lot annulé.";
          toast(state.organizationV2.applyMessage);
          (app()["render"] as (...a: unknown[]) => unknown)();
        })
        .catch((e) => {
          state.organizationV2.applying = false;
          state.organizationV2.applyMessage = "";
          toast((app()["tauriErrorMessage"] as (...a: unknown[]) => unknown)(e));
          (app()["render"] as (...a: unknown[]) => unknown)();
        });
      return true;
    }
    case "org-v2-dismiss": {
      const pid = element?.dataset.proposalId?.trim();
      if (pid) void (app()["orgV2DismissProposal"] as (...a: unknown[]) => unknown)(pid);
      return true;
    }
    case "org-v2-snooze": {
      const pid = element?.dataset.proposalId?.trim();
      if (pid) void (app()["orgV2SnoozeProposal"] as (...a: unknown[]) => unknown)(pid);
      return true;
    }
    case "org-v2-apply": {
      const acc = (app()["currentAccount"] as (...a: unknown[]) => unknown)();
      const proposalId = element?.dataset.proposalId?.trim();
      if (!acc?.id || !proposalId) return true;
      if (element?.dataset.trash === "1") {
        state.organizationV2.trashConfirmOpen = true;
        state.organizationV2.pendingTrashProposalId = proposalId;
        state.organizationV2.pendingTrashActionOverride = null;
        (app()["render"] as (...a: unknown[]) => unknown)();
        return;
      }
      if (element?.dataset.deleteMailbox === "1") {
        state.organizationV2.deleteMailboxConfirmOpen = true;
        state.organizationV2.pendingDeleteMailboxProposalId = proposalId;
        (app()["render"] as (...a: unknown[]) => unknown)();
        return;
      }
      const applyProposal = state.organizationV2.report?.proposals.find((p) => p.id === proposalId);
      if (!applyProposal) {
        toast("Proposition introuvable — relancez l’analyse.");
        return true;
      }
      void (app()["confirmThenRunOrgV2Apply"] as (...a: unknown[]) => unknown)(acc.id, proposalId);
      return true;
    }
    case "org-v2-cancel-apply":
      if (state.organizationV2.applying) {
        state.organizationV2.applyCancelRequested = true;
        state.organizationV2.applyMessage = "Arrêt demandé…";
        (app()["render"] as (...a: unknown[]) => unknown)();
      }
      return true;
    case "org-v2-trash-cancel":
      state.organizationV2.trashConfirmOpen = false;
      state.organizationV2.pendingTrashProposalId = null;
      state.organizationV2.pendingTrashActionOverride = null;
      (app()["render"] as (...a: unknown[]) => unknown)();
      return true;
    case "org-v2-trash-confirm": {
      const acc = (app()["currentAccount"] as (...a: unknown[]) => unknown)();
      const pid = state.organizationV2.pendingTrashProposalId;
      if (!acc?.id || !pid) return true;
      const override = state.organizationV2.pendingTrashActionOverride;
      state.organizationV2.trashConfirmOpen = false;
      state.organizationV2.pendingTrashProposalId = null;
      state.organizationV2.pendingTrashActionOverride = null;
      (app()["render"] as (...a: unknown[]) => unknown)();
      const trashProposal = state.organizationV2.report?.proposals.find((p) => p.id === pid);
      if (!trashProposal) {
        toast("Proposition introuvable — relancez l’analyse.");
        return true;
      }
      void (app()["runOrgV2Apply"] as (...a: unknown[]) => unknown)(acc.id, trashProposal, "bulk-trash-org", override ?? undefined);
      return true;
    }
    case "org-v2-delete-mailbox-cancel":
      state.organizationV2.deleteMailboxConfirmOpen = false;
      state.organizationV2.pendingDeleteMailboxProposalId = null;
      (app()["render"] as (...a: unknown[]) => unknown)();
      return true;
    case "org-v2-delete-mailbox-confirm": {
      const acc = (app()["currentAccount"] as (...a: unknown[]) => unknown)();
      const pid = state.organizationV2.pendingDeleteMailboxProposalId;
      if (!acc?.id || !pid) return true;
      state.organizationV2.deleteMailboxConfirmOpen = false;
      state.organizationV2.pendingDeleteMailboxProposalId = null;
      (app()["render"] as (...a: unknown[]) => unknown)();
      const delMbProposal = state.organizationV2.report?.proposals.find((p) => p.id === pid);
      if (!delMbProposal) {
        toast("Proposition introuvable — relancez l’analyse.");
        return true;
      }
      void (app()["runOrgV2Apply"] as (...a: unknown[]) => unknown)(acc.id, delMbProposal, undefined, undefined, "delete-mailbox");
      return true;
    }
    case "org-v2-ignore-mailbox":
    case "org-v2-unignore-mailbox":
      return true;
    case "org-scan": {
      const acc = (app()["currentAccount"] as (...a: unknown[]) => unknown)();
      if (!acc?.id) return true;
      state.organization.scanning = true;
      state.organization.applyMessage = "Analyse de la boîte (structure, propositions)…";
      (app()["render"] as (...a: unknown[]) => unknown)();
      void orgScanAccount(acc.id, Boolean(state.appPrefs.ai.featureOrgProposalsEnabled))
        .then((report) => {
          state.organization.report = report;
          state.organization.scanning = false;
          state.organization.applyMessage = `${report.proposals.length} proposition(s).`;
          (app()["render"] as (...a: unknown[]) => unknown)();
        })
        .catch((e) => {
          state.organization.scanning = false;
          state.organization.applyMessage = "";
          toast((app()["tauriErrorMessage"] as (...a: unknown[]) => unknown)(e));
          (app()["render"] as (...a: unknown[]) => unknown)();
        });
      return true;
    }
    case "org-open-mailbox": {
      const mb = element?.dataset.mailbox?.trim();
      if (mb) void (app()["openOrganizationMailbox"] as (...a: unknown[]) => unknown)(mb);
      return true;
    }
    case "org-sync-mailbox":
    case "org-delete-mailbox-one":
      return true;
    case "org-apply-trash": {
      const acc = (app()["currentAccount"] as (...a: unknown[]) => unknown)();
      const proposalId = element?.dataset.proposalId?.trim();
      if (!acc?.id || !proposalId) return true;
      state.organization.trashConfirmOpen = true;
      state.organization.pendingTrashProposalId = proposalId;
      state.organization.pendingTrashActionOverride = "trash";
      (app()["render"] as (...a: unknown[]) => unknown)();
      return true;
    }
    case "org-apply-archive": {
      const acc = (app()["currentAccount"] as (...a: unknown[]) => unknown)();
      const proposalId = element?.dataset.proposalId?.trim();
      if (!acc?.id || !proposalId) return true;
      void (app()["confirmThenRunOrgApply"] as (...a: unknown[]) => unknown)(acc.id, proposalId, undefined, "archive");
      return true;
    }
    case "org-apply": {
      const acc = (app()["currentAccount"] as (...a: unknown[]) => unknown)();
      const proposalId = element?.dataset.proposalId?.trim();
      if (!acc?.id || !proposalId) return true;
      const isTrash = element?.dataset.trash === "1";
      if (isTrash) {
        state.organization.trashConfirmOpen = true;
        state.organization.pendingTrashProposalId = proposalId;
        state.organization.pendingTrashActionOverride = null;
        (app()["render"] as (...a: unknown[]) => unknown)();
        return;
      }
      if (element?.dataset.deleteMailbox === "1") {
        state.organization.deleteMailboxConfirmOpen = true;
        state.organization.pendingDeleteMailboxProposalId = proposalId;
        (app()["render"] as (...a: unknown[]) => unknown)();
        return;
      }
      void (app()["confirmThenRunOrgApply"] as (...a: unknown[]) => unknown)(acc.id, proposalId);
      return true;
    }
    case "org-trash-cancel":
      state.organization.trashConfirmOpen = false;
      state.organization.pendingTrashProposalId = null;
      state.organization.pendingTrashActionOverride = null;
      (app()["render"] as (...a: unknown[]) => unknown)();
      return true;
    case "org-trash-confirm": {
      const acc = (app()["currentAccount"] as (...a: unknown[]) => unknown)();
      const pid = state.organization.pendingTrashProposalId;
      if (!acc?.id || !pid) return true;
      const override = state.organization.pendingTrashActionOverride;
      state.organization.trashConfirmOpen = false;
      state.organization.pendingTrashProposalId = null;
      state.organization.pendingTrashActionOverride = null;
      (app()["render"] as (...a: unknown[]) => unknown)();
      void (app()["runOrgApply"] as (...a: unknown[]) => unknown)(acc.id, pid, "bulk-trash-org", override ?? undefined);
      return true;
    }
    case "org-delete-mailbox-cancel":
      state.organization.deleteMailboxConfirmOpen = false;
      state.organization.pendingDeleteMailboxProposalId = null;
      (app()["render"] as (...a: unknown[]) => unknown)();
      return true;
    case "org-delete-mailbox-confirm": {
      const acc = (app()["currentAccount"] as (...a: unknown[]) => unknown)();
      const pid = state.organization.pendingDeleteMailboxProposalId;
      if (!acc?.id || !pid) return true;
      state.organization.deleteMailboxConfirmOpen = false;
      state.organization.pendingDeleteMailboxProposalId = null;
      (app()["render"] as (...a: unknown[]) => unknown)();
      void (app()["runOrgApply"] as (...a: unknown[]) => unknown)(acc.id, pid, undefined, undefined, "delete-mailbox");
      return true;
    }
    case "org-retag-all": {
      const acc = (app()["currentAccount"] as (...a: unknown[]) => unknown)();
      if (!acc?.id) return true;
      state.organization.applying = true;
      state.organization.applyMessage = "Normalisation des tags en cours…";
      toast("Recalcul des tags sur tout le compte…");
      (app()["render"] as (...a: unknown[]) => unknown)();
      void orgRetagAccount(acc.id, false)
        .then(async (p) => {
          state.organization.applying = false;
          state.organization.applyMessage = p.message;
          toast(p.message);
          await (app()["refreshOrganizationReport"] as (...a: unknown[]) => unknown)();
          (app()["render"] as (...a: unknown[]) => unknown)();
        })
        .catch((e) => {
          state.organization.applying = false;
          state.organization.applyMessage = "";
          toast((app()["tauriErrorMessage"] as (...a: unknown[]) => unknown)(e));
          (app()["render"] as (...a: unknown[]) => unknown)();
        });
      return true;
    }
    default:
      return false;
  }
}