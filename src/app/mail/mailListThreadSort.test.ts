import { describe, expect, it } from "vitest";
import type { ThreadListItem } from "../types";
import { sortThreadsByLastActivity } from "./mailListThreadSort";

function thread(id: string, lastActivity: string): ThreadListItem {
  return {
    id,
    subject: id,
    preview: "",
    participants: [],
    lastActivity,
    unread: false,
    messageCount: 1,
    pinned: false,
    tags: [],
  };
}

describe("sortThreadsByLastActivity", () => {
  it("classe du plus ancien au plus récent en asc", () => {
    const a = thread("a", "2024-01-01T10:00:00Z");
    const b = thread("b", "2024-06-01T10:00:00Z");
    const c = thread("c", "2024-03-01T10:00:00Z");
    expect(sortThreadsByLastActivity([b, a, c], "asc").map((t) => t.id)).toEqual(["a", "c", "b"]);
  });

  it("classe du plus récent au plus ancien en desc", () => {
    const a = thread("a", "2024-01-01T10:00:00Z");
    const b = thread("b", "2024-06-01T10:00:00Z");
    expect(sortThreadsByLastActivity([a, b], "desc").map((t) => t.id)).toEqual(["b", "a"]);
  });
});
