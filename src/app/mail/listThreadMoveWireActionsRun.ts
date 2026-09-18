import { tryHandleListThreadMoveActionsWire } from "./listThreadMoveActionsWireRun";
import { tryHandleListThreadMetaWire } from "./listThreadMetaWireRun";

export async function tryHandleListThreadMoveWire(action: string, element?: HTMLElement): Promise<boolean> {
  if (await tryHandleListThreadMoveActionsWire(action)) return true;
  return tryHandleListThreadMetaWire(action, element);
}
