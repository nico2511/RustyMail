// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from "vitest";

const invokeMock = vi.hoisted(() => vi.fn());
const pollMock = vi.hoisted(() => vi.fn());

vi.mock("@tauri-apps/api/core", () => ({
  invoke: invokeMock,
}));

vi.mock("../dispatch", () => ({
  render: () => {},
}));

vi.mock("../lib/toast", () => ({
  toast: Object.assign(vi.fn(), {
    success: vi.fn(),
    warning: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  }),
}));

vi.mock("./sendDraftImapNotice", () => ({
  toastSendDraftImapNotice: () => {},
}));

vi.mock("./mailListView", () => ({
  loadMailView: async () => {},
  loadMailboxUnread: async () => {},
}));

vi.mock("./fetchOpenThread", () => ({
  fetchOpenThreadOrNotify: async () => null,
}));

vi.mock("./composeSendDraftInvokeRun", () => ({
  pollSendDraftUntilTerminal: pollMock,
}));

import { state } from "../state";
import { releaseQuickReplySendId, sendQuickReply } from "./composeSendQuickReply";

const prepared = {
  id: "qr-draft",
  kind: "Reply",
  to: [{ email: "bob@example.com" }],
  cc: [],
  bcc: [],
  subject: "Re: Hello",
  markdownBody: "",
  sendHtml: true,
  references: [],
  attachmentPaths: [],
};

function sendIds(): string[] {
  return invokeMock.mock.calls
    .filter((call) => call[0] === "send_draft")
    .map((call) => call[1].sendId as string);
}

describe("sendQuickReply", () => {
  beforeEach(() => {
    invokeMock.mockReset();
    pollMock.mockReset();
    releaseQuickReplySendId("thread-1", "Merci\n");
    document.body.innerHTML = `<input data-quick-reply value="Merci" />`;
    state.selectedThreadId = "thread-1";
    state.selectedThread = undefined;
    invokeMock.mockImplementation((command: string) => {
      if (command === "prepare_reply" || command === "prepare_reply_all") {
        return Promise.resolve({ ...prepared });
      }
      return Promise.resolve({ imapNotice: null });
    });
  });

  it("deux « Merci » sur le même fil partent avec deux identifiants", async () => {
    await sendQuickReply("reply");
    const input = document.querySelector<HTMLInputElement>("[data-quick-reply]");
    if (input) input.value = "Merci";
    await sendQuickReply("reply");
    const ids = sendIds();
    expect(ids).toHaveLength(2);
    expect(ids[1]).not.toBe(ids[0]);
  });

  it("un sondage encore en vol conserve l'id pour le prochain essai", async () => {
    invokeMock.mockImplementation((command: string) => {
      if (command === "prepare_reply") return Promise.resolve({ ...prepared });
      return Promise.reject(new Error("Tauri command timeout"));
    });
    pollMock.mockResolvedValue(null);
    await sendQuickReply("reply");
    const input = document.querySelector<HTMLInputElement>("[data-quick-reply]");
    if (input) input.value = "Merci";
    await sendQuickReply("reply");
    const ids = sendIds();
    expect(ids).toHaveLength(2);
    expect(ids[1]).toBe(ids[0]);
  });

  it("un échec terminal libère l'id : le Merci suivant est un nouvel envoi", async () => {
    invokeMock.mockImplementation((command: string) => {
      if (command === "prepare_reply") return Promise.resolve({ ...prepared });
      return Promise.reject(new Error("Tauri command timeout"));
    });
    pollMock.mockResolvedValueOnce({ state: "failed", error: "smtp" });
    await sendQuickReply("reply");
    invokeMock.mockImplementation((command: string) => {
      if (command === "prepare_reply") return Promise.resolve({ ...prepared });
      return Promise.resolve({ imapNotice: null });
    });
    const input = document.querySelector<HTMLInputElement>("[data-quick-reply]");
    if (input) input.value = "Merci";
    await sendQuickReply("reply");
    const ids = sendIds();
    expect(ids).toHaveLength(2);
    expect(ids[1]).not.toBe(ids[0]);
  });

  it("« déjà en cours » conserve l'id et sonde", async () => {
    invokeMock.mockImplementation((command: string) => {
      if (command === "prepare_reply") return Promise.resolve({ ...prepared });
      return Promise.reject(new Error("Envoi déjà en cours"));
    });
    pollMock.mockResolvedValue(null);
    await sendQuickReply("reply");
    const input = document.querySelector<HTMLInputElement>("[data-quick-reply]");
    if (input) input.value = "Merci";
    await sendQuickReply("reply");
    const ids = sendIds();
    expect(ids).toHaveLength(2);
    expect(ids[1]).toBe(ids[0]);
    expect(pollMock).toHaveBeenCalled();
  });
});
