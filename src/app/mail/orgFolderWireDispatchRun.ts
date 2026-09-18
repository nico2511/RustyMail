import { tryHandleFolderManagerWire } from "./folderManagerWireActionsRun";
import { tryHandleOrgFolderNav } from "./orgFolderNavWireActionsRun";
import { tryHandleOrgV1Wire } from "./orgV1WireActionsRun";
import { tryHandleOrgV2Wire } from "./orgV2WireActionsRun";

export async function tryHandleOrgFolder(action: string, element?: HTMLElement): Promise<boolean> {
  if (tryHandleOrgFolderNav(action)) return true;
  if (tryHandleFolderManagerWire(action, element)) return true;
  if (tryHandleOrgV2Wire(action, element)) return true;
  if (tryHandleOrgV1Wire(action, element)) return true;
  return false;
}
