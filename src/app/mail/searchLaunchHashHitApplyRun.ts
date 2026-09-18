import type { InboxFilterHit } from "../../hashAutocomplete";
import { isSavedDraftsVirtualMailbox } from "../../mailboxKinds";
import { applyHashAutocompleteHitToState } from "./searchLaunchHashHitStateRun";
import { tryApplyHashHitListOrRule } from "./searchLaunchHashHitListRun";
import { tryApplyHashHitMailboxOrAccount } from "./searchLaunchHashHitMailboxRun";
import { tryApplyHashHitTagOrScope } from "./searchLaunchHashHitCriteriaRun";
import { state } from "../state";

export async function applyInboxFilterFromHashHit(hit: InboxFilterHit): Promise<void> {
  if (isSavedDraftsVirtualMailbox(state.selectedMailbox)) return;
  applyHashAutocompleteHitToState(hit);
  if (await tryApplyHashHitMailboxOrAccount(hit)) return;
  if (await tryApplyHashHitTagOrScope(hit)) return;
  await tryApplyHashHitListOrRule(hit);
}
