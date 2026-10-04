import { describe, expect, it } from "vitest";
import { buildMailSecurityLlmContext } from "./mailSecurityLlmContextRun";
import type { CleanedMessageView } from "../types";

function msg(partial: Partial<CleanedMessageView>): CleanedMessageView {
  return {
    messageId: "m1",
    sender: "Banque",
    senderEmail: "alert@bank.example",
    receivedAt: "2026-01-01T00:00:00Z",
    sourceText: "",
    cleanedText: "Cliquez ici https://evil.example/login pour confirmer.",
    attachments: [{ id: "a1", fileName: "facture.pdf", mimeType: "application/pdf", sizeBytes: 10, kind: "Regular" }],
    collapsedQuotes: [],
    dimmedBlocks: [],
    tags: [],
    entities: [],
    ...partial,
  };
}

describe("buildMailSecurityLlmContext", () => {
  it("extrait hôtes, PJ et extrait de corps", () => {
    const ctx = buildMailSecurityLlmContext(msg({}), "Alerte sécurité");
    expect(ctx.subject).toBe("Alerte sécurité");
    expect(ctx.fromEmail).toBe("alert@bank.example");
    expect(ctx.linkHosts).toContain("evil.example");
    expect(ctx.attachmentNames).toEqual(["facture.pdf"]);
    expect(ctx.bodyExcerpt).toContain("confirmer");
  });
});
