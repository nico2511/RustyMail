import { attachmentPathsJoinedForHiddenField } from "./composeAttachmentPaths";
import { isTauriRuntime } from "../lib/tauriRuntime";
import { toast } from "../lib/toast";
import { render } from "../dispatch";
import { state } from "../state";

let composerDropAbort: AbortController | undefined;
let composeDragDepth = 0;

function extractDroppedPaths(dataTransfer: DataTransfer | null): string[] {
  if (!dataTransfer) return [];
  const files = Array.from(dataTransfer.files ?? []);
  return files
    .map((file) => {
      const localPath = (file as File & { path?: string }).path;
      if (typeof localPath === "string" && localPath.trim()) return localPath.trim();
      return "";
    })
    .filter(Boolean);
}

export function bindComposerDropzone(): void {
  composerDropAbort?.abort();
  composerDropAbort = undefined;
  composeDragDepth = 0;
  if (state.view !== "compose") return;
  if (isTauriRuntime()) return;
  const shell = document.querySelector<HTMLElement>(".composer-mail-shell");
  const composeBody = document.querySelector<HTMLElement>(".composer-mail-shell .composer-body");
  if (!shell || !composeBody) return;

  composerDropAbort = new AbortController();
  const { signal } = composerDropAbort;

  const clearOverlay = () => {
    composeDragDepth = 0;
    shell.classList.remove("composer-mail-shell--drag-over");
    composeBody.classList.remove("drag-over");
  };

  const bumpOverlay = () => {
    shell.classList.add("composer-mail-shell--drag-over");
    composeBody.classList.add("drag-over");
  };

  const onDragEnter = (event: DragEvent) => {
    event.preventDefault();
    composeDragDepth += 1;
    bumpOverlay();
  };

  const onDragLeave = () => {
    composeDragDepth = Math.max(0, composeDragDepth - 1);
    if (composeDragDepth <= 0) clearOverlay();
  };

  const onDragOver = (event: DragEvent) => {
    event.preventDefault();
    const dt = event.dataTransfer;
    if (dt && Array.from(dt.types).includes("Files")) dt.dropEffect = "copy";
  };

  const onDrop = (event: DragEvent) => {
    event.preventDefault();
    clearOverlay();
    if (!state.draft) return;
    const dropped = extractDroppedPaths(event.dataTransfer);
    if (!dropped.length) {
      toast(
        "Aucun chemin de fichier local lu. Glissez depuis l’explorateur ou le bureau (mode Tauri ou Electron), pas depuis une page web.",
      );
      return;
    }
    const merged = Array.from(new Set([...(state.draft.attachmentPaths ?? []), ...dropped]));
    state.draft.attachmentPaths = merged;
    const attachmentsField = document.querySelector<HTMLInputElement>("#compose-attachments");
    if (attachmentsField) attachmentsField.value = attachmentPathsJoinedForHiddenField(merged);
    toast(`${dropped.length} pièce(s) jointe(s) ajoutée(s).`);
    render();
  };

  shell.addEventListener("dragenter", onDragEnter, { signal });
  shell.addEventListener("dragleave", onDragLeave, { signal });
  shell.addEventListener("dragover", onDragOver, { signal, capture: true });
  shell.addEventListener("drop", onDrop, { signal, capture: true });
}
