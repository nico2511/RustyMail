import { invoke } from "@tauri-apps/api/core";

import { MAIL_ACTION_TIMEOUT_MS } from "../core/timeouts";
import { tauriErrorMessage, withTimeout } from "../lib/tauriCommand";
import { toast } from "../lib/toast";
import { openConfirmModal } from "../modals/promptConfirm";

async function openAttachmentWithRiskHandling(
  messageId: string,
  attachmentId: string,
  label?: string,
  riskAcknowledged = false,
): Promise<string> {
  try {
    return await withTimeout(
      invoke<string>("open_attachment", {
        req: { messageId, attachmentId, riskAcknowledged, openAck: "open-attachment" },
      }),
      MAIL_ACTION_TIMEOUT_MS,
    );
  } catch (err) {
    const msg = tauriErrorMessage(err);
    if (!riskAcknowledged && msg.startsWith("ATTACHMENT_RISK_CONFIRM:")) {
      const hint = label?.trim() || "pièce jointe";
      const ok = await openConfirmModal({
        title: "Pièce jointe à risque",
        body: `RustyMail signale une pièce potentiellement sensible (${hint}). L’ouvrir quand même ?`,
        danger: true,
        confirmLabel: "Ouvrir quand même",
      });
      if (!ok) throw err;
      return openAttachmentWithRiskHandling(messageId, attachmentId, label, true);
    }
    throw err;
  }
}

export async function onAttachmentAction(
  kind: "download" | "open",
  messageId: string,
  attachmentId: string,
  fileName?: string,
): Promise<void> {
  if (!messageId.trim() || !attachmentId.trim()) return;
  const cmd = kind === "open" ? "open_attachment" : "download_attachment";
  try {
    const saved =
      kind === "open" ?
        await openAttachmentWithRiskHandling(messageId, attachmentId, fileName)
      : await withTimeout(
          invoke<string>(cmd, { req: { messageId, attachmentId } }),
          MAIL_ACTION_TIMEOUT_MS,
        );
    toast(kind === "open" ? `Attachment opened: ${saved}` : `Attachment downloaded: ${saved}`);
  } catch (err) {
    console.error(cmd, err);
    toast(tauriErrorMessage(err));
  }
}
