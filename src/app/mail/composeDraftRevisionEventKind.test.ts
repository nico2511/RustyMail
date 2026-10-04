import { describe, expect, it } from "vitest";
import {
  draftRevisionEventKindLabelFr,
  formatCharsDelta,
  setPendingDraftRevisionEventKind,
  takePendingDraftRevisionEventKind,
} from "./composeDraftRevisionEventKind";

describe("composeDraftRevisionEventKind", () => {
  it("consomme le kind en attente", () => {
    setPendingDraftRevisionEventKind("rewrite");
    expect(takePendingDraftRevisionEventKind()).toBe("rewrite");
    expect(takePendingDraftRevisionEventKind()).toBe("edit");
  });

  it("libellés FR + delta", () => {
    expect(draftRevisionEventKindLabelFr("tone")).toBe("Changement de ton");
    expect(formatCharsDelta(120)).toBe("+120");
    expect(formatCharsDelta(-40)).toBe("-40");
    expect(formatCharsDelta(0)).toBe("±0");
  });
});
