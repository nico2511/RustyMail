// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from "vitest";

const invokeMock = vi.fn(async (_cmd: string, args: { threadId: string }) => ({ id: args.threadId }));
vi.mock("@tauri-apps/api/core", () => ({ invoke: (cmd: string, args: { threadId: string }) => invokeMock(cmd, args) }));
vi.mock("./mailListView", () => ({
  loadMailView: vi.fn(),
  loadMailboxUnread: vi.fn(),
  loadThreadsForSearchContext: vi.fn(),
}));
vi.mock("./searchThreadsRun", () => ({ searchThreads: vi.fn() }));

import { state } from "../state";
import { restoreThreadSelectionAfterReload } from "./syncInboxListReloadRun";

const t = (id: string) => ({ id }) as never;

describe("restoreThreadSelectionAfterReload (sync)", () => {
  beforeEach(() => {
    invokeMock.mockClear();
    state.view = "thread";
    state.threads = [t("newest"), t("b"), t("opened")];
  });

  it("garde le fil ouvert pendant la sync même si keepThreadId (capturé au début) est vide", async () => {
    state.selectedThreadId = "opened";
    state.selectedThread = { id: "opened" } as never;
    await restoreThreadSelectionAfterReload({ keepThreadId: undefined, mode: "sync" });
    expect(state.selectedThreadId).toBe("opened");
    expect(invokeMock).toHaveBeenCalledWith("open_thread", { threadId: "opened" });
    expect(invokeMock).not.toHaveBeenCalledWith("open_thread", { threadId: "newest" });
  });

  it("préfère la sélection courante à celle capturée au début de la sync", async () => {
    state.selectedThreadId = "b";
    await restoreThreadSelectionAfterReload({ keepThreadId: "opened", mode: "sync" });
    expect(state.selectedThreadId).toBe("b");
  });

  it("ne remplace pas un fil ouvert absent de la page rechargée", async () => {
    state.selectedThreadId = "elsewhere";
    state.selectedThread = { id: "elsewhere" } as never;
    await restoreThreadSelectionAfterReload({ keepThreadId: "elsewhere", mode: "sync" });
    expect(state.selectedThreadId).toBe("elsewhere");
    expect((state.selectedThread as unknown as { id: string }).id).toBe("elsewhere");
    expect(invokeMock).not.toHaveBeenCalled();
  });

  it("en vue liste sans sélection valide, sélectionne le premier fil", async () => {
    state.view = "list";
    state.selectedThreadId = "gone";
    await restoreThreadSelectionAfterReload({ keepThreadId: undefined, mode: "sync" });
    expect(state.selectedThreadId).toBe("newest");
  });
});
