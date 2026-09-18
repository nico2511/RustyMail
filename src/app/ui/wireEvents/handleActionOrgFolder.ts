import { tryHandleFolderManagerWire } from "./handleActionFolderManagerRun";
import { tryHandleOrgFolderNav } from "./handleActionOrgFolderNavRun";
import { tryHandleOrgV1Wire } from "./handleActionOrgV1WireRun";
import { tryHandleOrgV2Wire } from "./handleActionOrgV2WireRun";

export async function tryHandleOrgFolder(action: string, element?: HTMLElement): Promise<boolean> {
  if (tryHandleOrgFolderNav(action)) return true;
  if (tryHandleFolderManagerWire(action, element)) return true;
  if (tryHandleOrgV2Wire(action, element)) return true;
  if (tryHandleOrgV1Wire(action, element)) return true;
  return false;
}
