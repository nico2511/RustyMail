import { afterEach, describe, expect, it } from "vitest";
import type { Account } from "./accountSetup";
import { DEMO_PLAYGROUND_ACCOUNT_ID } from "./app/core/demoAccount";
import { state } from "./app/state";
import { resolveDigestSearchAccountId } from "./digestToolSearch";

function account(id: string, email = id): Account {
  return {
    id,
    email,
    displayName: email,
    imap: { host: "imap.example", port: 993, security: "Tls", allowInvalidTls: false },
    smtp: { host: "smtp.example", port: 587, security: "StartTls", allowInvalidTls: false },
  };
}

afterEach(() => {
  state.accounts = [];
  state.selectedAccountId = undefined;
});

describe("resolveDigestSearchAccountId", () => {
  it("évite la démo quand un compte IMAP réel existe", () => {
    state.accounts = [account(DEMO_PLAYGROUND_ACCOUNT_ID), account("user@example.com")];
    state.selectedAccountId = DEMO_PLAYGROUND_ACCOUNT_ID;
    expect(resolveDigestSearchAccountId()).toBe("user@example.com");
  });

  it("garde le compte réel sélectionné", () => {
    state.accounts = [account("a@x.fr"), account("b@y.fr")];
    state.selectedAccountId = "b@y.fr";
    expect(resolveDigestSearchAccountId()).toBe("b@y.fr");
  });
});
