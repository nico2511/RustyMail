// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from "vitest";

type Pending = { cmd: string; resolve: (v: unknown) => void; reject: (e: unknown) => void };
const pending: Pending[] = [];

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn((cmd: string, _args: Record<string, unknown>) =>
    new Promise((resolve, reject) => pending.push({ cmd, resolve, reject })),
  ),
}));
vi.mock("../dispatch", () => ({ render: vi.fn() }));
vi.mock("../../imapWatchFocus", () => ({ notifyImapWatchFocusedMailbox: vi.fn() }));
vi.mock("../../navigation", () => ({ navReset: vi.fn(), readListScrollY: () => 0 }));
vi.mock("../core/accountContext", () => ({ currentAccount: () => ({ id: "acc@example.com" }) }));
vi.mock("../lib/tauriRuntime", () => ({ isTauriRuntime: () => true }));
vi.mock("./accountDefaultPrefs", () => ({ defaultListFilterFromPrefs: () => "all" }));
vi.mock("./searchMailboxBrowseExit", () => ({ exitSearchModeForMailboxBrowse: vi.fn() }));
vi.mock("./threadAiSummaryState", () => ({ clearThreadAiSummaryState: vi.fn() }));
vi.mock("./mailListSidebarRun", () => ({ loadInboxFilterCounts: vi.fn(async () => {}) }));
vi.mock("./mailboxDigest", () => ({
  cancelMailboxDigestLiveDebounce: vi.fn(),
  enqueueMailboxDigestRefreshWhenIdle: vi.fn(),
  mailboxDigestSlotInList: () => false,
  resetMailboxDigestForNavigation: vi.fn(),
  scheduleMailboxDigestRefresh: vi.fn(),
}));
vi.mock("./idleAiCachePrefetch", () => ({
  invalidateIdleAiCachePrefetch: vi.fn(),
  scheduleIdleAiCachePrefetch: vi.fn(),
}));
vi.mock("./mailListDeferredRender", () => ({
  scheduleMailListSecondaryRender: vi.fn(),
  resetMailListDeferredRenderForTests: vi.fn(),
}));

import { render } from "../dispatch";
import { state } from "../state";
import {
  readFolderListCache,
  resetFolderListCacheForTests,
  writeFolderListCache,
} from "./mailListFolderCache";
import { registerSwitchMailboxRunDeps, switchMailbox } from "./switchMailboxRun";
import { loadMailView } from "./mailListMailboxLoadRun";

const row = (id: string, extra: Partial<Record<string, unknown>> = {}) =>
  ({ id, subject: id, mailbox: "INBOX", unread: false, pinned: false, ...extra }) as never;

async function flush(): Promise<void> {
  for (let i = 0; i < 8; i++) await new Promise((r) => setTimeout(r, 0));
}

async function waitForCmd(cmd: string): Promise<Pending> {
  for (let i = 0; i < 30; i++) {
    await flush();
    const hit = pending.find((p) => p.cmd === cmd);
    if (hit) return hit;
  }
  throw new Error(`missing invoke ${cmd}`);
}

async function resolvePendingListThreads(ids: string[], index = 0): Promise<void> {
  for (let i = 0; i < 30; i++) {
    await flush();
    const all = pending.filter((p) => p.cmd === "list_threads");
    if (all.length > index) {
      all[index]!.resolve(ids.map((id) => row(id)));
      break;
    }
  }
  for (const p of [...pending].filter((x) => x.cmd === "saved_drafts_count")) {
    p.resolve(0);
  }
  await flush();
}

function seedFolderCache(mailbox: string, ids: string[], selectedId?: string): void {
  writeFolderListCache(
    { accountId: "acc@example.com", mailbox, followedOnly: false },
    {
      threads: ids.map((id) => row(id)),
      hasMoreThreads: false,
      threadOffset: ids.length,
      selectedThreadId: selectedId ?? ids[0],
      listScrollY: 0,
      updatedAt: Date.now(),
    },
  );
}

describe("switchMailbox — rendu immédiat et garde", () => {
  beforeEach(() => {
    pending.length = 0;
    vi.mocked(render).mockClear();
    resetFolderListCacheForTests();
    state.view = "list";
    state.selectedMailbox = "INBOX";
    state.threads = [row("old")];
    state.selectedThreadId = "old";
    state.mailListLoading = false;
    state.listFilter = "all" as never;
    state.accounts = [{ id: "acc@example.com" } as never];
    state.selectedAccountId = "acc@example.com";
    state.mailListError = "";
    state.dbLockedMessage = "";
    state.threadPageSize = 50;
    state.hasMoreThreads = false;
    state.threadOffset = 1;
    document.body.innerHTML = `<div class="inbox-thread-list"></div>`;
    registerSwitchMailboxRunDeps({ loadMailView });
  });

  it("render avant list_threads avec liste vide et chargement", async () => {
    const run = switchMailbox("Sent");
    await flush();
    expect(state.selectedMailbox).toBe("Sent");
    expect(state.threads).toEqual([]);
    expect(state.mailListLoading).toBe(true);
    expect(render).toHaveBeenCalled();
    pending.find((p) => p.cmd === "list_threads")!.resolve([row("s1")]);
    await run;
    expect(state.mailListLoading).toBe(false);
  });

  it("saved_drafts_count en attente ne bloque pas l’affichage de la liste", async () => {
    const run = switchMailbox("Archives");
    await flush();
    pending.find((p) => p.cmd === "list_threads")!.resolve([row("a1")]);
    await flush();
    expect(state.threads.map((t) => t.id)).toEqual(["a1"]);
    expect(pending.some((p) => p.cmd === "saved_drafts_count")).toBe(true);
    await run;
  });

  it("clic B puis réponse tardive de A — liste de B conservée", async () => {
    const slow = switchMailbox("INBOX");
    await flush();
    const fast = switchMailbox("Trash");
    await flush();
    pending.filter((p) => p.cmd === "list_threads")[1]!.resolve([row("t1")]);
    await fast;
    pending.filter((p) => p.cmd === "list_threads")[0]!.resolve([row("i1")]);
    await slow;
    expect(state.selectedMailbox).toBe("Trash");
    expect(state.threads.map((t) => t.id)).toEqual(["t1"]);
    expect(state.mailListLoading).toBe(false);
  });

  it("erreur list_threads remet mailListLoading à false", async () => {
    const run = switchMailbox("Sent");
    await flush();
    pending.find((p) => p.cmd === "list_threads")!.reject(new Error("fail"));
    await run;
    expect(state.mailListLoading).toBe(false);
  });

  it("hit de cache — render avant list_threads avec threads déjà chargés", async () => {
    seedFolderCache("Sent", ["s1", "s2"]);
    const hitRun = switchMailbox("Sent");
    await flush();
    expect(state.mailListLoading).toBe(false);
    expect(state.threads.map((t) => t.id)).toEqual(["s1", "s2"]);
    expect(render).toHaveBeenCalled();
    await resolvePendingListThreads(["s1", "s2"]);
    await hitRun;
  });

  it("revalidate silencieux si page identique", async () => {
    seedFolderCache("Sent", ["s1"]);
    state.selectedThreadId = "s1";
    const rendersBefore = vi.mocked(render).mock.calls.length;
    const run = switchMailbox("Sent");
    await flush();
    expect(state.selectedThreadId).toBe("s1");
    await resolvePendingListThreads(["s1"]);
    await run;
    expect(state.selectedThreadId).toBe("s1");
    expect(vi.mocked(render).mock.calls.length - rendersBefore).toBeLessThanOrEqual(2);
  });

  it("revalidate avec nouveau fil en tête conserve la sélection", async () => {
    seedFolderCache("Sent", ["s1", "s2"], "s2");
    const run = switchMailbox("Sent");
    await flush();
    await resolvePendingListThreads(["s0", "s1", "s2"]);
    await run;
    expect(state.threads[0]!.id).toBe("s0");
    expect(state.selectedThreadId).toBe("s2");
  });


  it("erreur de revalidate sur hit ne vide pas la liste", async () => {
    seedFolderCache("Sent", ["s1"]);
    const run = switchMailbox("Sent");
    await flush();
    expect(state.threads.map((t) => t.id)).toEqual(["s1"]);
    const req = await waitForCmd("list_threads");
    req.reject(new Error("fail"));
    await run;
    expect(state.threads.map((t) => t.id)).toEqual(["s1"]);
    expect(state.mailListLoading).toBe(false);
  });

  it("base verrouillée vide le cache", async () => {
    state.mailboxes = ["INBOX", "Sent", "Trash"];
    seedFolderCache("Sent", ["s1"]);
    const run = switchMailbox("Sent");
    await flush();
    const req = await waitForCmd("list_threads");
    req.reject(new Error("Base verrouillée : trousseau"));
    await run;
    expect(state.dbLockedMessage).toBeTruthy();
    expect(
      readFolderListCache({
        accountId: "acc@example.com",
        mailbox: "Sent",
        followedOnly: false,
      }),
    ).toBeUndefined();
  });
});