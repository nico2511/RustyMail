import type { NewsletterRuleRow } from "../types";
import { canonicalEmailForNlMatch } from "./searchAccountResolve";
import { state } from "../state";

function hostSuffixMatch(host: string, domain: string): boolean {
  const h = host.trim().toLowerCase();
  const d = domain.trim().toLowerCase();
  if (!d) return false;
  return h === d || h.endsWith(`.${d}`);
}

export function firstMatchingNewsletterRule(email: string): NewsletterRuleRow | null {
  const e = canonicalEmailForNlMatch(email);
  if (!e) return null;
  const at = e.lastIndexOf("@");
  if (at <= 0 || at === e.length - 1) return null;
  const local = e.slice(0, at);
  const host = e.slice(at + 1);
  for (const r of state.newsletterRules) {
    const d = r.domain.toLowerCase();
    const lp = (r.localPart ?? "*").toLowerCase();
    if (!hostSuffixMatch(host, d)) continue;
    if (lp === "*" || lp === local) return r;
  }
  return null;
}

export function newsletterEmailListed(email: string): boolean {
  return firstMatchingNewsletterRule(email) !== null;
}
