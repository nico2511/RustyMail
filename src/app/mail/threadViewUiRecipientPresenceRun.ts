import { currentAccount } from "../core/accountContext";
import type { CleanedMessageView, ThreadRecipientPresenceEvents } from "../types";
import { canonicalEmailForNlMatch } from "./searchAccountResolve";
import { sortMessagesByReceivedAscending } from "./threadMessageSort";

export function normalizeRecipientEmailForDiff(email: string): string {
  return email.trim().toLowerCase();
}

export function recipientMapForDiff(msg: CleanedMessageView): Map<string, { name?: string | null; email: string }> {
  const m = new Map<string, { name?: string | null; email: string }>();
  for (const r of msg.recipients ?? []) {
    const k = normalizeRecipientEmailForDiff(r.email ?? "");
    if (!k) continue;
    if (!m.has(k)) m.set(k, r);
  }
  return m;
}

export function threadRecipientPresenceEventsByMessageId(
  messages: CleanedMessageView[],
): Map<string, ThreadRecipientPresenceEvents> {
  const asc = sortMessagesByReceivedAscending(messages);
  const firstIndex = new Map<string, number>();
  const lastIndex = new Map<string, number>();
  const firstInfo = new Map<string, { name?: string | null; email: string }>();
  const lastInfo = new Map<string, { name?: string | null; email: string }>();

  const acc = currentAccount();
  const ownEmailLower = acc?.email?.trim().toLowerCase() ?? "";
  const ownCanon = canonicalEmailForNlMatch(acc?.email ?? "") ?? "";
  const isOwnRecipientKey = (k: string): boolean => {
    if (!k) return false;
    if (ownEmailLower && k === ownEmailLower) return true;
    if (ownCanon) {
      const kCanon = canonicalEmailForNlMatch(k);
      if (kCanon) return kCanon === ownCanon;
    }
    return false;
  };

  // Certains messages n’ont pas d’enveloppe To/Cc remontée (recipients absent/vides).
  // On évite de générer de faux "+ To/Cc" en prenant le 1er message avec enveloppe connue comme baseline.
  let firstKnownIdx = -1;
  let lastKnownIdx = -1;
  let maxEnvelopeSize = 0;

  for (let i = 0; i < asc.length; i++) {
    const msg = asc[i]!;
    const env = recipientMapForDiff(msg);
    if (env.size > maxEnvelopeSize) maxEnvelopeSize = env.size;
    if (env.size === 0) continue;
    if (firstKnownIdx < 0) firstKnownIdx = i;
    lastKnownIdx = i;
    for (const [k, r] of env) {
      if (isOwnRecipientKey(k)) continue;
      if (!firstIndex.has(k)) {
        firstIndex.set(k, i);
        firstInfo.set(k, r);
      }
      lastIndex.set(k, i);
      lastInfo.set(k, r);
    }
  }

  // En 1-to-1, l’enveloppe To/Cc dépend du sens (entrant vs sortant) et produit des faux “ajouts”.
  // On n’affiche ces événements que si l’enveloppe est réellement "groupe" (≥2 destinataires).
  if (maxEnvelopeSize <= 1) return new Map();

  const out = new Map<string, ThreadRecipientPresenceEvents>();
  const get = (id: string): ThreadRecipientPresenceEvents => {
    const hit = out.get(id);
    if (hit) return hit;
    const created: ThreadRecipientPresenceEvents = { added: [], removed: [] };
    out.set(id, created);
    return created;
  };

  for (const [k, idx] of firstIndex) {
    // Baseline : 1ère enveloppe connue — on ne sait pas ce qui était avant, donc pas d’“ajout”.
    if (idx === firstKnownIdx) continue;
    const msg = asc[idx];
    if (!msg) continue;
    const info = firstInfo.get(k);
    if (!info) continue;
    get(msg.messageId).added.push(info);
  }

  for (const [k, idx] of lastIndex) {
    // Dernière enveloppe connue (ou fin du fil) : ne pas afficher un “retiré” sans preuve.
    if (idx === lastKnownIdx || idx >= asc.length - 1) continue;
    const msg = asc[idx];
    if (!msg) continue;
    const info = lastInfo.get(k);
    if (!info) continue;
    get(msg.messageId).removed.push(info);
  }

  return out;
}
