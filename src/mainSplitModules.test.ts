import { describe, expect, it } from "vitest";
import {
  LOCAL_SAVED_DRAFTS_MAILBOX,
  mailboxKind,
  mailboxesAllowedForMove,
  preferredInboxMailboxName,
  savedDraftIdFromThreadId,
} from "./mailboxKinds";
import {
  chunkStringList,
  mergeSyncMailboxesOutcomes,
  syncInvokeTimeoutMs,
} from "./imapSyncTypes";
import {
  buildLargeDataImageMap,
  collapseLargeDataImageMarkdown,
  expandInlineImagePlaceholders,
} from "./composeMarkdownImages";
import { appendQuotedMessageToDraft } from "./composeQuote";
import { mergeServerThreadPage } from "./mailListPage";
import {
  markThreadsRecentlyRemoved,
  clearThreadsRecentlyRemoved,
} from "./recentlyRemovedThreads";
import { formatFriendlyThreadListDate, parseThreadListActivityDate } from "./threadListDates";

describe("mailboxKinds", () => {
  it("classifie les dossiers système", () => {
    expect(mailboxKind("INBOX")).toBe("inbox");
    expect(mailboxKind("[Gmail]/Trash")).toBe("trash");
    expect(mailboxKind("Sent Items")).toBe("sent");
  });

  it("exclut trash/sent des cibles de move", () => {
    const out = mailboxesAllowedForMove(["INBOX", "Trash", "Sent", "Projets", LOCAL_SAVED_DRAFTS_MAILBOX]);
    expect(out).toEqual(["INBOX", "Projets"]);
  });

  it("préfère INBOX et parse saved-draft ids", () => {
    expect(preferredInboxMailboxName(["Drafts", "INBOX"])).toBe("INBOX");
    expect(savedDraftIdFromThreadId("saved-draft:abc")).toBe("abc");
    expect(savedDraftIdFromThreadId("other")).toBeNull();
  });
});

describe("imapSyncTypes", () => {
  it("chunk et merge outcomes", () => {
    expect(chunkStringList(["a", "b", "c"], 2)).toEqual([["a", "b"], ["c"]]);
    const merged = mergeSyncMailboxesOutcomes(
      { results: [{ mailbox: "A", messageCount: 1, threadCount: 1, fetchedUids: 1 }], skippedNotOnServer: ["x"] },
      { results: [{ mailbox: "B", messageCount: 2, threadCount: 1, fetchedUids: 2 }], skippedNotOnServer: ["x", "y"] },
    );
    expect(merged.results).toHaveLength(2);
    expect(merged.skippedNotOnServer).toEqual(["x", "y"]);
    expect(syncInvokeTimeoutMs(10, 120_000)).toBeGreaterThanOrEqual(120_000);
  });
});

describe("composeMarkdownImages", () => {
  it("collapse / expand grosses data-URLs", () => {
    const url = "data:image/png;base64," + "A".repeat(5000);
    const canonical = `![shot](${url})`;
    const display = collapseLargeDataImageMarkdown(canonical);
    expect(display).toContain("rustymail-inline://");
    expect(expandInlineImagePlaceholders(display, canonical)).toBe(canonical);
    expect(buildLargeDataImageMap(canonical).size).toBe(1);
  });
});

describe("composeQuote", () => {
  it("ajoute une citation sous l’intro", () => {
    expect(appendQuotedMessageToDraft("Salut,", "Hier — bob", "ligne1\nligne2")).toBe(
      "Salut,\n\n> Hier — bob\n> ligne1\n> ligne2\n\n",
    );
  });
});

describe("mailListPage", () => {
  it("filtre les fils recently-removed au remplacement", () => {
    markThreadsRecentlyRemoved(["gone"]);
    const { threads, threadOffsetReset } = mergeServerThreadPage(
      [{ id: "old" }],
      [{ id: "gone" }, { id: "ok" }],
      false,
    );
    expect(threadOffsetReset).toBe(true);
    expect(threads.map((t) => t.id)).toEqual(["ok"]);
    clearThreadsRecentlyRemoved(["gone"]);
  });
});

describe("threadListDates", () => {
  it("parse ISO et affiche aujourd’hui en heure", () => {
    const now = new Date(2026, 6, 18, 15, 0, 0);
    const iso = new Date(2026, 6, 18, 9, 30, 0).toISOString();
    expect(parseThreadListActivityDate(iso)).not.toBeNull();
    const friendly = formatFriendlyThreadListDate(iso, now);
    expect(friendly).toMatch(/\d{2}:\d{2}/);
  });
});
