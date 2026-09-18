import { tryHandleComposeEditorAiWire } from "./composeEditorAiWireRun";
import { tryHandleComposeEditorAttachmentsWire } from "./composeEditorAttachmentsWireRun";
import { tryHandleComposeEditorLayoutWire } from "./composeEditorLayoutWireRun";
import { tryHandleComposeEditorSendWire } from "./composeEditorSendWireRun";

export async function tryHandleComposeEditorWire(action: string, element?: HTMLElement): Promise<boolean> {
  if (await tryHandleComposeEditorLayoutWire(action, element)) return true;
  if (await tryHandleComposeEditorSendWire(action)) return true;
  if (await tryHandleComposeEditorAttachmentsWire(action, element)) return true;
  if (await tryHandleComposeEditorAiWire(action, element)) return true;
  return false;
}
