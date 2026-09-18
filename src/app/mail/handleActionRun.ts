import { tryHandleComposeSettings } from "./composeSettingsWireDispatchRun";
import { tryHandleInboxSearch } from "./inboxSearchWireDispatchRun";
import { tryHandleOrgFolder } from "./orgFolderWireDispatchRun";
import { tryHandleThreadCompose } from "./threadComposeWireDispatchRun";

export async function handleAction(action: string, element?: HTMLElement): Promise<void> {
  if (await tryHandleComposeSettings(action, element)) return;
  if (await tryHandleThreadCompose(action, element)) return;
  if (await tryHandleOrgFolder(action, element)) return;
  await tryHandleInboxSearch(action, element);
}
