import { afterEach, describe, expect, it } from "vitest";
import { UNIFIED_INBOX_MAILBOX } from "../../mailboxKinds";
import { state } from "../state";
import { resolveSearchMailboxPath } from "./searchMailboxResolve";

afterEach(() => {
  state.mailboxes = [];
});

describe("resolveSearchMailboxPath", () => {
  it("résout INBOX même si une boîte virtuelle contient « inbox »", () => {
    state.mailboxes = [UNIFIED_INBOX_MAILBOX, "Archive", "INBOX"];
    expect(resolveSearchMailboxPath("INBOX")).toBe("INBOX");
  });

  it("ignore les boîtes virtuelles et préfère une inbox réelle", () => {
    state.mailboxes = [UNIFIED_INBOX_MAILBOX, "[Gmail]/Inbox"];
    expect(resolveSearchMailboxPath("INBOX")).toBe("[Gmail]/Inbox");
  });

  it("ne renvoie pas la boîte unifiée pour une requête INBOX", () => {
    state.mailboxes = [UNIFIED_INBOX_MAILBOX, "Sent"];
    expect(resolveSearchMailboxPath("INBOX")).toBe("INBOX");
  });
});
