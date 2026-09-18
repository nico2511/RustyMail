import { dismissMailboxDigestPanel } from "./mailboxDigest";

export async function tryHandleSearchViewsListDigestWire(action: string): Promise<boolean> {
  if (action !== "clear-mailbox-digest" && action !== "dismiss-mailbox-digest") return false;
  dismissMailboxDigestPanel();
  return true;
}
