import { readListScrollY } from "../../navigation";
import {
  isUnifiedInboxMailbox,
  LOCAL_SAVED_DRAFTS_MAILBOX,
  mailboxKind,
  UNIFIED_INBOX_MAILBOX,
} from "../../mailboxKinds";
import { currentAccount } from "../core/accountContext";
import { state } from "../state";
import { listMailboxForPanel } from "./mailboxPanelContext";
import {
  type FolderListCacheEntry,
  type FolderListCacheKey,
  makeFolderListCacheKeyFromMailContext,
  invalidateFolderListCache,
  invalidateFolderListCacheAfterMove,
  readFolderListCache,
  removeThreadFromFolderListCache,
  resolveFolderListCacheAccountId,
  UNIFIED_FOLDER_LIST_ACCOUNT_ID,
  writeFolderListCache,
} from "./mailListFolderCache";

export function currentFolderListCacheKey(
  mailbox?: string,
  followedOnly?: boolean,
): FolderListCacheKey | undefined {
  const mb = mailbox ?? listMailboxForPanel();
  const accountId = resolveFolderListCacheAccountId(
    mb,
    isUnifiedInboxMailbox(mb) ? UNIFIED_FOLDER_LIST_ACCOUNT_ID : currentAccount()?.id,
  );
  const followed =
    followedOnly !== undefined ? followedOnly : state.listFilter === "starred";
  return makeFolderListCacheKeyFromMailContext({
    accountId,
    mailbox: isUnifiedInboxMailbox(mb) ? UNIFIED_INBOX_MAILBOX : mb,
    followedOnly: followed,
  });
}

export function shouldPersistFolderListCacheSnapshot(): boolean {
  if (state.dbLockedMessage) return false;
  if (state.mailListLoading && state.threads.length === 0) return false;
  return state.threads.length > 0 || !state.mailListLoading;
}

export function buildFolderListCacheEntryFromState(): FolderListCacheEntry | null {
  if (!shouldPersistFolderListCacheSnapshot()) return null;
  return {
    threads: structuredClone(state.threads),
    hasMoreThreads: state.hasMoreThreads,
    threadOffset: state.threadOffset,
    selectedThreadId: state.selectedThreadId,
    listScrollY: readListScrollY(),
    updatedAt: Date.now(),
  };
}

export function persistCurrentFolderListCache(
  mailbox?: string,
  followedOnly?: boolean,
): void {
  const key = currentFolderListCacheKey(mailbox, followedOnly);
  const entry = buildFolderListCacheEntryFromState();
  if (!key || !entry) return;
  writeFolderListCache(key, entry);
}

export function tryReadFolderListCacheForKey(
  key: FolderListCacheKey | undefined,
): FolderListCacheEntry | undefined {
  if (!key) return undefined;
  return readFolderListCache(key);
}

export function applyFolderListCacheEntry(entry: FolderListCacheEntry): void {
  state.threads = structuredClone(entry.threads);
  state.threadOffset = entry.threadOffset;
  state.hasMoreThreads = entry.hasMoreThreads;
  const selected = entry.selectedThreadId;
  if (selected && state.threads.some((t) => t.id === selected)) {
    state.selectedThreadId = selected;
  } else {
    state.selectedThreadId = state.threads[0]?.id;
  }
  state.selectedThread = undefined;
  state.mailListLoading = false;
  state.mailListError = "";
}

export function restoreListScrollYAfterRender(scrollY: number): void {
  if (!Number.isFinite(scrollY) || scrollY <= 0) return;
  const apply = () => {
    const el = document.querySelector<HTMLElement>(".inbox-thread-list");
    if (el) el.scrollTop = scrollY;
  };
  if (typeof requestAnimationFrame === "function") {
    requestAnimationFrame(apply);
  } else {
    apply();
  }
}

export function mailboxLabelForCacheWrite(mailbox: string): string {
  if (isUnifiedInboxMailbox(mailbox)) return UNIFIED_INBOX_MAILBOX;
  if (mailbox === LOCAL_SAVED_DRAFTS_MAILBOX) return LOCAL_SAVED_DRAFTS_MAILBOX;
  return mailbox;
}

function mailboxesWithKind(kind: ReturnType<typeof mailboxKind>): string[] {
  return state.mailboxes.filter((mb) => mailboxKind(mb) === kind);
}

export function invalidateFolderListCacheAfterTrashArchive(opts: {
  accountId: string;
  sourceMailbox: string;
  threadId: string;
  kind: "trash" | "archive";
}): void {
  removeThreadFromFolderListCache(opts.accountId, opts.threadId);
  const target = opts.kind === "trash" ? "trash" : "archive";
  const names = mailboxesWithKind(target);
  if (names.length) {
    invalidateFolderListCache({ accountId: opts.accountId, mailboxes: names });
  }
}

export function invalidateFolderListCacheAfterSend(accountId: string): void {
  const mailboxes = [
    ...mailboxesWithKind("inbox"),
    ...mailboxesWithKind("sent"),
    LOCAL_SAVED_DRAFTS_MAILBOX,
  ];
  if (mailboxes.length) {
    invalidateFolderListCache({ accountId, mailboxes });
  }
}

export { invalidateFolderListCacheAfterMove };