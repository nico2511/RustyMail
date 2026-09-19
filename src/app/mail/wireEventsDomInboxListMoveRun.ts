// @ts-nocheck — DOM wiring; tighten types incrementally.
import { wireEventsDomInboxListFolderMove } from "./wireEventsDomInboxListFolderMoveRun";
import { wireEventsDomInboxListTrashArchive } from "./wireEventsDomInboxListTrashArchiveRun";

export function wireEventsDomInboxListMove(): void {
  wireEventsDomInboxListTrashArchive();
  wireEventsDomInboxListFolderMove();
}
