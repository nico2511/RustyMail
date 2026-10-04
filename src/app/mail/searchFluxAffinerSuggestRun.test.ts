// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from "vitest";

const invokeMock = vi.hoisted(() => vi.fn());
const openTextPromptMock = vi.hoisted(() => vi.fn());
const toastWarning = vi.hoisted(() => vi.fn());

vi.mock("@tauri-apps/api/core", () => ({
  invoke: invokeMock,
}));

vi.mock("../modals/promptConfirm", () => ({
  openTextPromptModal: openTextPromptMock,
}));

vi.mock("../lib/toast", () => ({
  toast: Object.assign(vi.fn(), { warning: toastWarning, error: vi.fn(), success: vi.fn(), info: vi.fn() }),
}));

vi.mock("../lib/tauriRuntime", () => ({
  isTauriRuntime: () => true,
}));

vi.mock("../../aiFeatures", () => ({
  isAiFeatureEnabled: () => true,
}));

vi.mock("../core/accountContext", () => ({
  currentAccount: () => ({ id: "acc-1", email: "a@b.c" }),
}));

vi.mock("./llmJobQueue", () => ({
  withLlmQueue: async (_label: string, fn: (signal: AbortSignal) => Promise<unknown>) =>
    fn(new AbortController().signal),
}));

vi.mock("./searchViewBatchContext", () => ({
  requireSearchViewBatchDeps: () => ({
    activeSavedSearchItem: () => null,
  }),
  searchViewBatchThreads: () =>
    Array.from({ length: 5 }, (_, i) => ({
      id: `t${i}`,
      subject: `Facture ${i}`,
      participants: ["billing@shop.example"],
      mailbox: "INBOX",
    })),
}));

vi.mock("../lib/tauriCommand", async () => {
  const actual = await vi.importActual<typeof import("../lib/tauriCommand")>("../lib/tauriCommand");
  return {
    ...actual,
    withTimeout: async <T>(p: Promise<T>) => p,
    tauriErrorMessage: (e: unknown) => String(e),
  };
});

import { state } from "../state";
import { runFluxAffinerSuggestAndConfirm } from "./searchFluxAffinerSuggestRun";

describe("runFluxAffinerSuggestAndConfirm", () => {
  beforeEach(() => {
    invokeMock.mockReset();
    openTextPromptMock.mockReset();
    toastWarning.mockReset();
    state.mailboxes = ["INBOX", "Finance"];
    state.search = "";
    state.appPrefs.ai.featureOrgProposalsEnabled = true;
  });

  it("laisse éditer le nom avant création", async () => {
    invokeMock.mockResolvedValue({
      folderTitle: "Factures Amazon",
      confidence: 0.8,
      rationale: "Les sujets concernent des factures Amazon.",
    });
    openTextPromptMock.mockResolvedValue("Achats Amazon");
    const ctx = await runFluxAffinerSuggestAndConfirm();
    expect(ctx?.mailbox).toBe("Achats Amazon");
    expect(openTextPromptMock).toHaveBeenCalledOnce();
  });

  it("refuse un nom générique saisi à la main", async () => {
    invokeMock.mockResolvedValue({
      folderTitle: "Factures Amazon",
      confidence: 0.8,
      rationale: "Les sujets concernent des factures Amazon.",
    });
    openTextPromptMock.mockResolvedValue("Recherche");
    const ctx = await runFluxAffinerSuggestAndConfirm();
    expect(ctx).toBeNull();
    expect(toastWarning).toHaveBeenCalled();
  });
});
