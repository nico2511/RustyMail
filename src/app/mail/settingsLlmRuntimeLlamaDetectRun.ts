import { invoke } from "@tauri-apps/api/core";
import { MAIL_ACTION_TIMEOUT_MS } from "../core/timeouts";
import { isTauriRuntime } from "../lib/tauriRuntime";
import { tauriErrorMessage, withTimeout } from "../lib/tauriCommand";
import { toast } from "../lib/toast";
import { state } from "../state";

export async function autoDetectLlamaServerBinary(opts?: {
  silent?: boolean;
  persist?: boolean;
}): Promise<boolean> {
  if (!isTauriRuntime()) return false;
  const prev = state.appPrefs.ai.llamaServerBinaryPath.trim();
  try {
    const det = await invoke<{
      onPath: boolean;
      wingetInstalled: boolean;
      resolvedPath?: string | null;
    }>("llama_server_detect", {
      binaryHint: prev || "llama-server",
    });
    let next = prev;
    if (det.resolvedPath?.trim()) {
      next = det.resolvedPath.trim();
    } else if ((det.onPath || det.wingetInstalled) && !prev) {
      next = "llama-server";
    }
    if (next && next !== prev) {
      state.appPrefs.ai.llamaServerBinaryPath = next;
      if (opts?.persist !== false) {
        await withTimeout(invoke("set_app_prefs", { prefs: state.appPrefs }), MAIL_ACTION_TIMEOUT_MS);
      }
      if (!opts?.silent) toast(`llama-server : ${next}`);
      return true;
    }
    if (!opts?.silent && (det.onPath || det.wingetInstalled)) {
      toast(`llama-server détecté${det.resolvedPath ? ` (${det.resolvedPath})` : ""}.`);
    } else if (!opts?.silent && !det.onPath && !det.wingetInstalled) {
      toast("llama-server introuvable (PATH et winget).");
    }
  } catch (e) {
    if (!opts?.silent) toast(tauriErrorMessage(e));
  }
  return false;
}
