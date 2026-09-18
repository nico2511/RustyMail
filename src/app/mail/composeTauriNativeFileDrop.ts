import { listen, TauriEvent } from "@tauri-apps/api/event";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { isTauriRuntime } from "../lib/tauriRuntime";
import { state } from "../state";
import {
  applyNativeDroppedFilePaths,
  pathsFromTauriDragPayload,
  setComposerNativeDragHighlight,
  tauriCurrentWebviewLabel,
} from "./composeTauriNativeFileDropApplyRun";

let tauriNativeDragDropUnlisten: (() => void) | undefined;
let tauriNativeFileDropReady = false;

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
