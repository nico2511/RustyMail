import { invoke } from "@tauri-apps/api/core";
import { render } from "../dispatch";
import { toast } from "../lib/toast";
import { isTauriRuntime } from "../lib/tauriRuntime";
import { tauriErrorMessage, withTimeout } from "../lib/tauriCommand";

export async function tryHandleSettingsAiPrefetchWhisperWire(action: string): Promise<boolean> {
  if (action !== "prefetch-whisper-models") return false;
  void (async () => {
    if (!isTauriRuntime()) {
      toast("Téléchargement GGML : lancez l’app Tauri.");
      return;
    }
    toast("Téléchargement du GGML Whisper (HF) selon tes réglages…");
    try {
      const msg = await withTimeout(invoke<string>("prefetch_whisper_dictation_model", {}), 900_000);
      toast(msg);
    } catch (e) {
      toast(tauriErrorMessage(e));
    }
    render();
  })();
  return true;
}
