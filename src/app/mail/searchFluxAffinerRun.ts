import { setSearchViewBatchJob } from "./searchViewBatchContext";
import { runFluxAffinerApplyImapMove } from "./searchFluxAffinerApplyRun";
import { runFluxAffinerSuggestAndConfirm } from "./searchFluxAffinerSuggestRun";

export async function runFluxAffinerFromSearchView(): Promise<void> {
  const ctx = await runFluxAffinerSuggestAndConfirm();
  if (!ctx) {
    setSearchViewBatchJob(null, false);
    return;
  }
  await runFluxAffinerApplyImapMove(ctx);
}
