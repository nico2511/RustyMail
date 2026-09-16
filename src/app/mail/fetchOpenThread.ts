import { invoke } from "@tauri-apps/api/core";
import type { DiscussionThreadView } from "../types";
import { BOOT_INVOKE_TIMEOUT_MS } from "../core/timeouts";
import { tauriErrorMessage, withTimeout } from "../lib/tauriCommand";
import { isTauriRuntime } from "../lib/tauriRuntime";
import { toast } from "../lib/toast";

export async function fetchOpenThreadOrNotify(
  threadId: string,
  opts?: { quiet?: boolean },
): Promise<DiscussionThreadView | null> {
  const tid = threadId.trim();
  if (!tid) return null;
  if (!isTauriRuntime()) {
    if (!opts?.quiet) toast("Ouvrir un fil : lancez l’app Tauri.");
    return null;
  }
  try {
    return await withTimeout(invoke<DiscussionThreadView>("open_thread", { threadId: tid }), BOOT_INVOKE_TIMEOUT_MS);
  } catch (error) {
    console.error("open_thread", error);
    if (!opts?.quiet) toast(`Impossible d’ouvrir le fil : ${tauriErrorMessage(error)}`);
    return null;
  }
}
