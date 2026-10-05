import { beforeEach, describe, expect, it } from "vitest";
import type { Account } from "../../accountSetup";
import { state } from "../state";
import {
  composeSendAccount,
  ensureComposeSendAccountId,
  preferredComposeSendAccountId,
  resolveComposeSendAccountId,
  sendableAccounts,
  shouldShowComposeFromAccountSelect,
} from "./composeSendAccount";
import { DEMO_PLAYGROUND_ACCOUNT_ID } from "./demoAccount";

function account(id: string, email: string, displayName = ""): Account {
  return {
    id,
    displayName,
    email,
    imap: { host: "imap.example", port: 993, security: "Tls", allowInvalidTls: false },
    smtp: { host: "smtp.example", port: 587, security: "StartTls", allowInvalidTls: false },
  };
}

beforeEach(() => {
  state.accounts = [];
  state.selectedAccountId = undefined;
  state.composeSendAccountId = undefined;
  state.selectedThreadId = undefined;
  state.selectedThread = undefined;
  state.threads = [];
});

describe("composeSendAccount", () => {
  it("exclut la boîte démo des comptes envoyables", () => {
    state.accounts = [
      account(DEMO_PLAYGROUND_ACCOUNT_ID, DEMO_PLAYGROUND_ACCOUNT_ID, "Démo"),
      account("a1", "a@example.com", "Alice"),
      account("b1", "b@example.com", "Bob"),
    ];
    expect(sendableAccounts().map((a) => a.id)).toEqual(["a1", "b1"]);
    expect(shouldShowComposeFromAccountSelect()).toBe(true);
  });

  it("masque le sélecteur s’il n’y a qu’un compte hors démo", () => {
    state.accounts = [
      account(DEMO_PLAYGROUND_ACCOUNT_ID, DEMO_PLAYGROUND_ACCOUNT_ID, "Démo"),
      account("a1", "a@example.com", "Alice"),
    ];
    expect(shouldShowComposeFromAccountSelect()).toBe(false);
  });

  it("préfère le compte du fil courant à l’ouverture", () => {
    state.accounts = [
      account("a1", "a@example.com"),
      account("b1", "b@example.com"),
    ];
    state.selectedAccountId = "a1";
    state.selectedThreadId = "t1";
    state.threads = [{ id: "t1", accountId: "b1" } as (typeof state.threads)[number]];
    expect(preferredComposeSendAccountId()).toBe("b1");
    ensureComposeSendAccountId();
    expect(state.composeSendAccountId).toBe("b1");
    expect(composeSendAccount()?.id).toBe("b1");
  });

  it("ignore un preferred démo et retombe sur un compte réel", () => {
    state.accounts = [
      account(DEMO_PLAYGROUND_ACCOUNT_ID, DEMO_PLAYGROUND_ACCOUNT_ID),
      account("a1", "a@example.com"),
      account("b1", "b@example.com"),
    ];
    state.selectedAccountId = DEMO_PLAYGROUND_ACCOUNT_ID;
    expect(resolveComposeSendAccountId(DEMO_PLAYGROUND_ACCOUNT_ID)).toBe("a1");
  });
});
