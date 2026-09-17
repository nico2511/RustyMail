import type { MicActionOpts } from "../types";
import { saveAccount as saveAccountImpl } from "./accountSettingsRun";
import { saveDraftToSavedListNow as saveDraftToSavedListNowImpl } from "./composeDraftLocalSave";
import { micAction as micActionImpl } from "./composeMicDictation";
import { refreshSavedDraftsMailboxCount as refreshSavedDraftsMailboxCountImpl } from "./savedDraftsMailboxCountRefresh";

export function micAction(opts?: MicActionOpts): void | Promise<void> {
  return micActionImpl(opts);
}

export function saveAccount(): void | Promise<void> {
  return saveAccountImpl();
}

export function saveDraftToSavedListNow(opts?: { silentToast?: boolean }): Promise<boolean> {
  return saveDraftToSavedListNowImpl(opts);
}

export function refreshSavedDraftsMailboxCount(): Promise<void> {
  return refreshSavedDraftsMailboxCountImpl();
}
