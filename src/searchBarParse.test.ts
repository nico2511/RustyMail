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
});
