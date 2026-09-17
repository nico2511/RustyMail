import { invoke } from "@tauri-apps/api/core";
import { MAIL_ACTION_TIMEOUT_MS } from "../core/timeouts";
import { isTauriRuntime } from "../lib/tauriRuntime";
import { tauriErrorMessage, withTimeout } from "../lib/tauriCommand";
import { toast } from "../lib/toast";
import { state } from "../state";

export async function downloadAllAttachmentsForMessage(messageId: string): Promise<void> {
  if (!messageId.trim()) return;
  if (!isTauriRuntime()) {
    toast("Téléchargement : lancez l’application bureau Tauri.");
    return;
  }
  const msg = state.selectedThread?.messages.find((m) => m.messageId === messageId);
  const atts = msg?.attachments ?? [];
  if (atts.length < 2) {
    toast("Ce message n’a pas plusieurs pièces jointes à regrouper.");
    return;
  }
  let ok = 0;
  const errors: string[] = [];
  for (const att of atts) {
    try {
      await withTimeout(
        invoke<string>("download_attachment", {
          req: { messageId, attachmentId: att.id },
        }),
        MAIL_ACTION_TIMEOUT_MS,
      );
      ok++;
    } catch (e) {
      errors.push(`${att.fileName}: ${tauriErrorMessage(e)}`);
    }
  }
  if (errors.length === 0) {
    toast(
      `${ok} pièce${ok > 1 ? "s" : ""} jointe${ok > 1 ? "s" : ""} enregistrée${ok > 1 ? "s" : ""} dans Téléchargements`,
    );
  } else {
    const hint = errors.slice(0, 2).join(" · ");
    toast(`${ok}/${atts.length} téléchargée(s). ${hint}${errors.length > 2 ? "…" : ""}`);
  }
}
