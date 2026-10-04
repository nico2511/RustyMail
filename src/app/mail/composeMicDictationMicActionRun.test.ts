// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { state } from "../state";
import { micDictationCtx } from "./composeMicDictationContext";
import { micAction } from "./composeMicDictationMicActionRun";

const startMock = vi.hoisted(() => vi.fn(async () => undefined));
const stopMock = vi.hoisted(() => vi.fn(async () => undefined));

vi.mock("./composeMicDictationStartRun", () => ({
  startMicDictationRecording: startMock,
}));
vi.mock("./composeMicDictationStopRun", () => ({
  stopMicDictationAndTranscribe: stopMock,
}));

describe("micAction", () => {
  beforeEach(() => {
    startMock.mockClear();
    stopMock.mockClear();
    state.micState = "idle";
    micDictationCtx.startInFlight = false;
    micDictationCtx.stopInFlight = false;
  });

  afterEach(() => {
    state.micState = "idle";
    micDictationCtx.startInFlight = false;
    micDictationCtx.stopInFlight = false;
  });

  it("ignore pendant processing", async () => {
    state.micState = "processing";
    await micAction();
    expect(startMock).not.toHaveBeenCalled();
    expect(stopMock).not.toHaveBeenCalled();
  });

  it("ignore pendant startInFlight", async () => {
    micDictationCtx.startInFlight = true;
    await micAction();
    expect(startMock).not.toHaveBeenCalled();
  });

  it("démarre depuis idle", async () => {
    await micAction();
    expect(startMock).toHaveBeenCalledOnce();
  });

  it("arrête depuis recording", async () => {
    state.micState = "recording";
    await micAction();
    expect(stopMock).toHaveBeenCalledOnce();
  });
});
