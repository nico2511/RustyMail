import { invoke } from "@tauri-apps/api/core";
import { BOOT_INVOKE_TIMEOUT_MS } from "../core/timeouts";
import { isTauriRuntime } from "../lib/tauriRuntime";
import { withTimeout } from "../lib/tauriCommand";

export async function aiCacheKeySegment(): Promise<string> {
  if (!isTauriRuntime()) return "none";
  try {
    const s = await withTimeout(invoke<string>("ai_cache_llm_segment", {}), BOOT_INVOKE_TIMEOUT_MS);
    return (s ?? "none").trim() || "none";
  } catch {
    return "none";
  }
}
