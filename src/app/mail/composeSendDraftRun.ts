import { currentAccount } from "../core/accountContext";
import { toast } from "../lib/toast";
import { state } from "../state";
import { draftPayloadForRust } from "./composeDraftPayload";
import { persistDraft } from "./composePersistDraft";
import { invokeSendDraft } from "./composeSendDraftInvokeRun";
import { maybePromptSplitSendPlan } from "./composeSendDraftPlanRun";
import {
  registerComposeSendDraftRunDeps,
} from "./composeSendDraftFinishRun";

export type { ComposeSendDraftRunDeps } from "./composeSendDraftFinishRun";
export { registerComposeSendDraftRunDeps };
export { confirmAndExecuteSplitSend } from "./composeSendDraftSplitRun";

export async function sendDraft(): Promise<void> {
  persistDraft();
  if (!state.draft) {
    toast("Aucun brouillon à envoyer.");
    console.warn("sendDraft: state.draft is undefined");
    return;
  }
  const toEmails = state.draft.to.map((x) => x.email?.trim()).filter(Boolean);
  if (toEmails.length === 0) {
    toast("Ajoutez au moins une adresse dans le champ À.");
    return;
  }
  if (!state.draft.subject?.trim()) {
    toast("Renseignez l’objet du message.");
    return;
  }
  const accountId = currentAccount()?.id ?? null;
  const draftOutbound = draftPayloadForRust(state.draft);
  if (await maybePromptSplitSendPlan(draftOutbound)) return;
  await invokeSendDraft(accountId, draftOutbound);
}
