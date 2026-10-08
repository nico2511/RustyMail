// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from "vitest";

const invokeMock = vi.hoisted(() => vi.fn());
let withTimeoutCalls = 0;

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
      if (withTimeoutCalls === 1) throw new Error("Tauri command timeout");
      return promise;
    },
    tauriErrorMessage: (error: unknown) => (error instanceof Error ? error.message : String(error)),
  };
});

import { state } from "../state";
import { invokeSendDraft } from "./composeSendDraftInvokeRun";
import type { Draft } from "../types";

describe("invokeSendDraft", () => {
  beforeEach(() => {
    withTimeoutCalls = 0;
    invokeMock.mockReset();
    state.composeMessage = "";
    state.composeSendId = "11111111-2222-4333-8444-555555555555";
    state.sendDraftInFlight = false;
    state.selectedThreadId = undefined;
  });

  it("un délai dépassé affiche un statut inconnu puis Done, jamais un échec", async () => {
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
      expect.objectContaining({ sendId: state.composeSendId || "11111111-2222-4333-8444-555555555555" }),
    );
  });
});
