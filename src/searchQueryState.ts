/** Réinitialisation / application des modificateurs de recherche (barre + NL). */

import type { ParsedSearchBar } from "./searchBarParse";

export type ListFilter = "all" | "unread" | "starred" | "focused" | "auto";

export type SearchStructuralState = {
  search: string;
  searchSenders: string[];
  searchTags: Array<{ family: string; value: string }>;
  searchMailboxPath: string | null;
  searchAccountOverrideId: string | null;
  searchNewsletterRule: unknown | null;
  searchScope: "account" | "mailbox";
  listFilter: ListFilter;
  searchNlMode: "lexical" | "semantic" | "hybrid" | null;
  searchLanguageFilter: string | null;
};

export function resetSearchStructuralState(s: SearchStructuralState): void {
  s.searchSenders = [];
  s.searchTags = [];
  s.searchMailboxPath = null;
  s.searchAccountOverrideId = null;
  s.searchNewsletterRule = null;
  s.searchScope = "account";
  s.listFilter = "all";
  s.searchNlMode = null;
  s.searchLanguageFilter = null;
}

export type NlSearchQueryInput = {
  text?: string | null;
  sender?: string | null;
  senders?: string[];
  tags?: Array<{ family?: string; value?: string }>;
  mode?: string | null;
  language?: string | null;
  mailbox?: string | null;
  accountId?: string | null;
};

/** Mots-clés si le LLM n’a pas rempli `text` (aligné sur `nl_search_text_fallback` Rust). */
export function extractNlSearchFallbackText(phrase: string): string {
  const blob = phrase.trim().toLowerCase();
  if (!blob) return "";
  const hints: Array<[string, string]> = [
    ["factures", "facture"],
    ["facture", "facture"],
    ["invoices", "invoice"],
    ["invoice", "invoice"],
    ["paiement", "paiement"],
    ["paiements", "paiement"],
    ["payment", "payment"],
    ["billing", "billing"],
    ["reçu", "reçu"],
    ["recu", "recu"],
    ["receipt", "receipt"],
    ["commande", "commande"],
    ["commandes", "commande"],
    ["newsletter", "newsletter"],
    ["newsletters", "newsletter"],
  ];
  const terms: string[] = [];
  for (const [hint, term] of hints) {
    if (blob.includes(hint) && !terms.includes(term)) terms.push(term);
  }
  if (terms.length) return terms.join(" ");
  const stop = new Set([
    "a",
    "au",
    "aux",
    "avec",
    "ce",
    "ces",
    "de",
    "des",
    "du",
    "dans",
    "en",
    "et",
    "la",
    "le",
    "les",
    "mail",
    "mails",
    "email",
    "emails",
    "message",
    "messages",
    "tous",
    "tout",
    "toute",
    "toutes",
    "un",
    "une",
    "pour",
    "par",
    "sur",
    "the",
    "and",
    "with",
    "from",
  ]);
  for (const word of blob.split(/\s+/)) {
    const w = word.replace(/[^\p{L}\p{N}]/gu, "");
    if (w.length < 3 || stop.has(w)) continue;
    if (!terms.includes(w)) terms.push(w);
    if (terms.length >= 4) break;
  }
  return terms.join(" ");
}

export function applyNlSearchQueryToState(
  s: SearchStructuralState,
  sq: NlSearchQueryInput,
  normalizeSender: (raw: string) => string | null,
  accountExists: (id: string) => boolean
): void {
  resetSearchStructuralState(s);
  s.search = (sq.text ?? "").trim();
  const seen = new Set<string>();
  for (const raw of [...(sq.senders ?? []), ...(sq.sender?.trim() ? [sq.sender.trim()] : [])]) {
    const c = normalizeSender(raw);
    if (!c || seen.has(c)) continue;
    seen.add(c);
    s.searchSenders.push(c);
  }
  if (Array.isArray(sq.tags)) {
    for (const t of sq.tags) {
      if (t?.family && t?.value) {
        s.searchTags.push({ family: String(t.family), value: String(t.value) });
      }
    }
  }
  const modeRaw = (sq.mode ?? "").toString().trim().toLowerCase();
  s.searchNlMode =
    modeRaw === "lexical" || modeRaw === "semantic" || modeRaw === "hybrid" ? modeRaw : null;
  const lang = sq.language?.trim().toLowerCase();
  s.searchLanguageFilter = lang && lang.length > 0 ? lang : null;
  if (sq.mailbox?.trim()) {
    s.searchMailboxPath = sq.mailbox.trim();
    s.searchScope = "mailbox";
  }
  const aid = sq.accountId?.trim();
  if (aid && accountExists(aid)) {
    s.searchAccountOverrideId = aid;
    s.searchScope = "account";
  }
}

/** Indique si le brouillon parsé apporte des modificateurs structurels. */
export function parsedSearchBarHasModifiers(parsed: ParsedSearchBar): boolean {
  return (
    parsed.scope !== undefined ||
    parsed.senders.length > 0 ||
    parsed.tags.length > 0 ||
    parsed.mailboxPath !== undefined ||
    parsed.accountRef !== undefined ||
    parsed.listFilter !== undefined ||
    parsed.newsletterRule !== undefined
  );
}

export type SearchCriteriaSnapshot = {
  text: string;
  senders: string[];
  tags: Array<{ family: string; value: string }>;
  mailboxPath: string | null;
  accountId: string | null;
  scope: "account" | "mailbox";
  listFilter: ListFilter;
  newsletterRule: { domain: string; localPart: string } | null;
  searchNlMode: SearchStructuralState["searchNlMode"];
  searchLanguageFilter: string | null;
};

function tagCompareKey(t: { family: string; value: string }): string {
  return `${t.family.trim().toLowerCase()}:${t.value.trim().toLowerCase()}`;
}

function sortedUniqueSenders(senders: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of senders) {
    const s = raw.trim().toLowerCase();
    if (!s || seen.has(s)) continue;
    seen.add(s);
    out.push(s);
  }
  out.sort();
  return out;
}

function newsletterRuleKey(
  rule: { domain: string; localPart?: string | null } | null | undefined
): string | null {
  if (!rule?.domain?.trim()) return null;
  const dom = rule.domain.trim().toLowerCase();
  const lp = (rule.localPart?.trim() || "*").toLowerCase();
  return `${dom}\0${lp}`;
}

function coerceNewsletterRule(
  rule: unknown
): { domain: string; localPart: string } | null {
  if (!rule || typeof rule !== "object") return null;
  const r = rule as { domain?: unknown; localPart?: unknown };
  if (typeof r.domain !== "string" || !r.domain.trim()) return null;
  const lp =
    typeof r.localPart === "string" && r.localPart.trim() ? r.localPart.trim() : "*";
  return { domain: r.domain.trim(), localPart: lp.toLowerCase() };
}

/** Critères structurels issus de l’état appliqué (pas le texte brut du brouillon). */
export function snapshotFromStructuralState(s: SearchStructuralState): SearchCriteriaSnapshot {
  const rule = coerceNewsletterRule(s.searchNewsletterRule);
  return {
    text: s.search.trim(),
    senders: sortedUniqueSenders(s.searchSenders),
    tags: [...s.searchTags]
      .map((t) => ({ family: String(t.family), value: String(t.value).trim() }))
      .filter((t) => t.value.length > 0)
      .sort((a, b) => tagCompareKey(a).localeCompare(tagCompareKey(b))),
    mailboxPath: s.searchMailboxPath?.trim() || null,
    accountId: s.searchAccountOverrideId?.trim() || null,
    scope: s.searchScope,
    listFilter: s.listFilter,
    newsletterRule: rule,
    searchNlMode: s.searchNlMode,
    searchLanguageFilter: s.searchLanguageFilter?.trim() || null,
  };
}

export function searchCriteriaSnapshotsEqual(
  a: SearchCriteriaSnapshot,
  b: SearchCriteriaSnapshot
): boolean {
  if (a.text !== b.text) return false;
  if (a.scope !== b.scope) return false;
  if (a.listFilter !== b.listFilter) return false;
  if (a.mailboxPath !== b.mailboxPath) return false;
  if (a.accountId !== b.accountId) return false;
  if (a.searchNlMode !== b.searchNlMode) return false;
  if (a.searchLanguageFilter !== b.searchLanguageFilter) return false;
  if (newsletterRuleKey(a.newsletterRule) !== newsletterRuleKey(b.newsletterRule)) return false;
  if (a.senders.length !== b.senders.length) return false;
  for (let i = 0; i < a.senders.length; i++) {
    if (a.senders[i] !== b.senders[i]) return false;
  }
  if (a.tags.length !== b.tags.length) return false;
  for (let i = 0; i < a.tags.length; i++) {
    if (tagCompareKey(a.tags[i]!) !== tagCompareKey(b.tags[i]!)) return false;
  }
  return true;
}

/** Au moins un critère enregistrable comme vue (hors listFilter seul « all »). */
export function hasSavableSearchCriteria(s: SearchCriteriaSnapshot): boolean {
  return Boolean(
    s.text ||
      s.senders.length > 0 ||
      s.mailboxPath ||
      s.accountId ||
      s.tags.length > 0 ||
      s.newsletterRule ||
      s.searchLanguageFilter ||
      s.listFilter !== "all" ||
      s.searchNlMode
  );
}

/** Recherche / vue ciblée (texte, @, #, tag…) — pas la simple navigation « Réception » ni un filtre liste seul. */
export function hasCommittedSearchCriteria(s: SearchCriteriaSnapshot): boolean {
  return Boolean(
    s.text?.trim() ||
      s.senders.length > 0 ||
      s.mailboxPath?.trim() ||
      s.accountId?.trim() ||
      s.tags.length > 0 ||
      s.newsletterRule ||
      s.searchLanguageFilter?.trim() ||
      s.searchNlMode
  );
}
