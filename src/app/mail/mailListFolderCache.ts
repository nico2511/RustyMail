import {
  isUnifiedInboxMailbox,
  LOCAL_SAVED_DRAFTS_MAILBOX,
  mailboxKind,
  UNIFIED_INBOX_MAILBOX,
} from "../../mailboxKinds";
import type { ThreadListItem } from "../types";

export const UNIFIED_FOLDER_LIST_ACCOUNT_ID = "__unified__";

const MAX_ENTRIES = 8;

export type FolderListCacheKey = {
  accountId: string;
  mailbox: string;
  followedOnly: boolean;
};

export type FolderListCacheEntry = {
  threads: ThreadListItem[];
  hasMoreThreads: boolean;
  threadOffset: number;
  selectedThreadId?: string;
  listScrollY: number;
  updatedAt: number;
};

export type FolderListCacheInvalidateScope =
  | "all"
  | { accountId: string }
  | { accountId: string; mailbox: string }
  | { accountId: string; mailboxes: string[] };

export type FolderListThreadPatch = {
  unread?: boolean;
  followed?: boolean;
};

const store = new Map<string, FolderListCacheEntry>();

function serializeKey(key: FolderListCacheKey): string {
  return `${key.accountId}\0${key.mailbox}\0${key.followedOnly ? "1" : "0"}`;
}

export function folderListCacheKey(key: FolderListCacheKey): string {
  return serializeKey(key);
}

function cloneThreads(threads: ThreadListItem[]): ThreadListItem[] {
  return structuredClone(threads);
}

function cloneEntry(entry: FolderListCacheEntry): FolderListCacheEntry {
  return {
    ...entry,
    threads: cloneThreads(entry.threads),
  };
}

function touchLru(serialized: string, entry: FolderListCacheEntry): void {
  store.delete(serialized);
  store.set(serialized, entry);
}

function evictOldestIfNeeded(): void {
  while (store.size > MAX_ENTRIES) {
    const oldest = store.keys().next().value;
    if (oldest === undefined) break;
    store.delete(oldest);
  }
}

function entryMatchesScope(serialized: string, scope: FolderListCacheInvalidateScope): boolean {
  if (scope === "all") return true;
  const parts = serialized.split("\0");
  const accountId = parts[0] ?? "";
  const mailbox = parts[1] ?? "";
  if ("mailboxes" in scope) {
    return (
      scope.accountId === accountId &&
      scope.mailboxes.some((mb) => mb === mailbox)
    );
  }
  if ("mailbox" in scope) {
    return scope.accountId === accountId && scope.mailbox === mailbox;
  }
  return scope.accountId === accountId;
}

export function readFolderListCache(key: FolderListCacheKey): FolderListCacheEntry | undefined {
  const serialized = serializeKey(key);
  const hit = store.get(serialized);
  if (!hit) return undefined;
  touchLru(serialized, hit);
  return cloneEntry(hit);
}

export function writeFolderListCache(key: FolderListCacheKey, entry: FolderListCacheEntry): void {
  const serialized = serializeKey(key);
  const stored = cloneEntry({
    ...entry,
    updatedAt: entry.updatedAt || Date.now(),
  });
  touchLru(serialized, stored);
  evictOldestIfNeeded();
}

export function invalidateFolderListCache(scope: FolderListCacheInvalidateScope): void {
  if (scope === "all") {
    store.clear();
    return;
  }
  for (const serialized of [...store.keys()]) {
    if (entryMatchesScope(serialized, scope)) {
      store.delete(serialized);
    }
  }
}

export function invalidateFolderListCacheAccountAndUnified(accountId: string): void {
  invalidateFolderListCache({ accountId });
  invalidateFolderListCache({
    accountId: UNIFIED_FOLDER_LIST_ACCOUNT_ID,
    mailbox: UNIFIED_INBOX_MAILBOX,
  });
}

function forEachAccountEntry(
  accountId: string,
  fn: (serialized: string, entry: FolderListCacheEntry) => void,
): void {
  // Snapshot — touchLru() delete+set pendant l’itération relirait la même clé à l’infini.
  for (const [serialized, entry] of [...store]) {
    if (serialized.startsWith(`${accountId}\0`)) {
      fn(serialized, entry);
    }
  }
}

export function patchFolderListCacheThread(
  accountId: string,
  threadId: string,
  patch: FolderListThreadPatch,
): void {
  const tid = String(threadId ?? "").trim();
  if (!tid) return;
  forEachAccountEntry(accountId, (serialized, entry) => {
    let changed = false;
    const threads = entry.threads.map((row) => {
      if (String(row.id) !== tid) return row;
      changed = true;
      return {
        ...row,
        ...(patch.unread !== undefined ? { unread: patch.unread } : {}),
        ...(patch.followed !== undefined ? { followed: patch.followed } : {}),
      };
    });
    if (changed) {
      touchLru(serialized, { ...entry, threads: cloneThreads(threads) });
    }
  });
}

export function removeThreadFromFolderListCache(accountId: string, threadId: string): void {
  const tid = String(threadId ?? "").trim();
  if (!tid) return;
  forEachAccountEntry(accountId, (serialized, entry) => {
    const next = entry.threads.filter((row) => String(row.id) !== tid);
    if (next.length === entry.threads.length) return;
    touchLru(serialized, {
      ...entry,
      threads: cloneThreads(next),
      threadOffset: Math.min(entry.threadOffset, next.length),
    });
  });
}

export function clearFolderListCache(): void {
  store.clear();
}

export function resetFolderListCacheForTests(): void {
  clearFolderListCache();
}

export function invalidateFolderListCacheAfterMove(opts: {
  accountId: string;
  sourceMailbox: string;
  destMailbox: string;
  threadId: string;
}): void {
  removeThreadFromFolderListCache(opts.accountId, opts.threadId);
  invalidateFolderListCache({ accountId: opts.accountId, mailbox: opts.destMailbox });
}


export function invalidateFolderListCacheMailboxes(
  accountId: string,
  mailboxes: string[],
): void {
  if (!mailboxes.length) return;
  invalidateFolderListCache({ accountId, mailboxes });
}

export function folderListCachePerfKind(mailbox: string): string {
  if (isUnifiedInboxMailbox(mailbox)) return "unified";
  if (mailbox === LOCAL_SAVED_DRAFTS_MAILBOX) return "drafts";
  const kind = mailboxKind(mailbox);
  if (kind === "inbox") return "inbox";
  if (kind === "sent") return "sent";
  if (kind === "trash") return "trash";
  if (kind === "drafts") return "drafts";
  if (kind === "archive") return "archive";
  return "other";
}

export function formatSwitchMailboxPerfLog(opts: {
  cacheHit: boolean;
  mailbox: string;
  firstRenderMs: number;
  listDoneMs: number;
}): string {
  const kind = folderListCachePerfKind(opts.mailbox);
  return `[perf] switchMailbox cache hit=${opts.cacheHit} kind=${kind} clic→1er rendu ${opts.firstRenderMs} ms, clic→liste ${opts.listDoneMs} ms`;
}

const THREAD_EQ_FIELDS: (keyof ThreadListItem)[] = [
  "id",
  "unread",
  "followed",
  "pinned",
  "lastActivity",
  "subject",
  "preview",
  "messageCount",
  "attachmentCount",
  "isNewsletterThread",
];

export function threadListFirstPagesEquivalent(
  displayed: ThreadListItem[],
  serverPage: ThreadListItem[],
): boolean {
  if (displayed.length !== serverPage.length) return false;
  for (let i = 0; i < displayed.length; i++) {
    const a = displayed[i]!;
    const b = serverPage[i]!;
    if (String(a.id) !== String(b.id)) return false;
    for (const field of THREAD_EQ_FIELDS) {
      if (field === "id") continue;
      const av = a[field];
      const bv = b[field];
      if (av !== bv && !(av == null && bv == null)) return false;
    }
  }
  return true;
}

export function makeFolderListCacheKeyFromMailContext(opts: {
  accountId: string | undefined;
  mailbox: string;
  followedOnly: boolean;
}): FolderListCacheKey | undefined {
  const accountId = opts.accountId?.trim();
  if (!accountId) return undefined;
  const mailbox = String(opts.mailbox ?? "").trim() || "INBOX";
  return { accountId, mailbox, followedOnly: opts.followedOnly };
}

export function resolveFolderListCacheAccountId(
  mailbox: string,
  accountId: string | undefined,
): string | undefined {
  if (isUnifiedInboxMailbox(mailbox)) return UNIFIED_FOLDER_LIST_ACCOUNT_ID;
  return accountId?.trim() || undefined;
}