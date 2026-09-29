import { render } from "../dispatch";
import { state } from "../state";
import { toast } from "../lib/toast";
import { sendQuickReply } from "./composeSendQuickReply";
import { prependComposePlainText } from "./composeBodyEditor";
import { introducesLlmMeta, LLM_META_BODY_TOAST } from "./llmMetaGuard";
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
        const source = (state.selectedThread?.messages ?? []).map((message) => message.cleanedText || "").join("\n");
        if (introducesLlmMeta(source, s.text)) {
          toast.error(LLM_META_BODY_TOAST);
          return true;
        }
        state.composeGrammarSuggestions = null;
        await prepareReply();
        prependComposePlainText(s.text.trim());
        void computePreview();
        toast.success("Texte inséré dans le compositeur.");
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
