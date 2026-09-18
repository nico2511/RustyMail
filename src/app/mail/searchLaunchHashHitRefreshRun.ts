import { render } from "../dispatch";
import { applySearchBarQuery, hasSearchBarCriteria, toastSearchBarResult } from "./searchCommitQuery";

export async function applySearchBarIfCriteriaAndRender(): Promise<void> {
  if (hasSearchBarCriteria()) {
    await applySearchBarQuery();
    toastSearchBarResult();
  }
  render();
}
