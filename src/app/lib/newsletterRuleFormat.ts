import type { NewsletterRuleRow } from "../types";

export function formatNewsletterRuleInput(r: NewsletterRuleRow): string {
  if ((r.localPart ?? "*").toLowerCase() === "*") return `*.${r.domain}`;
  return `${r.localPart}@${r.domain}`;
}
