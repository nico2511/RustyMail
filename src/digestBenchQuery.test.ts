import { describe, expect, it } from "vitest";
import { buildDigestBenchSearchQuery } from "./digestBenchQuery";

describe("buildDigestBenchSearchQuery", () => {
  it("keeps lexical search, sender domain, text and folder", () => {
    const query = buildDigestBenchSearchQuery({
      draft: "@deblock.com reçu #dossier:INBOX",
      accountId: "me@example.com",
      newsletterRules: [],
      archiveRoot: "Archive",
    });
    expect(query.mode).toBe("lexical");
    expect(query.senders).toContain("deblock.com");
    expect(query.sender).toBe("deblock.com");
    expect(query.text).toContain("reçu");
    expect(query.mailbox).toBe("INBOX");
    expect(query.accountId).toBe("me@example.com");
  });
});
