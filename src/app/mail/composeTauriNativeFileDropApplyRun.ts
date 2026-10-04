import { render } from "../dispatch";
import { toast } from "../lib/toast";
import { state } from "../state";
import {
  MAX_COMPOSE_ATTACHMENTS,
  syncComposeAttachmentsHiddenField,
} from "./composeAttachmentPaths";
import { markComposeDraftEdited } from "./composeDraftContentKey";
import { scheduleDraftRevisionSave } from "./composeDraftRevisionAutosave";
import { setPendingDraftRevisionEventKind } from "./composeDraftRevisionEventKind";

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
    toast.warning(`${dropped.length} fichier(s) détecté(s) — ouvrez le composeur pour les ajouter.`);
    return;
  }
  const merged = Array.from(new Set([...(state.draft.attachmentPaths ?? []), ...dropped]));
  if (merged.length > MAX_COMPOSE_ATTACHMENTS) {
    toast.warning(`Maximum ${MAX_COMPOSE_ATTACHMENTS} pièces jointes par message.`);
    return;
  }
  state.draft.attachmentPaths = merged;
  markComposeDraftEdited();
  setPendingDraftRevisionEventKind("attachments");
  syncComposeAttachmentsHiddenField(merged);
  toast.success(`${dropped.length} pièce(s) jointe(s) ajoutée(s).`);
  render();
  scheduleDraftRevisionSave(250);
}
