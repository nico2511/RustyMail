// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { notifySyncCompletionToasts } from "./syncInboxStatusRun";

describe("notifySyncCompletionToasts", () => {
  afterEach(() => {
    document.getElementById("toast-box")?.remove();
  });

  it("affiche un toast discret quand des messages ont été ignorés", () => {
    notifySyncCompletionToasts(undefined, false, [], [], [
      { mailbox: "INBOX", skippedUids: 2 },
    ]);
    const texts = [...document.querySelectorAll(".toast__text")].map((el) => el.textContent);
    expect(texts.some((t) => t?.includes("2 messages illisibles"))).toBe(true);
  });
});
