import { threadMailboxListLabel } from "../../mailboxKinds";
import {
  optimisticOrgV2RemoveProposal,
  orgV2IgnoreMailbox,
  orgV2RecordDecision,
  orgV2UnignoreMailbox,
} from "../../organizationViewV2";
import { render } from "../dispatch";
import { currentAccount } from "../core/accountContext";
import { tauriErrorMessage } from "../lib/tauriCommand";
import { toast } from "../lib/toast";
import { state } from "../state";
import { refreshOrganizationV2Report } from "./orgOrganizationReportRefresh";

export async function onOrgV2IgnoreMailboxUi(mailbox: string): Promise<void> {
  const acc = currentAccount();
  const mb = mailbox.trim();
  if (!acc?.id || !mb) return;
  try {
    await orgV2IgnoreMailbox(acc.id, mb);
    if (state.organizationV2.report) {
      const mem = state.organizationV2.report.memory;
      const ignored = new Set(mem.ignoredMailboxes);
      ignored.add(mb);
      state.organizationV2.report = {
        ...state.organizationV2.report,
        memory: { ...mem, ignoredMailboxes: [...ignored] },
      };
      state.organizationV2.applyMessage = `Dossier « ${threadMailboxListLabel(mb).label} » exclu de l’analyse.`;
    }
    toast(`« ${threadMailboxListLabel(mb).label} » exclu de l’analyse.`);
    render();
    void refreshOrganizationV2Report();
  } catch (e) {
    toast(tauriErrorMessage(e));
  }
}

export async function onOrgV2UnignoreMailboxUi(mailbox: string): Promise<void> {
  const acc = currentAccount();
  const mb = mailbox.trim();
  if (!acc?.id || !mb) return;
  try {
    await orgV2UnignoreMailbox(acc.id, mb);
    if (state.organizationV2.report) {
      const mem = state.organizationV2.report.memory;
      state.organizationV2.report = {
        ...state.organizationV2.report,
        memory: {
          ...mem,
          ignoredMailboxes: mem.ignoredMailboxes.filter((x) => x !== mb),
        },
      };
      state.organizationV2.applyMessage = `Dossier « ${threadMailboxListLabel(mb).label} » réintégré.`;
    }
    toast(`« ${threadMailboxListLabel(mb).label} » réintégré dans l’analyse.`);
    render();
    void refreshOrganizationV2Report();
  } catch (e) {
    toast(tauriErrorMessage(e));
  }
}

export async function orgV2DismissProposal(proposalId: string): Promise<void> {
  const acc = currentAccount();
  if (!acc?.id) return;
  const proposal = state.organizationV2.report?.proposals.find((p) => p.id === proposalId);
  if (!proposal) return;
  try {
    await orgV2RecordDecision(acc.id, proposal, "dismissed");
    if (state.organizationV2.report) {
      state.organizationV2.report = optimisticOrgV2RemoveProposal(state.organizationV2.report, proposalId);
    }
    state.organizationV2.applyMessage = "Proposition ignorée (mémorisée).";
    toast("Ignorée — ne reviendra pas pour ce lot.");
  } catch (e) {
    toast(tauriErrorMessage(e));
  }
  render();
}

export async function orgV2SnoozeProposal(proposalId: string): Promise<void> {
  const acc = currentAccount();
  if (!acc?.id) return;
  const proposal = state.organizationV2.report?.proposals.find((p) => p.id === proposalId);
  if (!proposal) return;
  try {
    await orgV2RecordDecision(acc.id, proposal, "snoozed", 7);
    if (state.organizationV2.report) {
      state.organizationV2.report = optimisticOrgV2RemoveProposal(state.organizationV2.report, proposalId);
    }
    state.organizationV2.applyMessage = "Reportée 7 jours.";
    toast("Reportée 7 jours.");
  } catch (e) {
    toast(tauriErrorMessage(e));
  }
  render();
}
