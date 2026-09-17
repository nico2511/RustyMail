import { invoke } from "@tauri-apps/api/core";
import { isAiFeatureEnabled } from "../../aiFeatures";
import { composeRewriteStyleFromTone } from "../core/composeTone";
import { LLM_INVOKE_TIMEOUT_MS } from "../core/timeouts";
import { isTauriRuntime } from "../lib/tauriRuntime";
import { withTimeout } from "../lib/tauriCommand";
import { toast } from "../lib/toast";
import { state } from "../state";

export async function rewriteDictatedSegmentWithTone(raw: string): Promise<string> {
  const t = raw.trim();
  if (!t || !isTauriRuntime() || state.view !== "compose") return raw;
  if (!state.appPrefs.ai.dictationRewriteWithStyle) return raw;
  if (!isAiFeatureEnabled(state.appPrefs.ai, "featureComposeRewriteEnabled")) return raw;
  try {
    const style = composeRewriteStyleFromTone();
    const res = await withTimeout(
      invoke<{ text: string }>("llm_rewrite_compose", { text: t, style }),
      LLM_INVOKE_TIMEOUT_MS,
    );
    const out = (res.text ?? "").trim();
    return out.length ? out : raw;
  } catch {
    toast(
      "Réécriture du texte dicté indisponible (porte LLM fermée ou erreur réseau) — transcription brute conservée.",
    );
    return raw;
  }
}
