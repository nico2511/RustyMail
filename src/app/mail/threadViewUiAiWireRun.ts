import { persistAiFeaturePrefs } from "../../aiPrefsPersist";
import { setAllAiFeatures } from "../../aiFeatures";
import { normalizeAiPrefsMerged } from "../../prefs_defaults";
import { render } from "../dispatch";
import { state } from "../state";
import { toast } from "../lib/toast";
import { tauriErrorMessage } from "../lib/tauriCommand";
import { dismissMailboxDigestPanel, mailboxDigestSlotInList } from "./mailboxDigest";
import { llmInboxDigestUi } from "./threadAiWireActions";

export async function tryHandleThreadViewUiAiWire(action: string): Promise<boolean> {
  switch (action) {
    case "toggle-ai-quick-panel":
      state.aiQuickPanelOpen = !state.aiQuickPanelOpen;
      render();
      return true;
    case "toggle-thread-quick-reply": {
      state.threadQuickReplyOpen = !state.threadQuickReplyOpen;
      render();
      if (state.threadQuickReplyOpen) {
        window.setTimeout(() => {
          document.querySelector<HTMLInputElement>("[data-quick-reply]")?.focus();
        }, 340);
      }
      return true;
    }
    case "ai-features-all-on":
      setAllAiFeatures(state.appPrefs.ai, true);
      state.appPrefs.ai = normalizeAiPrefsMerged(state.appPrefs.ai);
      void (async () => {
        try {
          await persistAiFeaturePrefs();
          toast("Toutes les fonctionnalités IA activées.");
        } catch (e) {
          toast(tauriErrorMessage(e));
        }
        render();
      })();
      return true;
    case "ai-features-all-off":
      setAllAiFeatures(state.appPrefs.ai, false);
      state.appPrefs.ai = normalizeAiPrefsMerged(state.appPrefs.ai);
      void (async () => {
        try {
          await persistAiFeaturePrefs();
          toast("Toutes les fonctionnalités IA désactivées.");
        } catch (e) {
          toast(tauriErrorMessage(e));
        }
        render();
      })();
      return true;
    case "toggle-ai": {
      if (mailboxDigestSlotInList()) {
        dismissMailboxDigestPanel();
        return true;
      }
      if (state.aiOpen) state.aiOpen = false;
      else if (state.view === "thread" || state.view === "list") state.aiOpen = true;
      render();
      return true;
    }
    case "toggle-mailbox-digest-panel":
      if (mailboxDigestSlotInList()) {
        dismissMailboxDigestPanel();
      } else {
        void llmInboxDigestUi();
      }
      return true;
    default:
      return false;
  }
}
