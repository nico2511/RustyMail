import { describe, expect, it, vi } from "vitest";
import { formatAssistSlotLabel } from "./agentSchedulingDraftFormat";
import { userTimeZone } from "../lib/timeZone";
import { buildAssistPayload } from "../../assistAgent";

describe("formatAssistSlotLabel", () => {
  it("formate un créneau en français", () => {
    const label = formatAssistSlotLabel(
      {
        start: "2026-11-05T14:00",
        end: "2026-11-05T15:00",
        timezone: "Europe/Paris",
      },
      "fr",
    );
    expect(label).toMatch(/5 nov\./i);
    expect(label).toMatch(/14:00/);
    expect(label).toMatch(/15:00/);
    expect(label).toContain("(Europe/Paris)");
  });

  it("repli fr si locale invalide", () => {
    const Real = Intl.DateTimeFormat;
    const spy = vi.spyOn(Intl, "DateTimeFormat").mockImplementation((loc, opts) => {
      if (loc === "not-a-real-locale-tag") {
        throw new RangeError("invalid locale");
      }
      return new Real(loc, opts);
    });
    const label = formatAssistSlotLabel(
      {
        start: "2026-11-05T14:00",
        end: "2026-11-05T15:00",
        timezone: "Europe/Paris",
      },
      "not-a-real-locale-tag",
    );
    spy.mockRestore();
    expect(label).toMatch(/nov\./i);
  });

  it("ignore composantes illisibles", () => {
    expect(
      formatAssistSlotLabel(
        { start: "bad", end: "2026-11-05T15:00", timezone: "Europe/Paris" },
        "fr",
      ),
    ).toBeNull();
  });
});

describe("userTimeZone", () => {
  it("repli Europe/Paris si Intl lève", () => {
    const spy = vi.spyOn(Intl, "DateTimeFormat").mockImplementation(() => {
      throw new RangeError("fail");
    });
    expect(userTimeZone()).toBe("Europe/Paris");
    spy.mockRestore();
  });
});

describe("buildAssistPayload", () => {
  it("inclut userPrefs.timezone", () => {
    const p = buildAssistPayload("t1", "a@example.com", "deep", []);
    expect(p.userPrefs?.timezone).toBeTruthy();
  });
});
