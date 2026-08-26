/** Analyse des jetons `#` / `@` dans la barre de recherche avant validation. */

import type { NewsletterRuleRef } from "./hashAutocomplete";

export type SearchBarTag = {
  family: string;
  value: string;
};

export type ParsedSearchBar = {
  text: string;
  scope?: "account" | "mailbox";
  /** Dossier explicite (`#local:Perso`). */
  mailboxPath?: string | null;
  /** Compte (`#compte` ou `#compte:email`). */
  accountRef?: string | null;
  senders: string[];
  tags: SearchBarTag[];
  listFilter?: "all" | "unread" | "starred" | "focused" | "auto";
  newsletterRule?: NewsletterRuleRef | null;
  /** `#last:Nd` — filtrer les N derniers jours. */
  relativeDays?: number;
  /** `#pj` / `has:attachment` — avec pièce jointe. */
  hasAttachment?: boolean;
  /** `#security:N` / `#security:>=N` — score minimum. */
  minSecurityScore?: number;
  /** `#archive` → préfixe boîte (hint pour `mailbox_prefix`). */
  mailboxPrefix?: string | null;
};

const RX_SCOPE_ACCOUNT = /#compte(?::([^\s#]+))?\b/gi;
/** Chemin entre guillemets ou sans espace (`#local:"Perso/Archives"` ou `#local:INBOX.Archives`). */
const RX_SCOPE_MAILBOX_NAMED =
  /#(?:local|dossier|ici):(?:"([^"]+)"|'([^']+)'|([^\s#]+))/gi;
const RX_SCOPE_MAILBOX = /#(?:local|dossier|ici|boite|boîte)\b/gi;
const RX_SCOPE_ACCOUNT_LEGACY = /#(?:all|tout)\b/gi;
const RX_SENDER_EMAIL = /@([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g;
/** Adresse seule sans `@` devant (ex. `noreply@ionos.fr`). */
const RX_BARE_EMAIL = /\b([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})\b/gi;
/** Domaine seul pour filtrer expéditeurs (ex. `ionos.fr`). */
const RX_DOMAIN_TOKEN = /\b(@?([a-z0-9][a-z0-9.-]*\.[a-z]{2,}))\b/gi;
const RX_RULE_STAR = /#(\*\.[a-z0-9][a-z0-9.-]*)/gi;
const RX_TAG =
  /#(?:tag:)?(source|kind|entity|state):([^\s#,]+)/gi;

const FILTER_TAGS: Array<{ rx: RegExp; filter: ParsedSearchBar["listFilter"] }> = [
  { rx: /#auto\b/gi, filter: "auto" },
  { rx: /#(?:priorité|priorite|prio|focused)\b/gi, filter: "focused" },
  { rx: /#(?:nonlus|unread)\b/gi, filter: "unread" },
  { rx: /#(?:suivis|starred|suivi)\b/gi, filter: "starred" },
  { rx: /#(?:tout|all)\b/gi, filter: "all" },
];

/** Raccourcis vers des tags `state:*` (recherche barre). */
const TAG_SHORTCUTS: Array<{ rx: RegExp; tag: SearchBarTag }> = [
  {
    rx: /#(?:pj|piece|pièce|pieces|pièces|attachment|attach|jointe?s?)\b/gi,
    tag: { family: "state", value: "attachment" },
  },
];

/** `has:attachment` (sans `#`) — même sémantique que `#pj`. */
const RX_HAS_ATTACHMENT = /has:attachment\b/gi;
/** `#last:7d` / `#last:30d` / `#last:Nd`. */
const RX_LAST_DAYS = /#last:(\d+)d\b/gi;
/** `#security:50` ou `#security:>=50`. */
const RX_SECURITY_SCORE = /#security:(?:>=)?(\d+(?:\.\d+)?)\b/gi;
/** `#archive` → préfixe Archive. */
const RX_ARCHIVE = /#archive\b/gi;

/** Test booléen sans effet de bord `lastIndex` (évite les faux négatifs avec flag `g`). */
function regexHasMatch(rx: RegExp, s: string): boolean {
  const flags = rx.flags.replace(/g/g, "");
  return new RegExp(rx.source, flags).test(s);
}

function stripToken(rest: string, rx: RegExp): string {
  return rest.replace(rx, " ");
}

function matchNewsletterRule(token: string, rules: NewsletterRuleRef[]): NewsletterRuleRef | null {
  const t = token.trim().toLowerCase();
  if (!t) return null;
  for (const r of rules) {
    const label = (r.localPart ?? "*").toLowerCase() === "*" ? `*.${r.domain}` : `${r.localPart}@${r.domain}`;
    if (label.toLowerCase() === t) return r;
    if (t === r.domain.toLowerCase()) return r;
    if (t === `*.${r.domain.toLowerCase()}`) return r;
  }
  return null;
}

function tagFromParts(family: string, value: string): SearchBarTag | null {
  const f = family.trim().toLowerCase();
  const v = value.trim();
  if (!v) return null;
  if (f === "source" || f === "kind" || f === "entity" || f === "state") {
    return { family: f, value: v };
  }
  return null;
}

function mergeTag(tags: SearchBarTag[], tag: SearchBarTag | null): void {
  if (!tag) return;
  const key = `${tag.family}:${tag.value}`.toLowerCase();
  if (tags.some((t) => `${t.family}:${t.value}`.toLowerCase() === key)) return;
  tags.push(tag);
}

export function parseSearchBarDraft(draft: string, newsletterRules: NewsletterRuleRef[]): ParsedSearchBar {
  let rest = draft;
  const out: ParsedSearchBar = { text: "", senders: [], tags: [] };

  let m: RegExpExecArray | null;
  RX_SCOPE_ACCOUNT.lastIndex = 0;
  while ((m = RX_SCOPE_ACCOUNT.exec(rest)) !== null) {
    out.scope = "account";
    const ref = m[1]?.trim();
    if (ref) out.accountRef = ref;
    rest = rest.replace(m[0], " ");
  }
  if (regexHasMatch(RX_SCOPE_ACCOUNT_LEGACY, rest)) {
    out.scope = "account";
    rest = stripToken(rest, RX_SCOPE_ACCOUNT_LEGACY);
  }

  RX_SCOPE_MAILBOX_NAMED.lastIndex = 0;
  while ((m = RX_SCOPE_MAILBOX_NAMED.exec(rest)) !== null) {
    out.scope = "mailbox";
    out.mailboxPath = (m[1] ?? m[2] ?? m[3] ?? "").trim();
    rest = rest.replace(m[0], " ");
  }
  if (regexHasMatch(RX_SCOPE_MAILBOX, rest)) {
    out.scope = "mailbox";
    rest = stripToken(rest, RX_SCOPE_MAILBOX);
  }

  for (const { rx, filter } of FILTER_TAGS) {
    if (regexHasMatch(rx, rest)) {
      out.listFilter = filter;
      rest = stripToken(rest, rx);
    }
  }

  RX_LAST_DAYS.lastIndex = 0;
  {
    const lastDaysRx = new RegExp(RX_LAST_DAYS.source, "gi");
    let lastDays: RegExpExecArray | null;
    while ((lastDays = lastDaysRx.exec(rest)) !== null) {
      const n = Number.parseInt(lastDays[1] ?? "", 10);
      if (Number.isFinite(n) && n > 0) out.relativeDays = n;
    }
    if (out.relativeDays !== undefined) rest = stripToken(rest, RX_LAST_DAYS);
  }

  RX_SECURITY_SCORE.lastIndex = 0;
  {
    const secRx = new RegExp(RX_SECURITY_SCORE.source, "gi");
    let sec: RegExpExecArray | null;
    while ((sec = secRx.exec(rest)) !== null) {
      const n = Number.parseFloat(sec[1] ?? "");
      if (Number.isFinite(n)) out.minSecurityScore = n;
    }
    if (out.minSecurityScore !== undefined) rest = stripToken(rest, RX_SECURITY_SCORE);
  }

  if (regexHasMatch(RX_ARCHIVE, rest)) {
    out.mailboxPrefix = "Archive";
    rest = stripToken(rest, RX_ARCHIVE);
  }

  RX_TAG.lastIndex = 0;
  while ((m = RX_TAG.exec(rest)) !== null) {
    mergeTag(out.tags, tagFromParts(m[1], m[2]));
    rest = rest.replace(m[0], " ");
  }

  for (const { rx, tag } of TAG_SHORTCUTS) {
    if (regexHasMatch(rx, rest)) {
      mergeTag(out.tags, tag);
      if (tag.family === "state" && tag.value === "attachment") {
        out.hasAttachment = true;
      }
      rest = stripToken(rest, rx);
    }
  }

  if (regexHasMatch(RX_HAS_ATTACHMENT, rest)) {
    out.hasAttachment = true;
    rest = stripToken(rest, RX_HAS_ATTACHMENT);
  }

  let ruleMatch: RegExpExecArray | null;
  RX_RULE_STAR.lastIndex = 0;
  while ((ruleMatch = RX_RULE_STAR.exec(rest)) !== null) {
    const rule = matchNewsletterRule(ruleMatch[1], newsletterRules);
    if (rule) {
      out.newsletterRule = rule;
      rest = rest.replace(ruleMatch[0], " ");
      break;
    }
  }

  const seenSenders = new Set<string>();
  const pushSender = (email: string) => {
    const e = email.trim().toLowerCase();
    if (!e || seenSenders.has(e)) return;
    seenSenders.add(e);
    out.senders.push(e);
  };

  RX_SENDER_EMAIL.lastIndex = 0;
  while ((m = RX_SENDER_EMAIL.exec(rest)) !== null) {
    pushSender(m[1]);
    rest = rest.replace(m[0], " ");
  }

  RX_BARE_EMAIL.lastIndex = 0;
  while ((m = RX_BARE_EMAIL.exec(rest)) !== null) {
    pushSender(m[1]);
    rest = rest.replace(m[0], " ");
  }

  RX_DOMAIN_TOKEN.lastIndex = 0;
  while ((m = RX_DOMAIN_TOKEN.exec(rest)) !== null) {
    // Ne transforme pas agressivement tout domaine en expéditeur.
    // On ne considère un domaine comme expéditeur que si l’utilisateur l’a préfixé par '@' (ex. '@ionos.fr').
    const rawToken = (m[1] ?? "").trim();
    const hasAtPrefix = rawToken.startsWith("@");
    if (!hasAtPrefix) continue;
    const domain = m[2].trim().toLowerCase();
    if (domain && !domain.includes("@")) pushSender(domain);
    rest = rest.replace(m[0], " ");
  }

  out.text = rest.replace(/\s+/g, " ").trim();
  return out;
}
