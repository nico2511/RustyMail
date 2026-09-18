import { toast } from "../lib/toast";
import { state } from "../state";
import { attachmentPathsJoinedForHiddenField } from "./composeAttachmentPaths";

export function tauriCurrentWebviewLabel(): string | undefined {
  try {
    const w = window as unknown as {
      __TAURI_INTERNALS__?: { metadata?: { currentWebview?: { label?: string } } };
    };
    const label = w.__TAURI_INTERNALS__?.metadata?.currentWebview?.label;
    return typeof label === "string" && label.trim() ? label.trim() : undefined;
  } catch {
    return undefined;
  }
}

export function pathsFromTauriDragPayload(payload: unknown): string[] {
  if (payload === null || typeof payload !== "object") return [];
  const rec = payload as Record<string, unknown>;
  if (!Array.isArray(rec.paths)) return [];
  return rec.paths.map((x) => String(x).trim()).filter(Boolean);
}

export function setComposerNativeDragHighlight(on: boolean): void {
  const shell = document.querySelector<HTMLElement>(".composer-mail-shell");
  const composeBody = document.querySelector<HTMLElement>(".composer-body");
  shell?.classList.toggle("composer-mail-shell--drag-over", on);
  composeBody?.classList.toggle("drag-over", on);
}

export function applyNativeDroppedFilePaths(dropped: string[]): void {
  if (!dropped.length) return;
  if (state.view !== "compose" || !state.draft) {
    toast(`${dropped.length} fichier(s) détecté(s) — ouvrez le composeur pour les ajouter.`);
    return;
  }
  const merged = Array.from(new Set([...(state.draft.attachmentPaths ?? []), ...dropped]));
  state.draft.attachmentPaths = merged;
  const attachmentsField = document.querySelector<HTMLInputElement>("#compose-attachments");
  if (attachmentsField) attachmentsField.value = attachmentPathsJoinedForHiddenField(merged);
  toast(`${dropped.length} pièce(s) jointe(s) ajoutée(s).`);
}
