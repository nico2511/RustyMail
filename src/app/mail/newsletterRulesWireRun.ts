import { invoke } from "@tauri-apps/api/core";
import { MAIL_ACTION_TIMEOUT_MS } from "../core/timeouts";
import { isTauriRuntime } from "../lib/tauriRuntime";
import { tauriErrorMessage, withTimeout } from "../lib/tauriCommand";
import { toast } from "../lib/toast";
import { render } from "../dispatch";
import { state } from "../state";
import { fetchOpenThreadOrNotify } from "./fetchOpenThread";
import { loadNewsletterRules } from "./newsletterRulesLoad";
import { normalizeNlRuleInvokeInput, readNlButtonRule } from "./newsletterRuleInput";

async function refreshSelectedThreadAfterRuleChange(): Promise<void> {
  if (!state.selectedThreadId) return;
  const tid = state.selectedThreadId;
  const refreshed = await fetchOpenThreadOrNotify(tid);
  if (refreshed) state.selectedThread = refreshed;
}

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

export async function addNewsletterRuleFromMessageElement(element?: HTMLElement): Promise<void> {
  const raw = readNlButtonRule(element);
  const rule = normalizeNlRuleInvokeInput(raw);
  if (!rule) {
    toast("Impossible de lire l’adresse (data-rule vide). Réouvrez le fil ou utilisez les paramètres.");
    return;
  }
  if (!rule.includes("@")) {
    toast("Pour ajouter depuis un message, l’expéditeur doit être une adresse e-mail (avec @).");
    return;
  }
  if (!isTauriRuntime()) {
    toast("Ajout depuis un message : lancez l’app bureau Tauri.");
    return;
  }
  try {
    await withTimeout(invoke("add_newsletter_rule", { input: rule }), MAIL_ACTION_TIMEOUT_MS);
    await loadNewsletterRules();
    await refreshSelectedThreadAfterRuleChange();
    toast(`Règle ajoutée : ${rule}`);
    render();
  } catch (error) {
    toast(tauriErrorMessage(error));
  }
}

export async function removeNewsletterRuleFromMessageElement(element?: HTMLElement): Promise<void> {
  const dom = readNlButtonRule(element);
  if (!dom) {
    toast("Règle invalide ou manquante.");
    return;
  }
  if (!isTauriRuntime()) {
    toast("Retrait de règle : lancez l’app bureau Tauri.");
    return;
  }
  try {
    await withTimeout(invoke("remove_newsletter_rule", { input: dom }), MAIL_ACTION_TIMEOUT_MS);
    await loadNewsletterRules();
    await refreshSelectedThreadAfterRuleChange();
    toast(`Règle retirée : ${dom}`);
    render();
  } catch (error) {
    toast(tauriErrorMessage(error));
  }
}

export async function tryHandleNewsletterRulesWire(action: string, element?: HTMLElement): Promise<boolean> {
  switch (action) {
    case "newsletter-domain-add":
      void addNewsletterDomainRuleFromInput();
      return true;
    case "newsletter-domain-remove":
      void removeNewsletterDomainRuleFromElement(element);
      return true;
    case "newsletter-msg-add-rule":
      void addNewsletterRuleFromMessageElement(element);
      return true;
    case "newsletter-msg-remove-rule":
      void removeNewsletterRuleFromMessageElement(element);
      return true;
    default:
      return false;
  }
}
