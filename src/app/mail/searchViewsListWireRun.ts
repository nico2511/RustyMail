import { tryHandleInboxAccountScopeWire } from "./inboxAccountScopeWire";
import { tryHandleSearchViewsListDigestWire } from "./searchViewsListDigestWireRun";
import { tryHandleSearchViewsListFilterWire, tryHandleSearchViewsListLoadWire } from "./searchViewsListFilterWireRun";

export async function tryHandleSearchViewsListWire(action: string, element?: HTMLElement): Promise<boolean> {
  if (await tryHandleSearchViewsListLoadWire(action)) return true;
  if (await tryHandleInboxAccountScopeWire(action, element)) return true;
  if (await tryHandleSearchViewsListFilterWire(action)) return true;
  if (await tryHandleSearchViewsListDigestWire(action)) return true;
  return false;
}
