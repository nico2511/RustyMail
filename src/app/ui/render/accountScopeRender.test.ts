import { beforeEach, describe, expect, it } from "vitest";
import { UNIFIED_INBOX_MAILBOX } from "../../../mailboxKinds";
import type { Account } from "../../../accountSetup";
import { state } from "../../state";
import {
  renderAccountModalHtml,
  renderInboxScopeTitleHtml,
  renderRailAccountScopeHtml,
} from "./accountScopeRender";

function account(id: string, displayName: string, email: string): Account {
  return {
    id,
    displayName,
    email,
    imap: { host: "imap.exemple.fr", port: 993, security: "Tls", allowInvalidTls: false },
    smtp: { host: "smtp.exemple.fr", port: 587, security: "StartTls", allowInvalidTls: false },
  };
}

describe("marquage multi-compte", () => {
  beforeEach(() => {
    state.accounts = [
      account("perso", "Perso", "nicolas@exemple.fr"),
      account("atelier", "Atelier", "atelier@exemple.fr"),
      account("factu", "Facturation", "facturation@exemple.fr"),
    ];
    state.selectedAccountId = "perso";
    state.selectedMailbox = UNIFIED_INBOX_MAILBOX;
    state.mailboxes = ["INBOX"];
    state.mailboxUnread = { INBOX: 1 };
    state.accountInboxUnread = { perso: 1, atelier: 3, factu: 2 };
    state.inboxAccountMenuOpen = false;
    state.accountModalOpen = false;
    state.view = "list";
  });

  it("affiche Tous les comptes et les pastilles de teinte dans le rail", () => {
    const html = renderRailAccountScopeHtml();
    expect(html).toContain("Tous les comptes");
    expect(html).toContain("data-account-hue=\"slate\"");
    expect(html).toContain("data-account-hue=\"olive\"");
    expect(html).toContain("data-account-hue=\"plum\"");
    expect(html).toContain(">6<");
    expect(html).toContain("inbox-scope-all");
    expect(html).not.toContain("folder-button--scope");
  });

  it("aligne le titre, le menu et la modale sur le même filtre", () => {
    state.inboxAccountMenuOpen = true;
    state.accountModalOpen = true;
    state.selectedMailbox = "INBOX";
    state.selectedAccountId = "factu";
    state.mailboxUnread = { INBOX: 2 };
    const title = renderInboxScopeTitleHtml();
    const modal = renderAccountModalHtml();
    expect(title).toContain("Facturation");
    expect(title).toContain("data-account-hue=\"plum\"");
    expect(title).toContain("2 non lus");
    expect(title).toContain("Tous les comptes");
    expect(modal).toContain("aria-selected=\"true\"");
    expect(modal).toContain("Facturation");
    expect(modal).toContain("Ajouter un compte");
    const rail = renderRailAccountScopeHtml();
    expect(rail).toContain("folder-button--scope");
    expect(rail).toContain("data-account-id=\"factu\"");
  });
});
