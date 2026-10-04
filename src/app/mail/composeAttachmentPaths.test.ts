import { describe, expect, it } from "vitest";
import {
  attachmentPathsFromHiddenField,
  attachmentPathsJoinedForHiddenField,
  MAX_COMPOSE_ATTACHMENTS,
} from "./composeAttachmentPaths";

describe("composeAttachmentPaths", () => {
  it("round-trips paths with unit separator", () => {
    const paths = ["C:\\a\\b.pdf", "/tmp/c d.png"];
    const joined = attachmentPathsJoinedForHiddenField(paths);
    expect(attachmentPathsFromHiddenField(joined)).toEqual(paths);
  });

  it("dedupes and trims on parse", () => {
    expect(attachmentPathsFromHiddenField(" a \u001f a \u001f b ")).toEqual(["a", "b"]);
  });

  it("keeps IPC attachment cap at 50", () => {
    expect(MAX_COMPOSE_ATTACHMENTS).toBe(50);
  });
});
