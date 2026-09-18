import { tryHandleSearchViewsClearFiltersCriteriaWire } from "./searchViewsClearFiltersCriteriaRun";
import { tryHandleSearchViewsClearFiltersScopeWire } from "./searchViewsClearFiltersScopeRun";
import { tryHandleSearchViewsClearFiltersTextWire } from "./searchViewsClearFiltersTextRun";

export async function tryHandleSearchViewsClearFiltersWire(
  action: string,
  element?: HTMLElement,
): Promise<boolean> {
  if (await tryHandleSearchViewsClearFiltersTextWire(action)) return true;
  if (await tryHandleSearchViewsClearFiltersCriteriaWire(action, element)) return true;
  if (await tryHandleSearchViewsClearFiltersScopeWire(action)) return true;
  return false;
}
