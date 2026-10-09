// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from "vitest";

const invokeMock = vi.hoisted(() => vi.fn());

vi.mock("@tauri-apps/api/core", () => ({
  invoke: invokeMock,
}));

vi.mock("../lib/tauriRuntime", () => ({
  isTauriRuntime: () => true,
}));

vi.mock("../dispatch", () => ({
  render: () => {},
}));

vi.mock("../../searchHistory", () => ({
  recordSearchHistory: async () => {},
}));

vi.mock("../lib/tauriCommand", async () => {
  const actual = await vi.importActual<typeof import("../lib/tauriCommand")>("../lib/tauriCommand");
  return {
    ...actual,
    withTimeout: async <T>(promise: Promise<T>) => promise,
    tauriErrorMessage: (error: unknown) => (error instanceof Error ? error.message : String(error)),
  };
});

import { state } from "../state";
import { searchThreads } from "./searchThreadsRun";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("searchThreads", () => {
  beforeEach(() => {
    invokeMock.mockReset();
    state.selectedAccountId = "acc-1";
    state.search = "facture";
    state.searchDraft = "facture";
    state.threads = [{ id: "old", subject: "ancien" } as (typeof state.threads)[number]];
    state.searchResultOffset = 0;
    state.searchHasMore = false;
    state.mailListError = "";
    state.selectedMailbox = "INBOX";
  });

  it("ignore une page append tardive après une recherche plus récente", async () => {
    const late = deferred<Array<{ id: string; subject: string }>>();
    const fresh = deferred<Array<{ id: string; subject: string }>>();
    invokeMock.mockImplementationOnce(() => late.promise).mockImplementationOnce(() => fresh.promise);

    const first = searchThreads({ append: true });
    const second = searchThreads();
    fresh.resolve([{ id: "b", subject: "B" }]);
    await second;
    late.resolve([{ id: "a", subject: "A" }]);
    await first;

    expect(state.threads.map((thread) => thread.id)).toEqual(["b"]);
    expect(state.searchResultOffset).toBe(1);
    expect(state.searchHasMore).toBe(false);
    expect(state.mailListError).toBe("");
  });

  it("ignore l'erreur tardive d'une génération dépassée", async () => {
    const late = deferred<Array<{ id: string; subject: string }>>();
    const fresh = deferred<Array<{ id: string; subject: string }>>();
    invokeMock.mockImplementationOnce(() => late.promise).mockImplementationOnce(() => fresh.promise);

    const first = searchThreads({ append: true });
    const second = searchThreads();
    fresh.resolve([{ id: "b", subject: "B" }]);
    await second;
    late.reject(new Error("réseau"));
    await first;

    expect(state.threads.map((thread) => thread.id)).toEqual(["b"]);
    expect(state.mailListError).toBe("");
  });
});
