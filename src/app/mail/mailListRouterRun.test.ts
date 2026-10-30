// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from "vitest";

const invokeCalls: string[] = [];
vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn((cmd: string) => {
    invokeCalls.push(cmd);
    if (cmd === "list_threads") {
      return Promise.resolve([]);
    }
    return Promise.resolve({});
  }),
}));

const { mockRender, mockLoadMailView, mockSearchThreads } = vi.hoisted(() => ({
  mockRender: vi.fn(),
  mockLoadMailView: vi.fn(async () => {}),
  mockSearchThreads: vi.fn(async () => {}),
}));

vi.mock("../dispatch", () => ({ render: mockRender }));

vi.mock("./mailListMailboxLoadRun", () => ({
  loadMailView: mockLoadMailView,
}));

vi.mock("./mailListViewContext", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./mailListViewContext")>();
  return {
    ...actual,
    requireMailListDeps: () => ({
      isSearchActive: () => false,
      searchThreads: mockSearchThreads,
      searchQueryUsesThreadsApi: () => false,
      usesSearchContextLoader: () => false,
    }),
  };
});

vi.mock("./mailListSidebarRun", () => ({ loadInboxFilterCounts: vi.fn(async () => {}) }));

import { state } from "../state";
import { applyListFilter } from "./mailListRouterRun";

describe("applyListFilter", () => {
  beforeEach(() => {
    invokeCalls.length = 0;
    mockRender.mockClear();
    mockLoadMailView.mockClear();
    mockSearchThreads.mockClear();
    (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {};
    state.accounts = [{ id: "acc" } as never];
    state.selectedAccountId = "acc";
    state.selectedMailbox = "INBOX";
    state.view = "list";
    state.listFilter = "all";
    state.threads = [];
  });

  it("all → unread → focused → auto : pas de list_threads ni compteurs", async () => {
    await applyListFilter("unread");
    await applyListFilter("focused");
    await applyListFilter("auto");
    await applyListFilter("all");
    expect(mockLoadMailView).not.toHaveBeenCalled();
    expect(invokeCalls.filter((c) => c === "mailbox_inbox_filter_counts")).toHaveLength(0);
    expect(mockRender).toHaveBeenCalled();
  });

  it("all → starred → unread déclenche deux rechargements list_threads", async () => {
    await applyListFilter("starred");
    await applyListFilter("unread");
    expect(mockLoadMailView).toHaveBeenCalledTimes(2);
  });
});
