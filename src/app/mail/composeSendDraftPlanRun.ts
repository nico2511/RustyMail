import { invoke } from "@tauri-apps/api/core";
import type { Draft, SplitPlan } from "../types";
import { MAIL_ACTION_TIMEOUT_MS } from "../core/timeouts";
import { isTauriRuntime } from "../lib/tauriRuntime";
import { tauriErrorMessage, withTimeout } from "../lib/tauriCommand";
import { toast } from "../lib/toast";
import { render } from "../dispatch";
import { state } from "../state";

export async function maybePromptSplitSendPlan(draftOutbound: Draft): Promise<boolean> {
  const attachPaths = draftOutbound.attachmentPaths ?? [];
  if (!isTauriRuntime() || attachPaths.length === 0) return false;
  try {
    state.composeMessage = "Analyse des pièces jointes…";
    render();
    const plan = await withTimeout(
      invoke<SplitPlan>("plan_split_send", { draft: draftOutbound }),
      MAIL_ACTION_TIMEOUT_MS,
    );
    // Multi-parties, ou un seul lot oversized (sinon SMTP silencieux sans avertissement).
    if (plan.chunks.length > 1 || plan.hasOversized) {
      state.splitSendConfirm = plan;
      state.composeMessage = "";
      render();
      return true;
    }
  } catch (error) {
    console.error("plan_split_send", error);
    state.composeMessage = "";
    // Ne pas bloquer l’envoi normal : SMTP/IPC signaleront le même problème si réel.
    toast.warning(`Découpage PJ indisponible — tentative d’envoi classique. ${tauriErrorMessage(error)}`);
    render();
    return false;
  }
  state.composeMessage = "";
  return false;
}
