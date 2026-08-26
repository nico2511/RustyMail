import { describe, expect, it } from "vitest";
import { parseSearchBarDraft } from "./searchBarParse";

const noRules: never[] = [];

describe("parseSearchBarDraft", () => {
  it("détecte #auto de façon stable sur plusieurs appels", () => {
    for (let i = 0; i < 20; i++) {
      const p = parseSearchBarDraft("facture #auto", noRules);
      expect(p.listFilter).toBe("auto");
    }
    for (let i = 0; i < 20; i++) {
      const p = parseSearchBarDraft("facture", noRules);
      expect(p.listFilter).toBeUndefined();
    }
  });

  it("détecte #compte et #local de façon stable sur plusieurs appels", () => {
    for (let i = 0; i < 15; i++) {
      expect(parseSearchBarDraft("x #compte:user@mail.com", noRules).scope).toBe("account");
      expect(parseSearchBarDraft("x #local:Archives", noRules).mailboxPath).toBe("Archives");
      expect(parseSearchBarDraft("x #nonlus", noRules).listFilter).toBe("unread");
    }
  });

  it("parse #last:Nd en relativeDays", () => {
    expect(parseSearchBarDraft("facture #last:7d", noRules).relativeDays).toBe(7);
    expect(parseSearchBarDraft("#last:30d devis", noRules).relativeDays).toBe(30);
    expect(parseSearchBarDraft("#last:14d", noRules).relativeDays).toBe(14);
    expect(parseSearchBarDraft("facture #last:7d", noRules).text).toBe("facture");
  });

  it("parse #pj et has:attachment en hasAttachment (+ tag state)", () => {
    const pj = parseSearchBarDraft("doc #pj", noRules);
    expect(pj.hasAttachment).toBe(true);
    expect(pj.tags).toContainEqual({ family: "state", value: "attachment" });
    expect(pj.text).toBe("doc");

    const has = parseSearchBarDraft("doc has:attachment", noRules);
    expect(has.hasAttachment).toBe(true);
    expect(has.text).toBe("doc");
  });

  it("parse #security:N et #security:>=N", () => {
    expect(parseSearchBarDraft("x #security:50", noRules).minSecurityScore).toBe(50);
    expect(parseSearchBarDraft("x #security:>=75", noRules).minSecurityScore).toBe(75);
    expect(parseSearchBarDraft("x #security:50", noRules).text).toBe("x");
  });

  it("parse #archive en mailboxPrefix Archive", () => {
    const p = parseSearchBarDraft("facture #archive", noRules);
    expect(p.mailboxPrefix).toBe("Archive");
    expect(p.text).toBe("facture");
  });
});
