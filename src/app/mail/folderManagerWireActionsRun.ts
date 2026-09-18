import { tryHandleFolderManagerArchiveWire } from "./folderManagerWireArchiveRun";
import { tryHandleFolderManagerCrudWire } from "./folderManagerWireCrudRun";
import { tryHandleFolderManagerDeleteWire } from "./folderManagerWireDeleteRun";
import { tryHandleFolderManagerTreeWire } from "./folderManagerWireTreeRun";

export function tryHandleFolderManagerWire(action: string, element?: HTMLElement): boolean {
  if (tryHandleFolderManagerCrudWire(action, element)) return true;
  if (tryHandleFolderManagerArchiveWire(action, element)) return true;
  if (tryHandleFolderManagerDeleteWire(action, element)) return true;
  return tryHandleFolderManagerTreeWire(action, element);
}
