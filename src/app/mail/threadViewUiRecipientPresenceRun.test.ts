import { describe, expect, it } from "vitest";
import type { CleanedMessageView } from "../types";
import {
  formatParticipantIdentity,
  renderParticipantMention,
  renderThreadLoopChangeNote,
  threadRecipientPresenceEventsByMessageId,
} from "./threadViewUiRecipientPresenceRun";

const OWN = "moi@exemple.fr";

function addr(name: string, email: string) {
  return { name, email };
}

function msg(
  messageId: string,
  receivedAt: string,
  from: { name: string; email: string },
  recipients: Array<{ name?: string | null; email: string }> | undefined,
): CleanedMessageView {
  return {
    messageId,
    sender: from.name,
    senderEmail: from.email,
    receivedAt,
    sourceText: "",
    cleanedText: "",
    attachments: [],
    collapsedQuotes: [],
    dimmedBlocks: [],
    recipients,
    tags: [],
    entities: [],
  };
}

const alice = addr("Alice Martin", "alice@exemple.fr");
const bob = addr("Bob Martin", "bob@exemple.fr");
const carol = addr("Carol Martin", "carol@exemple.fr");
const dave = addr("Dave Martin", "dave@exemple.fr");
const me = addr("Nicolas", OWN);

function group() {
  return [me, bob, carol, dave];
}

function diff(messages: CleanedMessageView[]) {
  return threadRecipientPresenceEventsByMessageId(messages, OWN);
}

function emails(messages: CleanedMessageView[], id: string, kind: "added" | "removed") {
  return (diff(messages).get(id)?.[kind] ?? []).map((person) => person.email);
}

describe("diff de la boucle entre deux mails", () => {
  it("ne signale personne sur le premier message", () => {
    const events = diff([msg("m1", "2026-09-17T09:00:00", alice, group())]);
    expect(events.size).toBe(0);
  });

  it("ne signale rien quand le reply-all garde le même ensemble", () => {
    const events = diff([
      msg("m1", "2026-09-17T09:00:00", alice, group()),
      msg("m2", "2026-09-17T10:00:00", bob, [alice, me, carol, dave]),
    ]);
    expect(events.size).toBe(0);
  });

  it("traite À et Cc comme la même boucle", () => {
    const events = diff([
      msg("m1", "2026-09-17T09:00:00", alice, [me, bob, carol, dave]),
      msg("m2", "2026-09-17T10:00:00", bob, [dave, carol, me, alice]),
    ]);
    expect(events.size).toBe(0);
  });

  it("signale un nouvel intervenant sur le message où il apparaît", () => {
    const secretariat = addr("Secrétariat", "secretariat@example.fr");
    const messages = [
      msg("m1", "2026-09-17T09:00:00", alice, group()),
      msg("m2", "2026-09-17T10:00:00", bob, [alice, me, carol, dave, secretariat]),
    ];
    const events = diff(messages);
    expect(emails(messages, "m1", "added")).toEqual([]);
    expect(events.get("m2")?.added).toEqual([{ name: "Secrétariat", email: "secretariat@example.fr" }]);
    expect(events.get("m2")?.removed).toEqual([]);
    expect(events.has("m1")).toBe(false);
  });

  it("signale un expéditeur qui n’était pas déjà dans la boucle", () => {
    const secretariat = addr("secretariat@example.fr", "secretariat@example.fr");
    const events = diff([
      msg("m1", "2026-09-17T09:00:00", alice, group()),
      msg("m2", "2026-09-17T10:00:00", secretariat, [alice, me, bob, carol, dave]),
    ]);
    expect(events.get("m2")?.added).toEqual([{ name: null, email: "secretariat@example.fr" }]);
  });

  it("ne refait pas apparaître quelqu’un qui était déjà en copie et qui écrit", () => {
    const events = diff([
      msg("m1", "2026-09-17T09:00:00", alice, group()),
      msg("m2", "2026-09-17T10:00:00", carol, [alice, me, bob, dave]),
    ]);
    expect(events.size).toBe(0);
  });

  it("retire sur le message qui exclut, pas sur le dernier message qui contenait encore la personne", () => {
    const messages = [
      msg("m1", "2026-09-17T09:00:00", alice, group()),
      msg("m2", "2026-09-17T10:00:00", bob, [alice, me, dave]),
    ];
    expect(emails(messages, "m1", "removed")).toEqual([]);
    expect(emails(messages, "m2", "removed")).toEqual(["carol@exemple.fr"]);
    expect(emails(messages, "m2", "added")).toEqual([]);
  });

  it("une réponse simple montre qui n’a pas reçu ce mail", () => {
    const messages = [
      msg("m1", "2026-09-17T09:00:00", alice, group()),
      msg("m2", "2026-09-17T10:00:00", bob, [alice]),
    ];
    expect(emails(messages, "m2", "removed")).toEqual(["moi@exemple.fr", "carol@exemple.fr", "dave@exemple.fr"]);
    expect(emails(messages, "m2", "added")).toEqual([]);
    expect(emails(messages, "m1", "removed")).toEqual([]);
  });

  it("le reply-all suivant rend l’info à ceux qui en avaient été exclus", () => {
    const messages = [
      msg("m1", "2026-09-17T09:00:00", alice, group()),
      msg("m2", "2026-09-17T10:00:00", bob, [alice]),
      msg("m3", "2026-09-17T11:00:00", alice, [me, bob, carol, dave]),
    ];
    expect(emails(messages, "m2", "removed")).toEqual(["moi@exemple.fr", "carol@exemple.fr", "dave@exemple.fr"]);
    expect(emails(messages, "m3", "added")).toEqual(["moi@exemple.fr", "carol@exemple.fr", "dave@exemple.fr"]);
    expect(emails(messages, "m3", "removed")).toEqual([]);
  });

  it("dans un fil à trois, une réponse qui oublie le tiers l’exclut", () => {
    const messages = [
      msg("m1", "2026-09-17T09:00:00", alice, [bob, carol]),
      msg("m2", "2026-09-17T10:00:00", bob, [alice]),
    ];
    expect(emails(messages, "m2", "removed")).toEqual(["carol@exemple.fr"]);
    expect(emails(messages, "m2", "added")).toEqual([]);
  });

  it("une réponse simple peut à la fois copier quelqu’un et exclure les autres", () => {
    const lawyer = addr("Maître Lamy", "lamy@cabinet.fr");
    const messages = [
      msg("m1", "2026-09-17T09:00:00", alice, group()),
      msg("m2", "2026-09-17T10:00:00", bob, [alice, lawyer]),
    ];
    expect(emails(messages, "m2", "added")).toEqual(["lamy@cabinet.fr"]);
    expect(emails(messages, "m2", "removed")).toEqual(["moi@exemple.fr", "carol@exemple.fr", "dave@exemple.fr"]);
  });

  it("peut à la fois ajouter et retirer sur un reply-all", () => {
    const secretariat = addr("Secrétariat", "secretariat@example.fr");
    const events = diff([
      msg("m1", "2026-09-17T09:00:00", alice, group()),
      msg("m2", "2026-09-17T10:00:00", secretariat, [alice, me, bob, dave]),
    ]);
    expect(events.get("m2")?.added.map((person) => person.email)).toEqual(["secretariat@example.fr"]);
    expect(events.get("m2")?.removed.map((person) => person.email)).toEqual(["carol@exemple.fr"]);
  });

  it("signale un retour dans la boucle après un vrai retrait", () => {
    const messages = [
      msg("m1", "2026-09-17T09:00:00", alice, group()),
      msg("m2", "2026-09-17T10:00:00", bob, [alice, me, dave]),
      msg("m3", "2026-09-17T11:00:00", alice, [me, bob, carol, dave]),
    ];
    const events = diff(messages);
    expect(emails(messages, "m3", "added")).toEqual(["carol@exemple.fr"]);
    expect(events.get("m2")?.removed.map((person) => person.email)).toEqual(["carol@exemple.fr"]);
  });

  it("ignore un 1-to-1 qui change seulement de sens", () => {
    const events = diff([
      msg("m1", "2026-09-17T09:00:00", alice, [me]),
      msg("m2", "2026-09-17T10:00:00", me, [alice]),
    ]);
    expect(events.size).toBe(0);
  });

  it("signale un tiers qui entre dans un 1-to-1", () => {
    const events = diff([
      msg("m1", "2026-09-17T09:00:00", alice, [me]),
      msg("m2", "2026-09-17T10:00:00", me, [alice, carol]),
    ]);
    expect(events.get("m2")?.added).toEqual([{ name: "Carol Martin", email: "carol@exemple.fr" }]);
  });

  it("signale quand le compte qui lit le fil entre dans la distribution", () => {
    const events = diff([
      msg("m1", "2026-09-17T09:00:00", alice, [bob]),
      msg("m2", "2026-09-17T10:00:00", alice, [bob, me]),
    ]);
    expect(events.get("m2")?.added).toEqual([{ name: "Nicolas", email: OWN }]);
    expect(events.get("m2")?.removed).toEqual([]);
  });

  it("déduplique la casse et un nom déjà égal à l’adresse", () => {
    const events = diff([
      msg("m1", "2026-09-17T09:00:00", alice, [me, bob, addr("Secretariat@Example.fr", "Secretariat@Example.fr"), dave]),
      msg("m2", "2026-09-17T10:00:00", bob, [alice, me, addr("secretariat@example.fr", "secretariat@example.fr"), dave]),
    ]);
    expect(events.size).toBe(0);
  });

  it("ne retire personne quand l’enveloppe suivante est vide ou inconnue", () => {
    const events = diff([
      msg("m1", "2026-09-17T09:00:00", alice, group()),
      msg("m2", "2026-09-17T10:00:00", bob, []),
      msg("m3", "2026-09-17T11:00:00", alice, undefined),
      msg("m4", "2026-09-17T12:00:00", alice, group()),
    ]);
    expect(events.size).toBe(0);
  });

  it("signale quand même un nouvel expéditeur si l’enveloppe To/Cc manque", () => {
    const secretariat = addr("secretariat@example.fr", "secretariat@example.fr");
    const events = diff([
      msg("m1", "2026-09-17T09:00:00", alice, group()),
      msg("m2", "2026-09-17T10:00:00", secretariat, []),
    ]);
    expect(events.get("m2")?.added).toEqual([{ name: null, email: "secretariat@example.fr" }]);
  });

  it("ne prend pas le premier message sans en-têtes pour une arrivée de tout le groupe", () => {
    const events = diff([
      msg("m1", "2026-09-17T09:00:00", alice, undefined),
      msg("m2", "2026-09-17T10:00:00", bob, group()),
    ]);
    expect(events.size).toBe(0);
  });

  it("compare dans l’ordre chronologique même si le fil est affiché à l’envers", () => {
    const messages = [
      msg("m2", "2026-09-17T10:00:00", bob, [alice, me, dave]),
      msg("m1", "2026-09-17T09:00:00", alice, group()),
    ];
    expect(emails(messages, "m2", "removed")).toEqual(["carol@exemple.fr"]);
    expect(emails(messages, "m1", "removed")).toEqual([]);
  });
});

describe("libellé d’un participant", () => {
  it("n’écrit pas l’adresse deux fois quand le nom est l’adresse", () => {
    expect(formatParticipantIdentity("secretariat@example.fr", "secretariat@example.fr")).toEqual({
      label: "secretariat@example.fr",
      detail: null,
    });
    expect(formatParticipantIdentity("Secretariat@Example.fr", "secretariat@example.fr")).toEqual({
      label: "secretariat@example.fr",
      detail: null,
    });
    const html = renderParticipantMention("secretariat@example.fr", "secretariat@example.fr");
    expect(html).toBe("<strong>secretariat@example.fr</strong>");
    expect(html).not.toContain("(secretariat@example.fr)");
    expect(html).not.toContain("&lt;secretariat@example.fr&gt;");
  });

  it("garde le nom lisible et l’adresse une seule fois", () => {
    expect(formatParticipantIdentity("Marie Lefèvre", "marie@exemple.fr")).toEqual({
      label: "Marie Lefèvre",
      detail: "marie@exemple.fr",
    });
    expect(formatParticipantIdentity("Marie Lefèvre <marie@exemple.fr>", "marie@exemple.fr")).toEqual({
      label: "Marie Lefèvre",
      detail: "marie@exemple.fr",
    });
    const html = renderParticipantMention("Marie Lefèvre", "marie@exemple.fr");
    expect(html).toContain("Marie Lefèvre");
    expect(html).toContain("&lt;marie@exemple.fr&gt;");
    expect(html.match(/marie@exemple\.fr/g)).toHaveLength(1);
  });

  it("dit ajouté ou exclu de la boucle, sans répéter l’adresse", () => {
    const html = renderThreadLoopChangeNote({
      added: [{ name: "secretariat@example.fr", email: "secretariat@example.fr" }],
      removed: [{ name: "Carol Martin", email: "carol@exemple.fr" }],
    });
    expect(html).toContain("Ajouté à la boucle");
    expect(html).toContain("Exclu de la boucle");
    expect(html).not.toContain("Première apparition");
    expect(html).not.toContain("+ To/Cc");
    expect(html).not.toContain("(secretariat@example.fr)");
    expect(html).toContain("thread-timeline-note__kicker--add");
    expect(html).toContain("thread-timeline-note__kicker--rem");
    expect(html).toContain("Carol Martin");
    expect(html).toContain("&lt;carol@exemple.fr&gt;");
  });

  it("accorde le libellé quand plusieurs personnes changent", () => {
    const html = renderThreadLoopChangeNote({
      added: [
        { name: "Marie Lefèvre", email: "marie@exemple.fr" },
        { name: "Paul Martin", email: "paul@exemple.fr" },
      ],
      removed: [
        { name: null, email: "a@exemple.fr" },
        { name: null, email: "b@exemple.fr" },
      ],
    });
    expect(html).toContain("Ajoutés à la boucle");
    expect(html).toContain("Exclus de la boucle");
  });
});
