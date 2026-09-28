import type { CleanedMessageView, ThreadRecipientPresenceEvents } from "../types";
import { escapeHtml } from "../../ui/sanitize";
import { canonicalEmailForNlMatch } from "./searchAccountResolve";
import { sortMessagesByReceivedAscending } from "./threadMessageSort";

/**
 * Boucle d’un message = From ∪ To ∪ Cc. C’est qui a eu l’info de ce mail.
 * À et Cc comptent pareil : changer de rôle n’est ni un ajout ni une exclusion.
 * On compare chaque message au précédent dont l’enveloppe est connue.
 * Le premier ne liste personne : il fixe qui avait l’info au départ.
 * Une enveloppe vide ou absente ne fabrique pas d’exclusion.
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
  return count > 1 ? "Exclus de la boucle" : "Exclu de la boucle";
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
  _ownEmail?: string | null,
): Map<string, ThreadRecipientPresenceEvents> {
  void _ownEmail;
  const asc = sortMessagesByReceivedAscending(messages);
  let previous: Map<string, LoopPerson> | null = null;
  const out = new Map<string, ThreadRecipientPresenceEvents>();

  for (let index = 0; index < asc.length; index += 1) {
    const msg = asc[index]!;
    if (!envelopeKnown(msg)) {
      if (!previous || index === 0) continue;
      const sender = personFrom((msg.senderEmail ?? "").trim() || msg.sender, msg.sender);
      if (!sender || previous.has(sender.key)) continue;
      const withSender: Map<string, LoopPerson> = new Map(previous);
      withSender.set(sender.key, sender);
      previous = withSender;
      out.set(msg.messageId, { added: [toEvent(sender)], removed: [] });
      continue;
    }

    const loop = loopOf(msg);
    if (!previous) {
      previous = loop;
      continue;
    }

    const added: LoopPerson[] = [];
    for (const person of loop.values()) {
      if (!previous.has(person.key)) added.push(person);
    }
    const removed: LoopPerson[] = [];
    for (const person of previous.values()) {
      if (!loop.has(person.key)) removed.push(person);
    }
    previous = loop;
    if (added.length || removed.length) {
      out.set(msg.messageId, { added: added.map(toEvent), removed: removed.map(toEvent) });
    }
  }

  return out;
}
