import { tryHandleComposeCloseWire } from "./composeCloseWireActionsRun";
import { tryHandleComposeDraftHistoryWire } from "./composeDraftHistoryWireActionsRun";
import { tryHandleComposeEditorWire } from "./composeEditorWireActionsRun";

export async function tryHandleComposeWire(action: string, element?: HTMLElement): Promise<boolean> {
  if (await tryHandleComposeCloseWire(action, element)) return true;
  if (await tryHandleComposeDraftHistoryWire(action, element)) return true;
  if (await tryHandleComposeEditorWire(action, element)) return true;
  return false;
}
