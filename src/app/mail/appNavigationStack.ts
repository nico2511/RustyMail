/** Re-exports for app navigation stack (split modules). */
export {
  registerAppNavigationStackDeps,
  type AppNavigationStackDeps,
} from "./appNavigationStackContext";
export { captureCurrentNav, beginNavigation } from "./appNavigationSnapshotRun";
export {
  goBack,
  goForward,
  navigateToInbox,
  navigateToBreadcrumbIndex,
} from "./appNavigationHistoryRun";
