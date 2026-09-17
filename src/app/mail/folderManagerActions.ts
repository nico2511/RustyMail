/** Re-exports for folder manager (split modules). */
export { registerFolderManagerRunDeps, type FolderManagerRunDeps } from "./folderManagerContext";
export {
  refreshFolderManagerTree,
  fmSelectMailbox,
  openFolderManagerView,
} from "./folderManagerTreeRun";
export {
  fmSyncMailbox,
  fmCreateMailbox,
  fmRenameMailbox,
  fmMoveFolder,
} from "./folderManagerCrudRun";
export { fmConfirmArchiveMailbox, fmConfirmDeleteMailbox } from "./folderManagerConfirmRun";
