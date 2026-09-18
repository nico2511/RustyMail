import type { OrgApplyProgress } from "../../organizationView";
import { orgUndoLast } from "../../organizationView";
import type { OrgV2ScanReport } from "../../organizationViewV2";
import { orgV2ScanAccount } from "../../organizationViewV2";
import { currentAccount } from "../core/accountContext";
import { render } from "../dispatch";
import { state } from "../state";
import { toast } from "../lib/toast";
import { tauriErrorMessage } from "../lib/tauriCommand";

export function tryHandleOrgV2ScanUndoWire(action: string): boolean {
  switch (action) {
    case "org-v2-scan": {
      const acc = currentAccount();
      if (!acc?.id) return true;
      state.organizationV2.scanning = true;
      state.organizationV2.applyMessage = "Analyse…";
      render();
      const includeLlm = Boolean(state.appPrefs.ai.featureOrgProposalsEnabled);
      void orgV2ScanAccount(acc.id, includeLlm)
        .then((report: OrgV2ScanReport) => {
          state.organizationV2.report = report;
          state.organizationV2.scanning = false;
          state.organizationV2.applyMessage = `${report.proposals.length} action(s).`;
          render();
        })
        .catch((e: unknown) => {
          state.organizationV2.scanning = false;
          state.organizationV2.applyMessage = "";
          toast(tauriErrorMessage(e));
          render();
        });
      return true;
    }
    case "org-v2-undo": {
      const accUndo = currentAccount();
      if (!accUndo?.id) return true;
      state.organizationV2.applying = true;
      state.organizationV2.applyMessage = "Annulation…";
      render();
      void orgUndoLast(accUndo.id)
        .then((p: OrgApplyProgress) => {
          state.organizationV2.applying = false;
          state.organizationV2.applyMessage = p.message || "Lot annulé.";
          toast(state.organizationV2.applyMessage);
          render();
        })
        .catch((e: unknown) => {
          state.organizationV2.applying = false;
          state.organizationV2.applyMessage = "";
          toast(tauriErrorMessage(e));
          render();
        });
      return true;
    }
    default:
      return false;
  }
}
