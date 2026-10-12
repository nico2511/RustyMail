// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from "vitest";

const invokeMock = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({ invoke: (...args: unknown[]) => invokeMock(...args) }));
const loadMailboxUnreadMock = vi.fn(async () => {});
vi.mock("./mailListView", () => ({ loadMailboxUnread: () => loadMailboxUnreadMock() }));
const renderMock = vi.fn();
vi.mock("../dispatch", () => ({ render: () => renderMock() }));
const toastWarning = vi.fn();
vi.mock("../lib/toast", () => ({ toast: { warning: (...a: unknown[]) => toastWarning(...a), error: vi.fn() } }));

import { state } from "../state";
import { applyThreadReadLocal, markOpenedThreadReadIfUnread } from "./openThreadViewEffectsRun";
import type { OpenThreadDeps } from "./openThreadViewDepsRun";

const deps = { sourceMailboxForThread: () => "INBOX" } as unknown as OpenThreadDeps;

function seed(selectedMailbox = "INBOX"): void {
  (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {};
  state.accounts = [{ id: "acc" } as never];
  state.selectedAccountId = "acc";
  state.selectedMailbox = selectedMailbox;
  state.selectedThread = { id: "t1", unread: true, messages: [] } as never;
  state.threads = [{ id: "t1", unread: true } as never];
  state.mailboxUnread = { INBOX: 3 };
  state.inboxFilterCounts = { all: 10, unread: 3, starred: 0, focused: 0, auto: 0 };
  state.accountInboxUnread = { acc: 3 };
}

describe("mark-read à l’ouverture", () => {
  beforeEach(() => {
    invokeMock.mockReset();
    loadMailboxUnreadMock.mockClear();
    toastWarning.mockClear();
    renderMock.mockClear();
  });

  it("échec après « Retour » : pas de render complet de la BAL", async () => {
    seed();
    let rejectInvoke: (e: unknown) => void = () => {};
    invokeMock.mockReturnValue(new Promise((_, rej) => (rejectInvoke = rej)));
    const pending = markOpenedThreadReadIfUnread("t1", deps);
    state.view = "list";
    rejectInvoke(new Error("database is locked"));
    await pending;
    expect(renderMock).not.toHaveBeenCalled();

    seed();
    state.view = "thread";
    invokeMock.mockRejectedValue(new Error("database is locked"));
    await markOpenedThreadReadIfUnread("t1", deps);
    expect(renderMock).toHaveBeenCalledTimes(1);
  });

  it("succès : fil lu, compteurs relus depuis SQLite", async () => {
    seed();
    invokeMock.mockResolvedValue("Marqué comme lu (1)");
    await markOpenedThreadReadIfUnread("t1", deps);
    expect(state.selectedThread?.unread).toBe(false);
    expect(state.threads[0]?.unread).toBe(false);
    expect(loadMailboxUnreadMock).toHaveBeenCalledTimes(1);
    expect(toastWarning).not.toHaveBeenCalled();
  });

  it("échec backend : retour arrière du fil, compteurs relus, avertissement visible", async () => {
    seed();
    invokeMock.mockRejectedValue(new Error("database is locked"));
    await markOpenedThreadReadIfUnread("t1", deps);
    expect(state.selectedThread?.unread).toBe(true);
    expect(state.threads[0]?.unread).toBe(true);
    expect(loadMailboxUnreadMock).toHaveBeenCalledTimes(1);
    expect(toastWarning).toHaveBeenCalledTimes(1);
  });

  it("inboxFilterCounts n’est décrémenté que pour le dossier affiché", () => {
    seed("Archives");
    applyThreadReadLocal("t1", "INBOX");
    expect(state.inboxFilterCounts?.unread).toBe(3);
    expect(state.mailboxUnread.INBOX).toBe(2);

    seed("INBOX");
    applyThreadReadLocal("t1", "INBOX");
    expect(state.inboxFilterCounts?.unread).toBe(2);
  });
});
