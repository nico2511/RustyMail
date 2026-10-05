import {
  isInboxLikeMailbox,
  isSavedDraftsVirtualMailbox,
  isVirtualMailbox,
} from "../../mailboxKinds";
import { mailboxLogicalPathKey } from "./mailboxPathKeys";
import { state } from "../state";

export function resolveMailboxInList(mailboxes: string[], selected: string | undefined): string | undefined {
  const sel = String(selected ?? "");
  if (!mailboxes.length) return undefined;
  if (mailboxes.includes(sel)) return sel;
  const nk = sel.normalize("NFC");
  for (const m of mailboxes) {
    if (m.normalize("NFC") === nk) return m;
  }
  const trimmed = sel.trim();
  if (!trimmed) return undefined;
  const trimMatches = mailboxes.filter((m) => m.trim() === trimmed);
  if (trimMatches.length === 1) return trimMatches[0];
  return undefined;
}

function searchableMailboxes(): string[] {
  return (state.mailboxes ?? []).filter((m) => m.trim() && !isVirtualMailbox(m));
}

/** Résout un `#dossier:…` vers un nom IMAP réel. Évite les faux positifs (`__UNIFIED_INBOX__`, etc.). */
export function resolveSearchMailboxPath(requested: string): string | null {
  const q = requested.trim();
  if (!q || isSavedDraftsVirtualMailbox(q) || isVirtualMailbox(q)) return null;
  const mbs = searchableMailboxes();
  const exact = resolveMailboxInList(mbs, q);
  if (exact) return exact;

  const wantKey = mailboxLogicalPathKey(q);
  // Clé vide = « INBOX » pur : ne matcher que les boîtes inbox-like, pas tout ce qui contient « inbox ».
  if (!wantKey) {
    const inboxHits = mbs.filter((m) => isInboxLikeMailbox(m));
    if (inboxHits.length === 1) return inboxHits[0];
    if (inboxHits.length > 1) {
      return [...inboxHits].sort((a, b) => a.length - b.length)[0] ?? null;
    }
    return "INBOX";
  }

  const keyMatches = mbs.filter((m) => mailboxLogicalPathKey(m) === wantKey);
  if (keyMatches.length === 1) return keyMatches[0];
  if (keyMatches.length > 1) {
    return [...keyMatches].sort((a, b) => b.length - a.length)[0] ?? null;
  }

  const qlc = q.toLowerCase();
  const leafExact = mbs.filter((m) => (m.split("/").pop() ?? m).toLowerCase() === qlc);
  if (leafExact.length === 1) return leafExact[0];

  const partial = mbs.filter((m) => {
    const ml = m.toLowerCase();
    const leaf = (m.split("/").pop() ?? m).toLowerCase();
    return ml === qlc || leaf === qlc;
  });
  if (partial.length === 1) return partial[0];

  return q;
}
