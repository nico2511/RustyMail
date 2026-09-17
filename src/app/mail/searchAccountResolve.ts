import { extractAddrSpec, normalizeNlRuleInvokeInput } from "./newsletterRuleInput";
import { state } from "../state";

export function canonicalEmailForNlMatch(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const bare = extractAddrSpec(trimmed) || trimmed;
  if (!bare.includes("@")) return null;
  return normalizeNlRuleInvokeInput(bare);
}

export function addSearchSender(email: string): void {
  const c = canonicalEmailForNlMatch(email) ?? email.trim().toLowerCase();
  if (!c) return;
  if (!state.searchSenders.some((s) => s.toLowerCase() === c)) state.searchSenders.push(c);
}

export function resolveAccountIdFromRef(ref: string): string | null {
  const q = ref.trim().toLowerCase();
  if (!q) return null;
  const hit = state.accounts.find(
    (a) =>
      a.id.toLowerCase() === q ||
      a.email.toLowerCase() === q ||
      a.email.toLowerCase().includes(q) ||
      (a.displayName ?? "").toLowerCase().includes(q),
  );
  return hit?.id ?? null;
}
