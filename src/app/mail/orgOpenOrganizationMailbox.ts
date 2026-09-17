import { render } from "../dispatch";
import { state } from "../state";
import { beginNavigation } from "./appNavigationStack";
import { exitSearchModeForMailboxBrowse } from "./searchMailboxBrowseExit";
import { switchMailbox } from "./switchMailboxAction";

export async function openOrganizationMailbox(mailbox: string): Promise<void> {
  const mb = mailbox.trim();
  if (!mb) return;
  beginNavigation("list");
  state.view = "list";
  state.selectedContactEmail = undefined;
  exitSearchModeForMailboxBrowse();
  await switchMailbox(mb);
  render();
}
