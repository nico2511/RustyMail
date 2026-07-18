import { describe, expect, it } from "vitest";
import {
  applyNlSearchQueryToState,
  extractNlSearchFallbackText,
  hasCommittedSearchCriteria,
  hasSavableSearchCriteria,
  resetSearchStructuralState,
  searchCriteriaSnapshotsEqual,
  snapshotFromStructuralState,
  type SearchStructuralState,
} from "./searchQueryState";

function emptyStructural(): SearchStructuralState {
  return {
    search: "old",
    searchSenders: ["a@x.com"],
    searchTags: [{ family: "entity", value: "foo" }],
    searchMailboxPath: "INBOX.Archives",
    searchAccountOverrideId: "acc-1",
    searchNewsletterRule: { domain: "x.com", localPart: "*" },
    searchScope: "mailbox",
    listFilter: "unread",
    searchNlMode: "semantic",
    searchLanguageFilter: "fr",
  };
}

describe("resetSearchStructuralState", () => {
  it("vide les modificateurs quand le brouillon n’en contient plus", () => {
    const s = emptyStructural();
    resetSearchStructuralState(s);
    expect(s.searchSenders).toEqual([]);
    expect(s.searchTags).toEqual([]);
    expect(s.searchMailboxPath).toBeNull();
    expect(s.searchAccountOverrideId).toBeNull();
    expect(s.searchNewsletterRule).toBeNull();
    expect(s.searchScope).toBe("account");
    expect(s.listFilter).toBe("all");
    expect(s.searchNlMode).toBeNull();
    expect(s.searchLanguageFilter).toBeNull();
  });
});

describe("extractNlSearchFallbackText", () => {
  it("extrait facture depuis une phrase FR complète", () => {
    expect(extractNlSearchFallbackText("tous les mails avec des factures")).toBe("facture");
  });
});

describe("searchCriteriaSnapshotsEqual", () => {
  it("ignore l’ordre des expéditeurs et compare structurellement", () => {
    const a = snapshotFromStructuralState({
      ...emptyStructural(),
      search: "",
      searchSenders: ["b@x.com", "a@x.com"],
      searchTags: [],
      searchMailboxPath: null,
      searchAccountOverrideId: null,
      searchNewsletterRule: null,
      searchScope: "account",
      listFilter: "all",
      searchNlMode: null,
      searchLanguageFilter: null,
    });
    const b = snapshotFromStructuralState({
      ...emptyStructural(),
      search: "",
      searchSenders: ["a@x.com", "b@x.com"],
      searchTags: [],
      searchMailboxPath: null,
      searchAccountOverrideId: null,
      searchNewsletterRule: null,
      searchScope: "account",
      listFilter: "all",
      searchNlMode: null,
      searchLanguageFilter: null,
    });
    expect(searchCriteriaSnapshotsEqual(a, b)).toBe(true);
  });

  it("détecte un texte libre différent", () => {
    const base = emptyStructural();
    const a = snapshotFromStructuralState({ ...base, search: "facture" });
    const b = snapshotFromStructuralState({ ...base, search: "autre" });
    expect(searchCriteriaSnapshotsEqual(a, b)).toBe(false);
  });
});

describe("hasSavableSearchCriteria", () => {
  it("accepte expéditeur sans texte libre", () => {
    const s = snapshotFromStructuralState({
      ...emptyStructural(),
      search: "",
      searchSenders: ["a@b.com"],
    });
    expect(hasSavableSearchCriteria(s)).toBe(true);
  });
});

describe("hasCommittedSearchCriteria", () => {
  it("ignore le seul filtre liste (Non lus, etc.)", () => {
    const s = snapshotFromStructuralState({
      search: "",
      searchSenders: [],
      searchTags: [],
      searchMailboxPath: null,
      searchAccountOverrideId: null,
      searchNewsletterRule: null,
      searchScope: "mailbox",
      listFilter: "unread",
      searchNlMode: null,
      searchLanguageFilter: null,
    });
    expect(hasCommittedSearchCriteria(s)).toBe(false);
    expect(hasSavableSearchCriteria(s)).toBe(true);
  });
});

describe("applyNlSearchQueryToState", () => {
  it("n’hérite pas mailbox/compte d’une requête NL précédente", () => {
    const s = emptyStructural();
    applyNlSearchQueryToState(
      s,
      {
        text: "factures",
        mailbox: "INBOX.Factures",
        accountId: "acc-1",
        senders: ["a@b.com"],
        mode: "hybrid",
        language: "fr",
      },
      (raw) => raw.trim().toLowerCase(),
      (id) => id === "acc-1"
    );
    expect(s.searchMailboxPath).toBe("INBOX.Factures");
    expect(s.searchAccountOverrideId).toBe("acc-1");

    applyNlSearchQueryToState(
      s,
      { text: "autre sujet", senders: ["c@d.com"] },
      (raw) => raw.trim().toLowerCase(),
      () => false
    );
    expect(s.search).toBe("autre sujet");
    expect(s.searchSenders).toEqual(["c@d.com"]);
    expect(s.searchMailboxPath).toBeNull();
    expect(s.searchAccountOverrideId).toBeNull();
    expect(s.searchNlMode).toBeNull();
    expect(s.searchLanguageFilter).toBeNull();
  });
});
