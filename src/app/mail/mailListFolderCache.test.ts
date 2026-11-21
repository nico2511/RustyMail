import { beforeEach, describe, expect, it } from "vitest";
import type { ThreadListItem } from "../types";
import {
  clearFolderListCache,
  folderListCacheKey,
  formatSwitchMailboxPerfLog,
  invalidateFolderListCache,
  invalidateFolderListCacheAccountAndUnified,
  patchFolderListCacheThread,
  readFolderListCache,
  removeThreadFromFolderListCache,
  resetFolderListCacheForTests,
  UNIFIED_FOLDER_LIST_ACCOUNT_ID,
  writeFolderListCache,
} from "./mailListFolderCache";
import { UNIFIED_INBOX_MAILBOX } from "../../mailboxKinds";

const thread = (id: string, unread = false): ThreadListItem => ({
  id,
  subject: `s-${id}`,
  preview: "p",
  participants: ["a@x.com"],
  lastActivity: "2020-01-01",
  messageCount: 1,
  unread,
  pinned: false,
  tags: [],
});

describe("mailListFolderCache", () => {
  beforeEach(() => {
    resetFolderListCacheForTests();
  });

  it("distinct keys for accounts, mailboxes and followedOnly", () => {
    const a = { accountId: "acc1", mailbox: "INBOX", followedOnly: false };
    const b = { accountId: "acc2", mailbox: "INBOX", followedOnly: false };
    const c = { accountId: "acc1", mailbox: "Sent", followedOnly: false };
    const d = { accountId: "acc1", mailbox: "INBOX", followedOnly: true };
    expect(folderListCacheKey(a)).not.toBe(folderListCacheKey(b));
    expect(folderListCacheKey(a)).not.toBe(folderListCacheKey(c));
    expect(folderListCacheKey(a)).not.toBe(folderListCacheKey(d));
    const all = { accountId: "acc1", mailbox: "INBOX", followedOnly: false };
    expect(folderListCacheKey(all)).toBe(folderListCacheKey(a));
  });

  it("LRU evicts oldest on 9th write; read promotes entry", () => {
    for (let i = 0; i < 8; i++) {
      writeFolderListCache(
        { accountId: "a", mailbox: `mb${i}`, followedOnly: false },
        {
          threads: [thread(`t${i}`)],
          hasMoreThreads: false,
          threadOffset: 1,
          listScrollY: 0,
          updatedAt: i,
        },
      );
    }
    readFolderListCache({ accountId: "a", mailbox: "mb0", followedOnly: false });
    writeFolderListCache(
      { accountId: "a", mailbox: "mb8", followedOnly: false },
      {
        threads: [thread("t8")],
        hasMoreThreads: false,
        threadOffset: 1,
        listScrollY: 0,
        updatedAt: 8,
      },
    );
    expect(
      readFolderListCache({ accountId: "a", mailbox: "mb0", followedOnly: false }),
    ).toBeDefined();
    expect(
      readFolderListCache({ accountId: "a", mailbox: "mb1", followedOnly: false }),
    ).toBeUndefined();
  });

  it("defensive clone on read and write", () => {
    const rows = [thread("x")];
    writeFolderListCache(
      { accountId: "a", mailbox: "INBOX", followedOnly: false },
      {
        threads: rows,
        hasMoreThreads: false,
        threadOffset: 1,
        listScrollY: 0,
        updatedAt: 1,
      },
    );
    rows[0]!.subject = "mutated-input";
    const hit = readFolderListCache({ accountId: "a", mailbox: "INBOX", followedOnly: false })!;
    hit.threads[0]!.subject = "mutated-read";
    const again = readFolderListCache({ accountId: "a", mailbox: "INBOX", followedOnly: false })!;
    expect(again.threads[0]!.subject).toBe("s-x");
  });

  it("invalidate scopes", () => {
    writeFolderListCache(
      { accountId: "a1", mailbox: "INBOX", followedOnly: false },
      {
        threads: [],
        hasMoreThreads: false,
        threadOffset: 0,
        listScrollY: 0,
        updatedAt: 1,
      },
    );
    writeFolderListCache(
      { accountId: "a1", mailbox: "Sent", followedOnly: false },
      {
        threads: [],
        hasMoreThreads: false,
        threadOffset: 0,
        listScrollY: 0,
        updatedAt: 1,
      },
    );
    writeFolderListCache(
      { accountId: "a2", mailbox: "INBOX", followedOnly: false },
      {
        threads: [],
        hasMoreThreads: false,
        threadOffset: 0,
        listScrollY: 0,
        updatedAt: 1,
      },
    );
    invalidateFolderListCache({ accountId: "a1", mailbox: "Sent" });
    expect(readFolderListCache({ accountId: "a1", mailbox: "INBOX", followedOnly: false })).toBeDefined();
    expect(readFolderListCache({ accountId: "a1", mailbox: "Sent", followedOnly: false })).toBeUndefined();
    invalidateFolderListCache({ accountId: "a1" });
    expect(readFolderListCache({ accountId: "a2", mailbox: "INBOX", followedOnly: false })).toBeDefined();
    clearFolderListCache();
    expect(readFolderListCache({ accountId: "a2", mailbox: "INBOX", followedOnly: false })).toBeUndefined();
  });

  it("removeThreadFromFolderListCache and patch", () => {
    writeFolderListCache(
      { accountId: "a", mailbox: "INBOX", followedOnly: false },
      {
        threads: [thread("t1", true), thread("t2", false)],
        hasMoreThreads: false,
        threadOffset: 2,
        listScrollY: 0,
        updatedAt: 1,
      },
    );
    patchFolderListCacheThread("a", "t1", { unread: false, followed: true });
    removeThreadFromFolderListCache("a", "t2");
    const hit = readFolderListCache({ accountId: "a", mailbox: "INBOX", followedOnly: false })!;
    expect(hit.threads.map((t) => t.id)).toEqual(["t1"]);
    expect(hit.threads[0]!.unread).toBe(false);
    expect(hit.threads[0]!.followed).toBe(true);
  });

  it("account delete also drops unified key helper", () => {
    writeFolderListCache(
      { accountId: UNIFIED_FOLDER_LIST_ACCOUNT_ID, mailbox: UNIFIED_INBOX_MAILBOX, followedOnly: false },
      {
        threads: [thread("u")],
        hasMoreThreads: false,
        threadOffset: 1,
        listScrollY: 0,
        updatedAt: 1,
      },
    );
    invalidateFolderListCacheAccountAndUnified("acc");
    expect(
      readFolderListCache({
        accountId: UNIFIED_FOLDER_LIST_ACCOUNT_ID,
        mailbox: UNIFIED_INBOX_MAILBOX,
        followedOnly: false,
      }),
    ).toBeUndefined();
  });

  it("perf log formatter excludes PII", () => {
    const line = formatSwitchMailboxPerfLog({
      cacheHit: true,
      mailbox: "INBOX",
      firstRenderMs: 1,
      listDoneMs: 2,
    });
    expect(line).toContain("cache hit=true");
    expect(line).not.toContain("acc");
    expect(line).not.toContain("Clients");
    expect(line).not.toContain("@");
  });
});