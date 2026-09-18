import { tryHandleListThreadMailboxWire } from "./listThreadMailboxWireActionsRun";
import { tryHandleListThreadMoveWire } from "./listThreadMoveWireActionsRun";
import { tryHandleListThreadQuickWire } from "./listThreadQuickWireActionsRun";
import { tryHandleListThreadSavedDraftWire } from "./listThreadSavedDraftWireActionsRun";

export async function tryHandleListThreadWire(action: string, element?: HTMLElement): Promise<boolean> {
  if (await tryHandleListThreadQuickWire(action, element)) return true;
  if (await tryHandleListThreadMoveWire(action, element)) return true;
  if (await tryHandleListThreadMailboxWire(action)) return true;
  return tryHandleListThreadSavedDraftWire(action, element);
}
