import { describe, expect, it } from "vitest";
import { draftPayloadForRust } from "./composeDraftPayload";
import type { Draft } from "../types";

function draft(sendHtml: boolean): Draft {
  return {
    id: "draft-local",
    kind: "New",
    to: [],
    cc: [],
    bcc: [],
    subject: "Objet",
    markdownBody: "Bonjour",
    sendHtml,
    inReplyTo: null,
    references: [],
    attachmentPaths: [],
    threadId: null,
  };
}

describe("draftPayloadForRust", () => {
  it("envoie toujours en multipart HTML", () => {
    expect(draftPayloadForRust(draft(false)).sendHtml).toBe(true);
    expect(draftPayloadForRust(draft(true)).sendHtml).toBe(true);
  });
});
