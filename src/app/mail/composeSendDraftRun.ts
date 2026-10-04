import { currentAccount } from "../core/accountContext";
import { toast } from "../lib/toast";
import { render } from "../dispatch";
import { state } from "../state";
import { draftPayloadForRust } from "./composeDraftPayload";
import { ensureInlineImagesWithinLimit } from "./composeInlineImageLimits";
import { persistDraft } from "./composePersistDraft";
import { invokeSendDraft } from "./composeSendDraftInvokeRun";
import { maybePromptSplitSendPlan } from "./composeSendDraftPlanRun";
import {
  registerComposeSendDraftRunDeps,
} from "./composeSendDraftFinishRun";
import { loadComposeMarkdownIntoEditor } from "./composeComposerBridge";

export type { ComposeSendDraftRunDeps } from "./composeSendDraftFinishRun";
export { registerComposeSendDraftRunDeps };
export { confirmAndExecuteSplitSend } from "./composeSendDraftSplitRun";

export async function sendDraft(): Promise<void> {
  persistDraft();
  if (!state.draft) {
    toast.warning("Aucun brouillon à envoyer.");
    console.warn("sendDraft: state.draft is undefined");
    return;
  }
  const toEmails = state.draft.to.map((x) => x.email?.trim()).filter(Boolean);
  if (toEmails.length === 0) {
    toast.warning("Ajoutez au moins une adresse dans le champ À.");
    return;
  }
  if (!state.draft.subject?.trim()) {
    toast.warning("Renseignez l’objet du message.");
    return;
  }
  const ensured = await ensureInlineImagesWithinLimit(state.draft.markdownBody ?? "");
  if (!ensured.ok) {
    state.composeMessage = ensured.error;
    toast.warning(ensured.error);
    render();
    return;
  }
  if (ensured.compressed > 0 && ensured.body !== (state.draft.markdownBody ?? "")) {
    state.draft.markdownBody = ensured.body;
    state.composeCanonicalBody = ensured.body;
    loadComposeMarkdownIntoEditor(ensured.body);
    persistDraft();
  }
  const accountId = currentAccount()?.id ?? null;
  const draftOutbound = draftPayloadForRust(state.draft);
  if (await maybePromptSplitSendPlan(draftOutbound)) return;
  await invokeSendDraft(accountId, draftOutbound);
}
