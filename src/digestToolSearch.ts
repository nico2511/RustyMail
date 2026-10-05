/** Recherche partagée Éditeur de découpe / Banc d'essai : multi-compte + fallback sans dossier. */

import { invoke } from "@tauri-apps/api/core";
import { currentAccount } from "./app/core/accountContext";
import { isDemoPlaygroundAccountId } from "./app/core/demoAccount";
import { state } from "./app/state";
import type { ThreadListItem } from "./app/types";
import { buildDigestBenchSearchQuery } from "./digestBenchQuery";
import type { NewsletterRuleRef } from "./hashAutocomplete";
import type { SearchQueryPayload } from "./searchQueryBuild";

function preferredAccountIds(primary: string): string[] {
  const primaryId = primary.trim();
  const real = state.accounts
    .map((a) => a.id.trim())
    .filter((id) => id && !isDemoPlaygroundAccountId(id));
  const demo = state.accounts
    .map((a) => a.id.trim())
    .filter((id) => id && isDemoPlaygroundAccountId(id));
  const ordered: string[] = [];
  const push = (id: string) => {
    if (id && !ordered.includes(id)) ordered.push(id);
  };
  // Compte actif d'abord s'il n'est pas la démo (ou s'il n'y a que la démo).
  if (primaryId && (!isDemoPlaygroundAccountId(primaryId) || real.length === 0)) {
    push(primaryId);
  }
  for (const id of real) push(id);
  for (const id of demo) push(id);
  if (!ordered.length && primaryId) push(primaryId);
  return ordered;
}

function stripMailbox(query: SearchQueryPayload): SearchQueryPayload {
  return { ...query, mailbox: null, mailboxPrefix: null };
}

async function searchOne(query: SearchQueryPayload): Promise<ThreadListItem[]> {
  return invoke<ThreadListItem[]>("search_threads", { query });
}

export function resolveDigestSearchAccountId(): string {
  const raw = currentAccount()?.id?.trim() || state.selectedAccountId?.trim() || "";
  if (raw && !isDemoPlaygroundAccountId(raw)) return raw;
  const real = state.accounts.find((a) => !isDemoPlaygroundAccountId(a.id));
  if (real?.id?.trim()) return real.id.trim();
  return raw;
}

/**
 * Cherche sur le compte actif, puis les autres comptes IMAP, avec repli sans `#dossier`
 * si le filtre boîte vide la liste.
 */
export async function searchDigestToolThreads(opts: {
  draft: string;
  newsletterRules: NewsletterRuleRef[];
  archiveRoot?: string;
}): Promise<ThreadListItem[]> {
  const draft = opts.draft.trim();
  if (!draft) return [];
  const accountIds = preferredAccountIds(resolveDigestSearchAccountId());
  if (!accountIds.length) return [];

  const archiveRoot = opts.archiveRoot ?? state.appPrefs.general.archiveRoot ?? "Archive";
  const seen = new Set<string>();
  const merged: ThreadListItem[] = [];

  for (const accountId of accountIds) {
    const base = buildDigestBenchSearchQuery({
      draft,
      accountId,
      newsletterRules: opts.newsletterRules,
      archiveRoot,
    });
    let hits = await searchOne(base);
    if (hits.length === 0 && (base.mailbox || base.mailboxPrefix)) {
      hits = await searchOne(stripMailbox(base));
    }
    for (const t of hits) {
      const id = String(t.id ?? "").trim();
      if (!id || seen.has(id)) continue;
      seen.add(id);
      merged.push(t);
    }
    // Dès qu'un compte réel répond, on s'arrête (évite de mélanger démo + IMAP).
    if (merged.length && !isDemoPlaygroundAccountId(accountId)) break;
  }
  return merged;
}
