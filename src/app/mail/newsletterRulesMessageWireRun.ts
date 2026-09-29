import { invoke } from "@tauri-apps/api/core";
import { MAIL_ACTION_TIMEOUT_MS } from "../core/timeouts";
import { isTauriRuntime } from "../lib/tauriRuntime";
import { tauriErrorMessage, withTimeout } from "../lib/tauriCommand";
import { toast } from "../lib/toast";
import { render } from "../dispatch";
import { loadNewsletterRules } from "./newsletterRulesLoad";
import { normalizeNlRuleInvokeInput, readNlButtonRule } from "./newsletterRuleInput";
import { refreshSelectedThreadAfterNewsletterRuleChange } from "./newsletterRulesRefreshThreadRun";

export async function addNewsletterRuleFromMessageElement(element?: HTMLElement): Promise<void> {
  const raw = readNlButtonRule(element);
  const rule = normalizeNlRuleInvokeInput(raw);
  if (!rule) {
    toast.error("Impossible de lire l’adresse (data-rule vide). Réouvrez le fil ou utilisez les paramètres.");
    return;
  }
  if (!rule.includes("@")) {
    toast.warning("Pour ajouter depuis un message, l’expéditeur doit être une adresse e-mail (avec @).");
    return;
  }
  if (!isTauriRuntime()) {
    toast.warning("Ajout depuis un message : lancez l’app bureau Tauri.");
    return;
  }
  try {
    await withTimeout(invoke("add_newsletter_rule", { input: rule }), MAIL_ACTION_TIMEOUT_MS);
    await loadNewsletterRules();
    await refreshSelectedThreadAfterNewsletterRuleChange();
    toast.success(`Règle ajoutée : ${rule}`);
    render();
  } catch (error) {
    toast.error(tauriErrorMessage(error));
  }
}

export async function removeNewsletterRuleFromMessageElement(element?: HTMLElement): Promise<void> {
  const dom = readNlButtonRule(element);
  if (!dom) {
    toast.error("Règle invalide ou manquante.");
    return;
  }
  if (!isTauriRuntime()) {
    toast.warning("Retrait de règle : lancez l’app bureau Tauri.");
    return;
  }
  try {
    await withTimeout(invoke("remove_newsletter_rule", { input: dom }), MAIL_ACTION_TIMEOUT_MS);
    await loadNewsletterRules();
    await refreshSelectedThreadAfterNewsletterRuleChange();
    toast.success(`Règle retirée : ${dom}`);
    render();
  } catch (error) {
    toast.error(tauriErrorMessage(error));
  }
}
