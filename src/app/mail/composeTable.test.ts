// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from "vitest";

const openTextPromptMock = vi.hoisted(() => vi.fn());

vi.mock("../modals/promptConfirm", () => ({
  openTextPromptModal: openTextPromptMock,
}));

vi.mock("../lib/toast", () => ({
  toast: Object.assign(vi.fn(), { warning: vi.fn(), error: vi.fn() }),
}));

import { clampComposeTableDim, promptComposeTableSize } from "./composeTable";

describe("clampComposeTableDim", () => {
  it("borne les dimensions entre 1 et 20", () => {
    expect(clampComposeTableDim(3, 3)).toBe(3);
    expect(clampComposeTableDim(0, 3)).toBe(1);
    expect(clampComposeTableDim(99, 3)).toBe(20);
    expect(clampComposeTableDim(Number.NaN, 3)).toBe(3);
  });
});

describe("promptComposeTableSize", () => {
  beforeEach(() => {
    openTextPromptMock.mockReset();
  });

  it("annuler n'insère pas de tableau", async () => {
    openTextPromptMock.mockResolvedValueOnce(null);
    expect(await promptComposeTableSize()).toBeNull();
    expect(openTextPromptMock).toHaveBeenCalledTimes(1);
  });
});
