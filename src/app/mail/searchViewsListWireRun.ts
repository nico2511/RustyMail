import { tryHandleSearchViewsListDigestWire } from "./searchViewsListDigestWireRun";
import { tryHandleSearchViewsListFilterWire, tryHandleSearchViewsListLoadWire } from "./searchViewsListFilterWireRun";

export async function tryHandleSearchViewsListWire(action: string): Promise<boolean> {
  if (await tryHandleSearchViewsListLoadWire(action)) return true;
  if (await tryHandleSearchViewsListFilterWire(action)) return true;
  if (await tryHandleSearchViewsListDigestWire(action)) return true;
  return false;
}
