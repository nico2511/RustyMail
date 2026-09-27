import { describe, expect, it } from "vitest";
import {
  ACCOUNT_HUES,
  accountHueForId,
  accountMonogram,
  accountShortLabel,
  inboxUnreadForAccount,
  resolveInboxScope,
  sumInboxUnread,
  unreadCountLabelFr,
} from "./accountHue";
import { UNIFIED_INBOX_MAILBOX } from "../../mailboxKinds";

describe("account hues", () => {
  it("donne ardoise, olive puis prune dans l’ordre des comptes", () => {
    const ids = ["perso", "atelier", "factu", "autre"];
    expect(accountHueForId("perso", ids)).toBe("slate");
    expect(accountHueForId("atelier", ids)).toBe("olive");
    expect(accountHueForId("factu", ids)).toBe("plum");
    expect(accountHueForId("autre", ids)).toBe("slate");
    expect(ACCOUNT_HUES).toContain(accountHueForId("perso", ids));
  });

  it("préfère le nom affiché, sinon la partie locale de l’adresse", () => {
    expect(accountShortLabel({ displayName: "Atelier", email: "atelier@exemple.fr" })).toBe("Atelier");
    expect(accountShortLabel({ displayName: "  ", email: "facturation@exemple.fr" })).toBe("facturation");
    expect(accountMonogram("atelier")).toBe("A");
  });
});

describe("compteurs de réception", () => {
  const lookup = {
    selectedAccountId: "a",
    mailboxes: ["INBOX", "Sent"],
    mailboxUnread: { INBOX: 1 },
    accountInboxUnread: { a: 9, b: 3, c: 2 },
  };

  it("aligne le compte sélectionné sur le dossier INBOX, pas sur une copie divergente", () => {
    expect(inboxUnreadForAccount("a", lookup)).toBe(1);
    expect(inboxUnreadForAccount("b", lookup)).toBe(3);
    expect(sumInboxUnread(["a", "b", "c"], lookup)).toBe(6);
  });

  it("formule les non-lus en français", () => {
    expect(unreadCountLabelFr(0)).toBe("0 non lus");
    expect(unreadCountLabelFr(1)).toBe("1 non lu");
    expect(unreadCountLabelFr(2)).toBe("2 non lus");
  });

  it("traite la boîte unifiée comme le filtre « tous »", () => {
    expect(
      resolveInboxScope({
        accountCount: 3,
        selectedMailbox: UNIFIED_INBOX_MAILBOX,
        selectedAccountId: "a",
      }),
    ).toBe("all");
    expect(
      resolveInboxScope({
        accountCount: 3,
        selectedMailbox: "INBOX",
        selectedAccountId: "b",
      }),
    ).toBe("b");
    expect(
      resolveInboxScope({
        accountCount: 1,
        selectedMailbox: UNIFIED_INBOX_MAILBOX,
        selectedAccountId: "a",
      }),
    ).toBe("a");
  });
});
