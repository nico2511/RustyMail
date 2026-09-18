import {
  loadMailView,
  loadMailboxUnread,
  render,
  state,
  toast,
  invoke,
  t,
  isTauriRuntime,
  openConfirmModal,
  tauriErrorMessage,
} from "./depsCore";
import {
  prepareReply,
  sendQuickReply,
  scrollToThreadMessage,
  cancelLlmQueueJob,
  computePreview,
  summarizeThread,
  llmTranslateThreadUi,
  llmTranslateMessageUi,
  llmQuickRepliesThreadUi,
  llmInboxDigestUi,
  loadAccountsFromBackend,
  llmQaThreadUi,
} from "./depsComposeThread";
import type {
  Account,
} from "../../../accountSetup";

export async function tryHandleThreadLlmWire(action: string, element?: HTMLElement): Promise<boolean> {
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
    case "summarize":
      await summarizeThread();
      return true;
    case "llm-translate-thread":
      void llmTranslateThreadUi();
      return true;
    case "llm-translate-message": {
      const mid = element?.dataset.msgId?.trim();
      if (mid) void llmTranslateMessageUi(mid, element?.dataset.llmTranslateRefresh === "1");
      return true;
    }
    case "llm-quick-replies-thread":
      void llmQuickRepliesThreadUi();
      return true;
    case "llm-inbox-digest":
      void llmInboxDigestUi();
      return true;
    case "demo-reset-playground": {
      if (!isTauriRuntime()) {
        toast("Démo : lance l’app via Tauri (`npm run tauri:dev`), pas le navigateur seul.");
        return true;
      }
      try {
        const msg = await invoke<string>("demo_reset_playground_mailbox");
        toast(msg);
        const ok = await loadAccountsFromBackend({ silent: false });
        if (!ok) toast("Rechargement des comptes incomplet — vérifie la liste.");
        const DEMO = "playground@demo.rustymail.app";
        if (state.accounts.some((a: Account) => a.id === DEMO)) {
          state.selectedAccountId = DEMO;
          state.view = "list";
          state.selectedMailbox = "INBOX";
          await loadMailView(false);
          await loadMailboxUnread();
        }
        render();
      } catch (e) {
        console.error("demo_reset_playground_mailbox", e);
        toast(tauriErrorMessage(e));
      }
      return true;
    }
    case "demo-remove-playground": {
      if (!isTauriRuntime()) {
        toast("Démo : lance l’app via Tauri (`npm run tauri:dev`), pas le navigateur seul.");
        return true;
      }
      const confirmed = await openConfirmModal({
        title: "Supprimer la boîte démo ?",
        body:
          "Le compte playground@demo.rustymail.app et toutes ses données locales seront effacés (messages, cache, index sémantique pour ce compte, mot de passe factice dans le trousseau). Vous pourrez ensuite configurer un compte IMAP réel dans Paramètres → Comptes. Les modèles IA téléchargés (MiniLM, GGUF) restent sur disque.",
        danger: true,
        confirmLabel: "Supprimer la démo",
      });
      if (!confirmed) return true;
      try {
        const msg = await invoke<string>("demo_remove_playground_mailbox");
        toast(msg);
        const DEMO = "playground@demo.rustymail.app";
        const ok = await loadAccountsFromBackend({ silent: false });
        if (!ok) toast("Rechargement des comptes incomplet — vérifie la liste.");
        if (state.selectedAccountId === DEMO) {
          state.selectedAccountId = state.accounts[0]?.id ?? "";
        }
        if (state.settingsSelectedAccountId === DEMO) {
          state.settingsSelectedAccountId = state.accounts[0]?.id ?? "new";
        }
        if (state.accounts.length > 0 && state.selectedAccountId) {
          state.view = "list";
          state.selectedMailbox = "INBOX";
          await loadMailView(false);
          await loadMailboxUnread();
        } else {
          state.view = "settings";
          state.settingsTab = "accounts";
        }
        render();
      } catch (e) {
        console.error("demo_remove_playground_mailbox", e);
        toast(tauriErrorMessage(e));
      }
      return true;
    }
    case "llm-cancel-job":
      cancelLlmQueueJob();
      toast("Annulation demandée…");
      return true;
    case "llm-qa-thread":
      void llmQaThreadUi();
      return true;
    case "llm-qa-clear":
      state.threadQaAnswer = null;
      state.threadQaStreamText = "";
      render();
      return true;
    case "qa-open-message": {
      const mid = element?.dataset.msgId?.trim();
      if (mid) scrollToThreadMessage(mid);
      return true;
    }
    default:
      return false;
  }
}
