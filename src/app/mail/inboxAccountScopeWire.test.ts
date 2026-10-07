import { beforeEach, describe, expect, it } from "vitest";
import { UNIFIED_INBOX_MAILBOX } from "../../mailboxKinds";
import type { Account } from "../../accountSetup";
import { state } from "../state";
import { tryHandleInboxAccountScopeWire } from "./inboxAccountScopeWire";

function account(id: string, displayName: string, email: string): Account {
  return {
    id,
    displayName,
    email,
    imap: { host: "imap.exemple.fr", port: 993, security: "Tls", allowInvalidTls: false },
    smtp: { host: "smtp.exemple.fr", port: 587, security: "StartTls", allowInvalidTls: false },
  };
}

function button(accountId: string): HTMLElement {
  return { dataset: { accountId } } as HTMLElement;
}

describe("rail compte dépliable", () => {
  beforeEach(() => {
    state.accounts = [
      account("demo", "Démo pro (local)", "playground@demo.rustymail.app"),
      account("perso", "Alice Exemple", "alice@exemple.fr"),
    ];
    state.selectedAccountId = "demo";
    state.selectedMailbox = "INBOX";
    state.view = "list";
    state.railAccountSectionOpen = true;
    state.sidebarCollapsed = false;
  });

  it("replie le compte actif et le rouvre sans changer de compte", async () => {
    await tryHandleInboxAccountScopeWire("toggle-rail-account-section", button("demo"));
    expect(state.railAccountSectionOpen).toBe(false);
    expect(state.selectedAccountId).toBe("demo");

    await tryHandleInboxAccountScopeWire("toggle-rail-account-section", button("demo"));
    expect(state.railAccountSectionOpen).toBe(true);
    expect(state.selectedAccountId).toBe("demo");
  });

  it("rouvre les dossiers en resélectionnant le compte déjà actif", async () => {
    state.railAccountSectionOpen = false;
    await tryHandleInboxAccountScopeWire("inbox-scope-account", button("demo"));
    expect(state.railAccountSectionOpen).toBe(true);
    expect(state.selectedMailbox).toBe("INBOX");
  });

  it("laisse le compte actif déplié quand la vue unifiée est choisie", async () => {
    state.selectedMailbox = UNIFIED_INBOX_MAILBOX;
    await tryHandleInboxAccountScopeWire("inbox-scope-all");
    expect(state.railAccountSectionOpen).toBe(true);
    expect(state.selectedAccountId).toBe("demo");
  });
});
