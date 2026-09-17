import { invoke } from "@tauri-apps/api/core";
import { MAIL_ACTION_TIMEOUT_MS } from "../core/timeouts";
import { isTauriRuntime } from "../lib/tauriRuntime";
import { tauriErrorMessage, withTimeout } from "../lib/tauriCommand";
import { toast } from "../lib/toast";
import { render } from "../dispatch";
import { state } from "../state";

export type ComposePickAttachmentsDeps = {
  scheduleDraftRevisionSave: (delayMs?: number) => void;
};

let composePickAttachmentsDeps: ComposePickAttachmentsDeps | null = null;

export function registerComposePickAttachmentsDeps(deps: ComposePickAttachmentsDeps): void {
  composePickAttachmentsDeps = deps;
}

export async function pickAttachments(): Promise<void> {
  if (!state.draft) return;
  if (!isTauriRuntime()) {
    toast("Ajouter des pièces jointes : disponible seulement dans l’app Tauri.");
    return;
  }
  const d = composePickAttachmentsDeps;
  if (!d) throw new Error("registerComposePickAttachmentsDeps not called");
  try {
    const picked = await withTimeout(invoke<string[]>("pick_attachment_paths", {}), MAIL_ACTION_TIMEOUT_MS);
    if (!picked.length) return;
    const merged = Array.from(new Set([...(state.draft.attachmentPaths ?? []), ...picked]));
    state.draft.attachmentPaths = merged;
    toast(`${picked.length} pièce(s) jointe(s) ajoutée(s).`);
    render();
    d.scheduleDraftRevisionSave(250);
  } catch (error) {
    toast(`Picker PJ échoué: ${tauriErrorMessage(error)}`);
  }
}
