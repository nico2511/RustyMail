import { invoke } from "@tauri-apps/api/core";
import { MAIL_ACTION_TIMEOUT_MS } from "../core/timeouts";
import { isTauriRuntime } from "../lib/tauriRuntime";
import { tauriErrorMessage, withTimeout } from "../lib/tauriCommand";
import { toast } from "../lib/toast";
import { render } from "../dispatch";
import { loadNewsletterRules } from "./newsletterRulesLoad";
import { readNlButtonRule } from "./newsletterRuleInput";

export async function addNewsletterDomainRuleFromInput(): Promise<void> {
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
}

export async function removeNewsletterDomainRuleFromElement(element?: HTMLElement): Promise<void> {
  const dom = readNlButtonRule(element);
  if (!dom) {
    toast("Règle invalide ou manquante.");
    return;
  }
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
}
