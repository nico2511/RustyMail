// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from "vitest";

const invokeMock = vi.hoisted(() => vi.fn());

vi.mock("@tauri-apps/api/core", () => ({
  invoke: invokeMock,
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
import { refreshMailboxes } from "./refreshMailboxesRun";

describe("refreshMailboxes", () => {
  beforeEach(() => {
    invokeMock.mockReset();
    state.mailboxes = ["INBOX", "Travail"];
    state.mailboxListError = "";
  });

  it("conserve la liste et pose l'erreur si le chargement échoue", async () => {
    invokeMock.mockRejectedValue(new Error("timeout"));
    const list = await refreshMailboxes("acc-1");
    expect(list).toEqual(["INBOX", "Travail"]);
    expect(state.mailboxes).toEqual(["INBOX", "Travail"]);
    expect(state.mailboxListError).toContain("timeout");
  });
});
