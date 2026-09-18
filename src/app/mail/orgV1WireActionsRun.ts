import { tryHandleOrgV1ApplyWire } from "./orgV1WireApplyRun";
import { tryHandleOrgV1ConfirmWire } from "./orgV1WireConfirmRun";
import { tryHandleOrgV1ScanWire } from "./orgV1WireScanRun";

export function tryHandleOrgV1Wire(action: string, element?: HTMLElement): boolean {
  if (tryHandleOrgV1ScanWire(action)) return true;
  if (tryHandleOrgV1ApplyWire(action, element)) return true;
  return tryHandleOrgV1ConfirmWire(action);
}
