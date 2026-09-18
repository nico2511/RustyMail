import type { OrgApplyProgress, OrgScanReport } from "../../organizationView";
import { orgRetagAccount, orgScanAccount } from "../../organizationView";
import { currentAccount } from "../core/accountContext";
import { render } from "../dispatch";
import { state } from "../state";
import { toast } from "../lib/toast";
import { tauriErrorMessage } from "../lib/tauriCommand";
import { refreshOrganizationReport } from "./orgFolderWireActions";

export function tryHandleOrgV1ScanWire(action: string): boolean {
  switch (action) {
    case "org-scan": {
      const acc = currentAccount();
      if (!acc?.id) return true;
      state.organization.scanning = true;
      state.organization.applyMessage = "Analyse de la boîte (structure, propositions)…";
      render();
      void orgScanAccount(acc.id, Boolean(state.appPrefs.ai.featureOrgProposalsEnabled))
        .then((report: OrgScanReport) => {
          state.organization.report = report;
          state.organization.scanning = false;
          state.organization.applyMessage = `${report.proposals.length} proposition(s).`;
          render();
        })
        .catch((e: unknown) => {
          state.organization.scanning = false;
          state.organization.applyMessage = "";
          toast(tauriErrorMessage(e));
          render();
        });
      return true;
    }
    case "org-retag-all": {
      const acc = currentAccount();
      if (!acc?.id) return true;
      state.organization.applying = true;
      state.organization.applyMessage = "Normalisation des tags en cours…";
      toast("Recalcul des tags sur tout le compte…");
      render();
      void orgRetagAccount(acc.id, false)
        .then(async (p: OrgApplyProgress) => {
          state.organization.applying = false;
          state.organization.applyMessage = p.message;
          toast(p.message);
          await refreshOrganizationReport();
          render();
        })
        .catch((e: unknown) => {
          state.organization.applying = false;
          state.organization.applyMessage = "";
          toast(tauriErrorMessage(e));
          render();
        });
      return true;
    }
    default:
      return false;
  }
}
