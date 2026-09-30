import { beforeEach, describe, expect, it } from "vitest";
import { UNIFIED_INBOX_MAILBOX } from "../../../mailboxKinds";
import type { Account } from "../../../accountSetup";
import { state } from "../../state";
import { railAccountRowExpanded, railImapFoldersVisible } from "../../mail/inboxAccountScope";
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
    state.railAccountSectionOpen = true;
    state.sidebarCollapsed = false;
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

  it("ne déplie que le compte actif", () => {
    state.selectedAccountId = "atelier";
    state.railAccountSectionOpen = true;
    const html = renderRailAccountScopeHtml();
    expect(html).toContain('class="sidebar-account-row is-expanded" data-rail-account="atelier"');
    expect(html).toContain('data-account-id="atelier" aria-expanded="true"');
    expect(html).not.toContain('data-rail-account="perso" class="sidebar-account-row is-expanded"');
    expect(html).toContain('data-rail-account="perso"');
    expect(html).toContain('data-account-id="perso" aria-expanded="false"');
    expect(html).toContain('data-account-id="factu" aria-expanded="false"');
    state.railAccountSectionOpen = false;
    const collapsed = renderRailAccountScopeHtml();
    expect(collapsed).not.toContain("is-expanded");
    expect(collapsed).toContain('aria-expanded="false"');
    expect(collapsed).not.toContain('aria-expanded="true"');
  });

  it("cache les dossiers du compte replié et les garde dans le rail icônes", () => {
    state.selectedAccountId = "perso";
    state.railAccountSectionOpen = true;
    state.sidebarCollapsed = false;
    expect(railAccountRowExpanded("perso")).toBe(true);
    expect(railAccountRowExpanded("atelier")).toBe(false);
    expect(railImapFoldersVisible()).toBe(true);
    state.railAccountSectionOpen = false;
    expect(railAccountRowExpanded("perso")).toBe(false);
    expect(railImapFoldersVisible()).toBe(false);
    state.sidebarCollapsed = true;
    expect(railImapFoldersVisible()).toBe(true);
  });
});
