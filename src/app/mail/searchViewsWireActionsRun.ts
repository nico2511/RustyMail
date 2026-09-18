import { tryHandleSearchViewsClearFiltersWire, tryHandleSearchViewsListWire } from "./searchViewsClearFiltersWireActionsRun";
import { tryHandleSearchViewsSavedWire } from "./searchViewsSavedWireActionsRun";

export async function tryHandleSearchViewsWire(action: string, element?: HTMLElement): Promise<boolean> {
  if (await tryHandleSearchViewsSavedWire(action, element)) return true;
  if (await tryHandleSearchViewsClearFiltersWire(action, element)) return true;
  return tryHandleSearchViewsListWire(action);
}
