import { tryHandleOrgV2ConfirmWire } from "./orgV2WireConfirmRun";
import { tryHandleOrgV2ProposalWire } from "./orgV2WireProposalRun";
import { tryHandleOrgV2ScanUndoWire } from "./orgV2WireScanUndoRun";

export function tryHandleOrgV2Wire(action: string, element?: HTMLElement): boolean {
  if (tryHandleOrgV2ScanUndoWire(action)) return true;
  if (tryHandleOrgV2ProposalWire(action, element)) return true;
  if (tryHandleOrgV2ConfirmWire(action)) return true;
  if (action === "org-v2-ignore-mailbox" || action === "org-v2-unignore-mailbox") return true;
  return false;
}
