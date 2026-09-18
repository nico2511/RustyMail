import { render } from "../dispatch";
import { state } from "../state";
import { toast } from "../lib/toast";
import { sendQuickReply } from "./composeSendQuickReply";
import { computePreview } from "./composeComposerBridge";
import { prepareReply } from "./composeThreadReply";

export async function tryHandleThreadLlmQuickReplyWire(action: string, element?: HTMLElement): Promise<boolean> {
  switch (action) {
    case "quick-reply-send":
      await sendQuickReply("reply");
      return true;
    case "quick-reply-send-all":
      await sendQuickReply("reply-all");
      return true;
    case "quick-reply-compose": {
      const qrRaw = element?.dataset.qrIndex;
      if (qrRaw !== undefined && qrRaw !== "") {
        const idx = Number(qrRaw);
        const s = state.quickReplySuggestions[idx];
        if (!s?.text) return true;
        state.composeGrammarSuggestions = null;
        await prepareReply();
        const add = `${s.text.trim()}\n\n`;
        state.composeBody = `${add}${state.composeBody}`;
        state.composeCanonicalBody = state.composeBody;
        const ta = document.querySelector<HTMLTextAreaElement>("#compose-body");
        if (ta) ta.value = state.composeBody;
        void computePreview();
        toast("Texte inséré dans le compositeur.");
        render();
      } else {
        await prepareReply();
      }
      return true;
    }
    default:
      return false;
  }
}
