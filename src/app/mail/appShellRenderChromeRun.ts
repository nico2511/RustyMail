/** Post-render shell chrome — barrel (capture / scroll / focus). */
export { captureAccountsFormBeforeRender } from "./appShellRenderAccountsCaptureRun";
export {
  restoreScrollAfterRender,
  snapshotAppShellScroll,
  type AppShellScrollSnapshot,
} from "./appShellRenderScrollRestoreRun";
export { focusPromptsAfterRender } from "./appShellRenderFocusRun";
