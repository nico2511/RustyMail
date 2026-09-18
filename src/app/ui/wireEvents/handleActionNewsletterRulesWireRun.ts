import {
  render,
  state,
  toast,
  invoke,
  isTauriRuntime,
  MAIL_ACTION_TIMEOUT_MS,
  withTimeout,
  tauriErrorMessage,
} from "./depsCore";
import {
  fetchOpenThreadOrNotify,
} from "./depsSearchMail";
import {
  loadNewsletterRules,
} from "./depsComposeThread";
import {
  readNlButtonRule,
  normalizeNlRuleInvokeInput,
} from "./depsSettingsAccount";

export async function tryHandleNewsletterRulesWire(action: string, element?: HTMLElement): Promise<boolean> {
  switch (action) {
    case "newsletter-domain-add": {
      void (async () => {
        const raw = document.querySelector<HTMLInputElement>("#newsletter-domain-input")?.value?.trim() ?? "";
        if (!raw) {
          toast("Indiquez une règle (domaine, *.domaine ou local@domaine).");
          return;
        }
        if (!isTauriRuntime()) {
          toast("Ajout de règles : exécutez l’app Tauri.");
          return;
        }
        try {
          await withTimeout(invoke("add_newsletter_rule", { input: raw }), MAIL_ACTION_TIMEOUT_MS);
          await loadNewsletterRules();
          const inp = document.querySelector<HTMLInputElement>("#newsletter-domain-input");
          if (inp) inp.value = "";
          toast("Règle enregistrée.");
          render();
        } catch (error) {
          toast(tauriErrorMessage(error));
        }
      })();
      return true;
    }
    case "newsletter-domain-remove": {
      const dom = readNlButtonRule(element);
      if (!dom) {
        toast("Règle invalide ou manquante.");
        return true;
      }
      void (async () => {
        if (!isTauriRuntime()) {
          toast("Suppression des règles : lancez l’app bureau Tauri.");
          return;
        }
        try {
          await withTimeout(invoke("remove_newsletter_rule", { input: dom }), MAIL_ACTION_TIMEOUT_MS);
          await loadNewsletterRules();
          toast("Règle supprimée.");
          render();
        } catch (error) {
          toast(tauriErrorMessage(error));
        }
      })();
      return true;
    }
    case "newsletter-msg-add-rule": {
      const raw = readNlButtonRule(element);
      const rule = normalizeNlRuleInvokeInput(raw);
      if (!rule) {
        toast("Impossible de lire l’adresse (data-rule vide). Réouvrez le fil ou utilisez les paramètres.");
        return true;
      }
      if (!rule.includes("@")) {
        toast("Pour ajouter depuis un message, l’expéditeur doit être une adresse e-mail (avec @).");
        return true;
      }
      void (async () => {
        if (!isTauriRuntime()) {
          toast("Ajout depuis un message : lancez l’app bureau Tauri.");
          return;
        }
        try {
          await withTimeout(invoke("add_newsletter_rule", { input: rule }), MAIL_ACTION_TIMEOUT_MS);
          await loadNewsletterRules();
          if (state.selectedThreadId) {
            const tid = state.selectedThreadId;
            const refreshed = await fetchOpenThreadOrNotify(tid);
            if (refreshed) state.selectedThread = refreshed;
          }
          toast(`Règle ajoutée : ${rule}`);
          render();
        } catch (error) {
          toast(tauriErrorMessage(error));
        }
      })();
      return true;
    }
    case "newsletter-msg-remove-rule": {
      const dom = readNlButtonRule(element);
      if (!dom) {
        toast("Règle invalide ou manquante.");
        return true;
      }
      void (async () => {
        if (!isTauriRuntime()) {
          toast("Retrait de règle : lancez l’app bureau Tauri.");
          return;
        }
        try {
          await withTimeout(invoke("remove_newsletter_rule", { input: dom }), MAIL_ACTION_TIMEOUT_MS);
          await loadNewsletterRules();
          if (state.selectedThreadId) {
            const tid = state.selectedThreadId;
            const refreshed = await fetchOpenThreadOrNotify(tid);
            if (refreshed) state.selectedThread = refreshed;
          }
          toast(`Règle retirée : ${dom}`);
          render();
        } catch (error) {
          toast(tauriErrorMessage(error));
        }
      })();
      return true;
    }
    default:
      return false;
  }
}
