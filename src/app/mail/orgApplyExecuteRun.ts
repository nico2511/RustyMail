import { optimisticPatchOrgReport, orgApplyProposal } from "../../organizationView";
import type { OrgActionOverride } from "../../organizationView";
import { render } from "../dispatch";
import { isTauriRuntime } from "../lib/tauriRuntime";
import { tauriErrorMessage } from "../lib/tauriCommand";
import { toast } from "../lib/toast";
import { state } from "../state";
import { orgApplyStatusMessage } from "./orgApplyStatusMessage";
import { refreshMailboxesAfterImapChange } from "./orgRefreshMailboxesAfterImap";
import { refreshOrganizationReport } from "./orgOrganizationReportRefresh";
import { requireOrgApplyRunDeps } from "./orgApplyRunContext";

export async function runOrgApply(
  accountId: string,
  proposalId: string,
  trashAck?: string,
  actionOverride?: OrgActionOverride | null,
  deleteMailboxAck?: string,
  threadIds?: string[] | null,
): Promise<void> {
  state.organization.applying = true;
  state.organization.applyMessage = orgApplyStatusMessage(proposalId, actionOverride);
  render();
  try {
    const proposal = state.organization.report?.proposals.find((p) => p.id === proposalId);
    if (!proposal) {
      toast("Proposition introuvable — relancez l’analyse du compte.");
      return;
    }
    const p = await orgApplyProposal(
      accountId,
      proposalId,
      proposal,
      trashAck,
      actionOverride,
      deleteMailboxAck,
      threadIds,
    );
    state.organization.applyMessage = p.message;
    toast(p.message);
    if (p.errors.length > 0) {
      toast(p.errors.slice(0, 2).join(" · "));
    }
    if (state.organization.report) {
      state.organization.report = optimisticPatchOrgReport(state.organization.report, proposalId, p);
    }
    render();
    const hadImapChange =
      p.done > 0 || (p.mailboxesToSync?.length ?? 0) > 0 || (p.threadsAffected?.length ?? 0) > 0;
    if (hadImapChange) {
      await refreshMailboxesAfterImapChange();
      if (state.view === "list" && isTauriRuntime()) {
        try {
          await requireOrgApplyRunDeps().loadMailView(false);
        } catch {
          /* liste courante au prochain affichage */
        }
      }
    }
    await refreshOrganizationReport();
  } catch (e) {
    toast(tauriErrorMessage(e));
  } finally {
    state.organization.applying = false;
    render();
  }
}
