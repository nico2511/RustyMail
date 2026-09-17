import { invoke } from "@tauri-apps/api/core";
import { tauriErrorMessage } from "../lib/tauriCommand";
import { isTauriRuntime } from "../lib/tauriRuntime";

export function micPermissionErrorMessage(error: unknown): string {
  const raw = tauriErrorMessage(error);
  const low = raw.toLowerCase();
  if (
    low.includes("permission denied") ||
    low.includes("notallowed") ||
    (low.includes("permission") && low.includes("denied"))
  ) {
    return (
      "Micro refusé par Windows ou la WebView. Ouvrez Paramètres Windows → Confidentialité → Microphone, " +
      "autorisez RustyMail, puis relancez l’app. Si le problème persiste, utilisez le bouton micro (clic) une fois."
    );
  }
  return `Micro inaccessible : ${raw}`;
}

export async function requestMicStream(): Promise<MediaStream> {
  try {
    return await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch (e) {
    const low = tauriErrorMessage(e).toLowerCase();
    if (isTauriRuntime() && (low.includes("permission") || low.includes("notallowed"))) {
      try {
        await invoke("reset_webview_microphone_permission");
        return await navigator.mediaDevices.getUserMedia({ audio: true });
      } catch (retryErr) {
        throw retryErr;
      }
    }
    throw e;
  }
}
