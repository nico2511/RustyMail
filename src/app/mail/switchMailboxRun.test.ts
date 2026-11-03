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
vi.mock("../../navigation", () => ({ navReset: vi.fn() }));
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
import { registerSwitchMailboxRunDeps, switchMailbox } from "./switchMailboxRun";
import { loadMailView } from "./mailListMailboxLoadRun";

const row = (id: string) => ({ id, subject: id, mailbox: "INBOX", unread: false }) as never;

async function flush(): Promise<void> {
  for (let i = 0; i < 8; i++) await new Promise((r) => setTimeout(r, 0));
}

describe("switchMailbox — rendu immédiat et garde", () => {
  beforeEach(() => {
    pending.length = 0;
    vi.mocked(render).mockClear();
    state.view = "list";
    state.selectedMailbox = "INBOX";
    state.threads = [row("old")];
    state.selectedThreadId = "old";
    state.mailListLoading = false;
    state.listFilter = "all" as never;
    state.accounts = [{ id: "acc@example.com" } as never];
    state.selectedAccountId = "acc@example.com";
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
});
