// @ts-nocheck
import { tryHandleComposeSettings } from "./handleActionComposeSettings";
import { tryHandleThreadCompose } from "./handleActionThreadCompose";
import { tryHandleOrgFolder } from "./handleActionOrgFolder";
import { tryHandleInboxSearch } from "./handleActionInboxSearch";

export async function handleAction(action: string, element?: HTMLElement): Promise<void> {
  if (await tryHandleComposeSettings(action, element)) return;
  if (await tryHandleThreadCompose(action, element)) return;
  if (await tryHandleOrgFolder(action, element)) return;
  await tryHandleInboxSearch(action, element);
}
