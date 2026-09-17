import { invoke } from "@tauri-apps/api/core";
import type { NewsletterRuleRow } from "../types";
import { MAIL_ACTION_TIMEOUT_MS } from "../core/timeouts";
import { isTauriRuntime } from "../lib/tauriRuntime";
import { withTimeout } from "../lib/tauriCommand";
import { state } from "../state";

export async function loadNewsletterRules(): Promise<void> {
  if (!isTauriRuntime()) {
    state.newsletterRules = [];
    return;
  }
  try {
    state.newsletterRules = await withTimeout(
      invoke<NewsletterRuleRow[]>("list_newsletter_rules"),
      MAIL_ACTION_TIMEOUT_MS,
    );
  } catch (error) {
    console.error("list_newsletter_rules", error);
    state.newsletterRules = [];
  }
}
