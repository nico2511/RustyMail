import { listen, TauriEvent } from "@tauri-apps/api/event";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { isTauriRuntime } from "../lib/tauriRuntime";
import { toast } from "../lib/toast";
import { state } from "../state";
import { attachmentPathsJoinedForHiddenField } from "./composeAttachmentPaths";

let tauriNativeDragDropUnlisten: (() => void) | undefined;
let tauriNativeFileDropReady = false;

function tauriCurrentWebviewLabel(): string | undefined {
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

function pathsFromTauriDragPayload(payload: unknown): string[] {
  if (payload === null || typeof payload !== "object") return [];
  const rec = payload as Record<string, unknown>;
  if (!Array.isArray(rec.paths)) return [];
  return rec.paths.map((x) => String(x).trim()).filter(Boolean);
}

function setComposerNativeDragHighlight(on: boolean): void {
  const shell = document.querySelector<HTMLElement>(".composer-mail-shell");
  const composeBody = document.querySelector<HTMLElement>(".composer-body");
  shell?.classList.toggle("composer-mail-shell--drag-over", on);
  composeBody?.classList.toggle("drag-over", on);
}

function applyNativeDroppedFilePaths(dropped: string[]): void {
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

export async function bindTauriNativeFileDropAsync(): Promise<void> {
  if (!isTauriRuntime() || tauriNativeFileDropReady) return;

  for (let i = 0; i < 60 && !tauriCurrentWebviewLabel(); i++) {
    await new Promise((r) => window.setTimeout(r, 16));
  }

  tauriNativeDragDropUnlisten?.();
  tauriNativeDragDropUnlisten = undefined;

  const runDrop = (pathsRaw: string[]): void => {
    setComposerNativeDragHighlight(false);
    applyNativeDroppedFilePaths(pathsRaw);
  };

  try {
    const wv = getCurrentWebview();
    tauriNativeDragDropUnlisten = await wv.onDragDropEvent((event) => {
      const p = event.payload;
      if (p.type === "enter") {
        if (state.view === "compose") setComposerNativeDragHighlight(true);
        return;
      }
      if (p.type === "leave") {
        setComposerNativeDragHighlight(false);
        return;
      }
      if (p.type === "over") return;
      if (p.type === "drop") {
        const dropped = p.paths.map((x) => String(x).trim()).filter(Boolean);
        runDrop(dropped);
      }
    });
    tauriNativeFileDropReady = true;
    return;
  } catch (primary) {
    console.warn("[RustyMail] onDragDropEvent indisponible, repli listen()", primary);
  }

  try {
    const unsubs: Array<() => void> = [];
    unsubs.push(
      await listen(TauriEvent.DRAG_ENTER, () => {
        if (state.view === "compose") setComposerNativeDragHighlight(true);
      }),
    );
    unsubs.push(
      await listen(TauriEvent.DRAG_LEAVE, () => {
        setComposerNativeDragHighlight(false);
      }),
    );
    unsubs.push(
      await listen(TauriEvent.DRAG_DROP, (e) => {
        runDrop(pathsFromTauriDragPayload(e.payload));
      }),
    );
    tauriNativeDragDropUnlisten = () => {
      for (const u of unsubs) u();
    };
    tauriNativeFileDropReady = true;
  } catch (fallback) {
    console.error("[RustyMail] drag-drop natif impossible", fallback);
  }
}
