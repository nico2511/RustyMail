// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from "vitest";

const invokeMock = vi.hoisted(() => vi.fn());
let withTimeoutCalls = 0;
let failNextSend = false;

vi.mock("@tauri-apps/api/core", () => ({
  invoke: invokeMock,
}));

vi.mock("../lib/tauriRuntime", () => ({
  isTauriRuntime: () => true,
}));

vi.mock("../dispatch", () => ({
  render: () => {},
}));

vi.mock("../../activity", () => ({
  recordActivity: () => {},
}));

vi.mock("../lib/toast", () => ({
  toast: Object.assign(vi.fn(), { warning: vi.fn(), error: vi.fn(), info: vi.fn() }),
}));

vi.mock("./sendDraftImapNotice", () => ({
  toastSendDraftImapNotice: () => {},
}));

vi.mock("./composeSendDraftFinishRun", () => ({
  composeSendDraftRunDeps: () => ({ clearDraftSession: () => {} }),
  finishComposeAfterSuccessfulSend: async () => {},
}));

vi.mock("../lib/tauriCommand", async () => {
  const actual = await vi.importActual<typeof import("../lib/tauriCommand")>("../lib/tauriCommand");
  return {
    ...actual,
    withTimeout: async <T>(promise: Promise<T>) => {
      withTimeoutCalls += 1;
      if (failNextSend) {
        failNextSend = false;
        throw new Error("Tauri command timeout");
      }
      return promise;
    },
    tauriErrorMessage: (error: unknown) => (error instanceof Error ? error.message : String(error)),
  };
});

import { state } from "../state";
import { invokeSendDraft, sendDraftPoll } from "./composeSendDraftInvokeRun";
import { resetComposeSendId } from "./composeSendId";
import type { Draft } from "../types";

describe("invokeSendDraft", () => {
  beforeEach(() => {
    withTimeoutCalls = 0;
    failNextSend = false;
    sendDraftPoll.maxAttempts = 24;
    sendDraftPoll.delayMs = (attempt: number) => Math.min(Math.round(1500 * 1.5 ** attempt), 8_000);
    invokeMock.mockReset();
    state.composeMessage = "";
    state.composeSendId = "11111111-2222-4333-8444-555555555555";
    state.sendDraftInFlight = false;
    state.selectedThreadId = undefined;
  });

  it("un délai dépassé affiche un statut inconnu puis Done, jamais un échec", async () => {
    failNextSend = true;
    invokeMock.mockImplementation((command: string) => {
      if (command === "send_draft_status") {
        return Promise.resolve({ state: "done", imapNotice: null });
      }
      return new Promise(() => {});
    });
    const draft = { to: [], subject: "s", markdownBody: "" } as Draft;
    await invokeSendDraft("acc-1", draft);
    expect(state.composeMessage).toBe("Email envoyé");
    expect(state.composeMessage.toLowerCase()).not.toContain("échoué");
    expect(state.sendDraftInFlight).toBe(false);
    expect(invokeMock).toHaveBeenCalledWith(
      "send_draft_status",
      expect.objectContaining({ sendId: "11111111-2222-4333-8444-555555555555" }),
    );
  });

  it("un sondage qui reste en vol lève l'indicateur sans effacer l'id", async () => {
    failNextSend = true;
    sendDraftPoll.maxAttempts = 2;
    sendDraftPoll.delayMs = () => 0;
    invokeMock.mockImplementation((command: string) => {
      if (command === "send_draft_status") return Promise.resolve({ state: "inFlight" });
      return Promise.resolve({ imapNotice: null });
    });
    const draft = { to: [], subject: "s", markdownBody: "" } as Draft;
    await invokeSendDraft("acc-1", draft);
    expect(state.sendDraftInFlight).toBe(false);
    expect(state.composeSendId).toBe("11111111-2222-4333-8444-555555555555");
    expect(state.composeMessage.toLowerCase()).not.toContain("échoué");
  });

  it("un autre brouillon après délai ne réutilise pas l'id déjà suivi", async () => {
    failNextSend = true;
    sendDraftPoll.maxAttempts = 1;
    sendDraftPoll.delayMs = () => 0;
    invokeMock.mockImplementation((command: string) => {
      if (command === "send_draft_status") return Promise.resolve({ state: "inFlight" });
      return Promise.resolve({ imapNotice: null });
    });
    const first = { to: [], subject: "un", markdownBody: "a" } as Draft;
    await invokeSendDraft("acc-1", first);
    const stale = state.composeSendId;
    resetComposeSendId();
    expect(state.composeSendId).not.toBe(stale);
    failNextSend = true;
    const second = { to: [], subject: "deux", markdownBody: "b" } as Draft;
    await invokeSendDraft("acc-1", second);
    const sendCalls = invokeMock.mock.calls.filter((call) => call[0] === "send_draft");
    expect(sendCalls).toHaveLength(2);
    expect(sendCalls[0][1]).toEqual(expect.objectContaining({ sendId: stale }));
    expect(sendCalls[1][1]).toEqual(expect.objectContaining({ sendId: state.composeSendId }));
    expect(sendCalls[1][1].sendId).not.toBe(stale);
  });
});
