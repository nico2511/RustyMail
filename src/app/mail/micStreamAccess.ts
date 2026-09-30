import { invoke } from "@tauri-apps/api/core";
import { tauriErrorMessage } from "../lib/tauriCommand";
import { isTauriRuntime } from "../lib/tauriRuntime";

export function micPermissionErrorMessage(error: unknown): string {
  const raw = tauriErrorMessage(error);
  if (raw.trim().toLowerCase().startsWith("micro")) {
    return raw;
  }
  const low = raw.toLowerCase();
  if (
    low.includes("permission denied") ||
    low.includes("notallowed") ||
    (low.includes("permission") && low.includes("denied"))
  ) {
    return (
      "Micro refusé. Ouvrez Paramètres Windows → Confidentialité et sécurité → Microphone, " +
      "activez l’accès au micro et autorisez les applications de bureau, puis réessayez."
    );
  }
  return `Micro inaccessible : ${raw}`;
}

export async function requestMicStream(): Promise<MediaStream> {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error(
      "Micro indisponible dans cette fenêtre. Réessayez après avoir autorisé le microphone pour les applications de bureau.",
    );
  }
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
