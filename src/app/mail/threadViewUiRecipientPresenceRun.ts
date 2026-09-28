import { currentAccount } from "../core/accountContext";
import type { CleanedMessageView, ThreadRecipientPresenceEvents } from "../types";
import { escapeHtml } from "../../ui/sanitize";
import { canonicalEmailForNlMatch } from "./searchAccountResolve";
import { sortMessagesByReceivedAscending } from "./threadMessageSort";

/**
 * Boucle d’un message = From ∪ To ∪ Cc.
 * To et Cc sont la même appartenance : passer de l’un à l’autre n’est ni un ajout ni un retrait.
 * Le premier message qui a une enveloppe sert de référence, sans événement.
 * Un message suivant ne retire quelqu’un que s’il ressemble encore à un reply-all
 * (la majorité du groupe précédent est là, et au moins trois personnes restent).
 * Une réponse étroite (reply, pas reply-all) peut ajouter un intervenant, pas vider la boucle.
 */

const PLACEHOLDER_EMAIL = "unknown@invalid";

type LoopPerson = { key: string; email: string; name: string | null };

export function normalizeRecipientEmailForDiff(email: string): string {
  return canonicalEmailForNlMatch(email) ?? "";
}

export function recipientMapForDiff(msg: CleanedMessageView): Map<string, { name?: string | null; email: string }> {
  const m = new Map<string, { name?: string | null; email: string }>();
  for (const r of msg.recipients ?? []) {
    const person = personFrom(r.email ?? "", r.name);
    if (!person || m.has(person.key)) continue;
    m.set(person.key, { name: person.name, email: person.email });
  }
  return m;
}

function readableName(name: string | null | undefined, email: string): string | null {
  let trimmed = name?.trim() ?? "";
  if (!trimmed) return null;
  const wrapped = trimmed.match(/^(.*?)<([^<>]+)>\s*$/);
  if (wrapped) {
    const innerKey = normalizeRecipientEmailForDiff(wrapped[2] ?? "");
    const emailKey = normalizeRecipientEmailForDiff(email);
    if (innerKey && emailKey && innerKey === emailKey) {
      trimmed = wrapped[1].replace(/^[\s"']+|[\s"']+$/g, "").trim();
    }
  }
  if (!trimmed || nameMatchesEmail(trimmed, email)) return null;
  return trimmed;
}

function nameMatchesEmail(name: string, email: string): boolean {
  const trimmed = name.trim();
  if (!trimmed || trimmed.includes("<") || /\s/.test(trimmed)) return false;
  const nameKey = normalizeRecipientEmailForDiff(trimmed);
  const emailKey = normalizeRecipientEmailForDiff(email);
  if (!nameKey || !emailKey) return trimmed.toLowerCase() === email.trim().toLowerCase();
  return nameKey === emailKey;
}

function personFrom(email: string, name?: string | null): LoopPerson | null {
  const key = normalizeRecipientEmailForDiff(email);
  if (!key || key === PLACEHOLDER_EMAIL) return null;
  return { key, email: key, name: readableName(name, key) };
}

function mergePerson(prev: LoopPerson, next: LoopPerson): LoopPerson {
  const email = next.email || prev.email;
  return {
    key: next.key,
    email,
    name: readableName(next.name, email) ?? readableName(prev.name, email),
  };
}

function loopOf(msg: CleanedMessageView): Map<string, LoopPerson> {
  const map = new Map<string, LoopPerson>();
  const put = (email: string, name?: string | null) => {
    const person = personFrom(email, name);
    if (!person) return;
    const prev = map.get(person.key);
    map.set(person.key, prev ? mergePerson(prev, person) : person);
  };
  const senderEmail = (msg.senderEmail ?? "").trim();
  put(senderEmail || msg.sender, msg.sender);
  for (const recipient of msg.recipients ?? []) put(recipient.email ?? "", recipient.name);
  return map;
}

function envelopeKnown(msg: CleanedMessageView): boolean {
  return (msg.recipients ?? []).some((recipient) => Boolean(personFrom(recipient.email ?? "", recipient.name)));
}

/** Reply-all : on garde le groupe. Reply : l’enveloppe se réduit à un ou deux interlocuteurs. */
function isBroadLoopUpdate(active: Map<string, LoopPerson>, loop: Map<string, LoopPerson>): boolean {
  if (active.size === 0) return false;
  let kept = 0;
  for (const key of active.keys()) if (loop.has(key)) kept += 1;
  const dropped = active.size - kept;
  if (dropped === 0) return true;
  return kept >= 3 && dropped < kept;
}

function toEvent(person: LoopPerson): { name?: string | null; email: string } {
  return { name: person.name, email: person.email };
}

export function formatParticipantIdentity(
  name: string | null | undefined,
  email: string,
): { label: string; detail: string | null } {
  const trimmedEmail = email.trim();
  const display = readableName(name, trimmedEmail);
  if (!trimmedEmail) return { label: display ?? "", detail: null };
  if (!display) return { label: trimmedEmail, detail: null };
  return { label: display, detail: trimmedEmail };
}

export function loopChangeKicker(kind: "added" | "removed", count: number): string {
  if (kind === "added") return count > 1 ? "Ajoutés à la boucle" : "Ajouté à la boucle";
  return count > 1 ? "Retirés de la boucle" : "Retiré de la boucle";
}

export function renderParticipantMention(name: string | null | undefined, email: string): string {
  const identity = formatParticipantIdentity(name, email);
  const who = `<strong>${escapeHtml(identity.label)}</strong>`;
  if (!identity.detail) return who;
  return `${who} <span class="dim thread-timeline-note__addr">&lt;${escapeHtml(identity.detail)}&gt;</span>`;
}

function plainParticipantList(people: Array<{ name?: string | null; email: string }>): string {
  return people.map((person) => formatParticipantIdentity(person.name, person.email).label).join(", ");
}

export function renderThreadLoopChangeNote(
  events: ThreadRecipientPresenceEvents | undefined,
  glyphHtml = "",
): string {
  if (!events || (!events.added.length && !events.removed.length)) return "";
  const block = (kind: "added" | "removed", people: ThreadRecipientPresenceEvents["added"]) => {
    if (!people.length) return "";
    const modifier = kind === "added" ? "add" : "rem";
    const mentions = people.map((person) => renderParticipantMention(person.name, person.email)).join(
      '<span class="thread-timeline-note__sep">, </span>',
    );
    return `<span class="thread-timeline-note__block">
      <span class="thread-timeline-note__kicker thread-timeline-note__kicker--${modifier}">${escapeHtml(loopChangeKicker(kind, people.length))}</span>
      <span class="thread-timeline-note__who">${mentions}</span>
    </span>`;
  };
  const summary = [
    events.added.length ? `${loopChangeKicker("added", events.added.length)} : ${plainParticipantList(events.added)}` : "",
    events.removed.length
      ? `${loopChangeKicker("removed", events.removed.length)} : ${plainParticipantList(events.removed)}`
      : "",
  ]
    .filter(Boolean)
    .join(". ");
  const glyph = glyphHtml
    ? `<span class="thread-timeline-note__glyph" aria-hidden="true">${glyphHtml}</span>`
    : "";
  return `<div class="thread-timeline-note" role="note" aria-label="${escapeHtml(summary)}">
    ${glyph}
    <span class="thread-timeline-note__text-wrap">
      ${block("added", events.added)}
      ${block("removed", events.removed)}
    </span>
  </div>`;
}

export function threadRecipientPresenceEventsByMessageId(
  messages: CleanedMessageView[],
  ownEmail?: string | null,
): Map<string, ThreadRecipientPresenceEvents> {
  const asc = sortMessagesByReceivedAscending(messages);
  const rawOwn = ownEmail !== undefined ? (ownEmail ?? "") : (currentAccount()?.email ?? "");
  const ownKey = normalizeRecipientEmailForDiff(rawOwn);
  const seen = new Set<string>();
  const active = new Map<string, LoopPerson>();
  let hasBaseline = false;
  const out = new Map<string, ThreadRecipientPresenceEvents>();

  const remember = (loop: Map<string, LoopPerson>) => {
    for (const [key, person] of loop) {
      seen.add(key);
      const prev = active.get(key);
      if (prev) active.set(key, mergePerson(prev, person));
    }
  };

  for (let index = 0; index < asc.length; index += 1) {
    const msg = asc[index]!;
    if (!envelopeKnown(msg)) {
      if (index === 0 || !hasBaseline) continue;
      const sender = personFrom((msg.senderEmail ?? "").trim() || msg.sender, msg.sender);
      if (!sender || seen.has(sender.key) || sender.key === ownKey) continue;
      seen.add(sender.key);
      out.set(msg.messageId, { added: [toEvent(sender)], removed: [] });
      continue;
    }

    const loop = loopOf(msg);
    if (!hasBaseline) {
      for (const [key, person] of loop) {
        seen.add(key);
        active.set(key, person);
      }
      hasBaseline = true;
      continue;
    }

    const added: LoopPerson[] = [];
    for (const person of loop.values()) {
      if (!seen.has(person.key)) added.push(person);
    }

    const removed: LoopPerson[] = [];
    if (isBroadLoopUpdate(active, loop)) {
      for (const person of active.values()) {
        if (!loop.has(person.key)) removed.push(person);
      }
      const next = new Map<string, LoopPerson>();
      for (const [key, person] of loop) {
        const prev = active.get(key);
        next.set(key, prev ? mergePerson(prev, person) : person);
      }
      if (ownKey && active.has(ownKey) && !next.has(ownKey)) next.set(ownKey, active.get(ownKey)!);
      active.clear();
      for (const [key, person] of next) active.set(key, person);
      for (const person of removed) {
        if (person.key !== ownKey) seen.delete(person.key);
      }
    }

    remember(loop);

    const addedPublic = added.filter((person) => person.key !== ownKey).map(toEvent);
    const removedPublic = removed.filter((person) => person.key !== ownKey).map(toEvent);
    if (addedPublic.length || removedPublic.length) {
      out.set(msg.messageId, { added: addedPublic, removed: removedPublic });
    }
  }

  return out;
}
