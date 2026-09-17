import { isDescendantMailboxPath } from "../../mailboxTree";
import { render } from "../dispatch";
import { state } from "../state";
import {
  fmMoveFolder,
  fmSelectMailbox,
  refreshFolderManagerTree,
} from "./folderManagerActions";
import { onThreadMoveTo } from "./threadListActions";

export function wireFolderManagerDnD(): void {
  if (state.view !== "folderManager") return;
  document.querySelectorAll<HTMLElement>(".folder-tree-act, .folder-tree-chevron, .folder-tree-drag-handle").forEach((el) => {
    el.addEventListener("click", (e) => e.stopPropagation());
  });
  document.querySelectorAll<HTMLElement>("[data-action=fm-drag-start]").forEach((el) => {
    el.addEventListener("dragstart", (ev) => {
      const mb = el.dataset.mailbox?.trim();
      if (!mb) return;
      state.folderManager.dragFolder = mb;
      ev.dataTransfer?.setData("text/plain", mb);
      ev.dataTransfer!.effectAllowed = "move";
    });
    el.addEventListener("dragend", () => {
      state.folderManager.dragFolder = null;
      state.folderManager.dropTarget = null;
      render();
    });
  });
  document.querySelectorAll<HTMLElement>("[data-drop-mailbox]").forEach((el) => {
    el.addEventListener("dragover", (ev) => {
      const target = el.dataset.dropMailbox?.trim();
      if (!target) return;
      const isThread = ev.dataTransfer?.types.includes("application/x-rustymail-thread");
      const from = state.folderManager.dragFolder;
      if (isThread) {
        ev.preventDefault();
        state.folderManager.dropTarget = target;
        ev.dataTransfer!.dropEffect = "move";
        return;
      }
      if (!from || target === from || isDescendantMailboxPath(from, target)) return;
      ev.preventDefault();
      state.folderManager.dropTarget = target;
      ev.dataTransfer!.dropEffect = "move";
    });
    el.addEventListener("dragleave", () => {
      state.folderManager.dropTarget = null;
    });
    el.addEventListener("drop", (ev) => {
      ev.preventDefault();
      const target = el.dataset.dropMailbox?.trim();
      const tid = ev.dataTransfer?.getData("application/x-rustymail-thread")?.trim();
      const from = state.folderManager.dragFolder ?? ev.dataTransfer?.getData("text/plain")?.trim();
      state.folderManager.dropTarget = null;
      if (tid && target) {
        void onThreadMoveTo(tid, target).then(async () => {
          await refreshFolderManagerTree();
          if (state.folderManager.selectedMailbox) await fmSelectMailbox(state.folderManager.selectedMailbox);
        });
        return;
      }
      if (from && target) void fmMoveFolder(from, target);
    });
  });
  document.querySelectorAll<HTMLElement>(".inbox-thread-row[data-thread-id]").forEach((el) => {
    el.setAttribute("draggable", "true");
    el.addEventListener("dragstart", (ev) => {
      const tid = el.dataset.threadId?.trim();
      if (!tid) return;
      ev.dataTransfer?.setData("application/x-rustymail-thread", tid);
      ev.dataTransfer!.effectAllowed = "move";
    });
  });
}
