// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from "vitest";

type Pending = { mailbox: string; resolve: (v: unknown) => void; reject: (e: unknown) => void };
const pending: Pending[] = [];
vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(
    (_cmd: string, args: { mailbox: string }) =>
      new Promise((resolve, reject) => pending.push({ mailbox: args.mailbox, resolve, reject })),
  ),
}));
vi.mock("../dispatch", () => ({ render: vi.fn() }));
vi.mock("./mailListSidebarRun", () => ({ loadInboxFilterCounts: vi.fn(async () => {}) }));
vi.mock("./mailboxDigest", () => ({ scheduleMailboxDigestRefresh: vi.fn() }));
vi.mock("./idleAiCachePrefetch", () => ({
  invalidateIdleAiCachePrefetch: vi.fn(),
  scheduleIdleAiCachePrefetch: vi.fn(),
}));

import { state } from "../state";
import { loadMailView } from "./mailListMailboxLoadRun";

const row = (id: string, mailbox: string) => ({ id, subject: id, mailbox, unread: false }) as never;

async function flush(): Promise<void> {
  for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 0));
}

describe("loadMailView — garde de génération", () => {
  beforeEach(() => {
    pending.length = 0;
    (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {};
    state.accounts = [{ id: "acc" } as never];
    state.selectedAccountId = "acc";
    state.view = "list";
    state.listFilter = "all" as never;
    state.threads = [];
    state.mailListError = "";
  });

  it("une réponse tardive du dossier quitté n’écrase pas la liste courante", async () => {
    state.selectedMailbox = "INBOX";
    const slow = loadMailView();
    await flush();
    state.selectedMailbox = "Archives";
    const fast = loadMailView();
    await flush();
    expect(pending.map((p) => p.mailbox)).toEqual(["INBOX", "Archives"]);

    pending[1]!.resolve([row("a1", "Archives")]);
    await fast;
    pending[0]!.resolve([row("i1", "INBOX"), row("i2", "INBOX")]);
    await slow;

    expect(state.threads.map((t) => t.id)).toEqual(["a1"]);
  });

  it("l’échec d’une requête périmée ne vide pas la liste et n’affiche pas d’erreur", async () => {
    state.selectedMailbox = "INBOX";
    const slow = loadMailView();
    await flush();
    state.selectedMailbox = "Archives";
    const fast = loadMailView();
    await flush();
    pending[1]!.resolve([row("a1", "Archives")]);
    await fast;
    pending[0]!.reject(new Error("boom"));
    await slow;
    expect(state.threads.map((t) => t.id)).toEqual(["a1"]);
    expect(state.mailListError).toBe("");
  });
});
