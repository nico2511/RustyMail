import { isSavedDraftsVirtualMailbox } from "../../mailboxKinds";
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

export function resolveSearchMailboxPath(requested: string): string | null {
  const q = requested.trim();
  if (!q || isSavedDraftsVirtualMailbox(q)) return null;
  const mbs = state.mailboxes;
  const exact = resolveMailboxInList(mbs, q);
  if (exact) return exact;

  const wantKey = mailboxLogicalPathKey(q);
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
    return ml === qlc || leaf === qlc || ml.includes(qlc) || leaf.includes(qlc);
  });
  if (partial.length === 1) return partial[0];

  return q;
}
