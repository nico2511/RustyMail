import { describe, expect, it } from "vitest";
import {
  messageAccordionOpen,
  nextAccordionAfterToggle,
  openMessagesForAccordion,
  threadMessageFoldPreview,
} from "./threadAccordion";
import type { CleanedMessageView } from "../types";

const ids = ["latest", "mid", "old"];

describe("accordéon du fil", () => {
  it("ouvre le plus récent par défaut et replie les autres", () => {
    expect(messageAccordionOpen("latest", "latest", ids)).toBe(true);
    expect(messageAccordionOpen("latest", "old", ids)).toBe(false);
  });

  it("n’en garde qu’un ouvert, et replie celui qui l’est déjà", () => {
    expect(nextAccordionAfterToggle("latest", "mid", ids)).toBe("mid");
    expect(nextAccordionAfterToggle("mid", "mid", ids)).toBe("none");
    expect(nextAccordionAfterToggle("none", "old", ids)).toBe("old");
    expect(nextAccordionAfterToggle("all", "mid", ids)).toBe("mid");
    expect(messageAccordionOpen("all", "old", ids)).toBe(true);
    expect(messageAccordionOpen("none", "latest", ids)).toBe(false);
  });

  it("ignore un id qui n’est plus dans le fil", () => {
    expect(messageAccordionOpen("gone", "latest", ids)).toBe(true);
    expect(nextAccordionAfterToggle("latest", "gone", ids)).toBe("latest");
  });

  it("résume le corps replié sur une ligne", () => {
    expect(threadMessageFoldPreview("  Bonjour\n\nle monde  ")).toBe("Bonjour le monde");
    expect(threadMessageFoldPreview("")).toBe("Message vide");
    expect(threadMessageFoldPreview("abcdef", 4)).toBe("abc…");
  });
});

describe("openMessagesForAccordion", () => {
  // `open_thread` renvoie l’ordre chronologique (plus ancien d’abord).
  const chrono = [
    { messageId: "m-old", receivedAt: "2026-10-01T08:00:00Z" },
    { messageId: "m-mid", receivedAt: "2026-10-02T08:00:00Z" },
    { messageId: "m-new", receivedAt: "2026-10-03T08:00:00Z" },
  ] as unknown as CleanedMessageView[];

  it("latest = message le plus récent, même si l’entrée est chronologique", () => {
    expect(openMessagesForAccordion("latest", chrono).map((m) => m.messageId)).toEqual(["m-new"]);
  });

  it("message explicite, all et none", () => {
    expect(openMessagesForAccordion("m-mid", chrono).map((m) => m.messageId)).toEqual(["m-mid"]);
    expect(openMessagesForAccordion("all", chrono)).toHaveLength(3);
    expect(openMessagesForAccordion("none", chrono)).toHaveLength(0);
  });
});
