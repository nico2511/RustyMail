/** Account, settings, org/folder navigation wire deps */
import { openContactDetailView } from "./addressBookWireActions";
import { registerAppNavigationStackDeps } from "./appNavigationStack";
import { fmSelectMailbox, refreshFolderManagerTree } from "./orgFolderWireActions";
import { registerFolderManagerRunDeps } from "./folderManagerActions";
import {
  loadMailView,
  loadMailboxUnread,
} from "./mailListView";
import { openThread } from "./openThreadView";
import { registerOrgApplyRunDeps } from "./orgApplyRun";
import { registerOrgV2ApplyRunDeps } from "./orgV2ApplyRun";
import { refreshSavedDraftsMailboxCount } from "./savedDraftsMailboxCountRefresh";
import { refreshSavedSearches, refreshSuggestedSavedViews } from "./savedSearchViews";
import { registerSettingsWireActionsDeps } from "./settingsWireActions";
import { syncActivityRecordingPrefs } from "./threadActivityTracking";
import { registerSwitchActiveAccountDeps } from "./switchActiveAccountAction";

export { registerAppBackgroundServices } from "./appAccountOrgWireRegistryBackgroundRun";

export function registerAppAccountOrgWireDeps(): void {
  registerSettingsWireActionsDeps({
    syncActivityRecordingPrefs,
  });

  registerFolderManagerRunDeps({ loadMailView });
  registerOrgApplyRunDeps({ loadMailView });
  registerOrgV2ApplyRunDeps({ loadMailView });

  registerSwitchActiveAccountDeps({
    loadMailView,
    loadMailboxUnread,
    refreshSavedDraftsMailboxCount,
    refreshSavedSearches,
    refreshSuggestedSavedViews,
  });

  registerAppNavigationStackDeps({
    openThread,
    openContactDetailView,
    fmSelectMailbox,
    refreshFolderManagerTree,
  });
}
