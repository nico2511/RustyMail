import { tryHandleComposeCloseWire } from "./handleActionComposeCloseWireRun";
import { tryHandleComposeDraftHistoryWire } from "./handleActionComposeDraftHistoryWireRun";
import { tryHandleComposeEditorWire } from "./handleActionComposeEditorWireRun";

export async function tryHandleComposeWire(action: string, element?: HTMLElement): Promise<boolean> {
  if (await tryHandleComposeCloseWire(action, element)) return true;
  if (await tryHandleComposeDraftHistoryWire(action, element)) return true;
  if (await tryHandleComposeEditorWire(action, element)) return true;
  return false;
}
