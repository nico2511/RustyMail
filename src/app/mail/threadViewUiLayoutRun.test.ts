import { describe, expect, it } from "vitest";
import type { CleanedMessageView } from "../types";
import { threadTreeLaneRight } from "./threadViewUiLayoutRun";

function msg(partial: Pick<CleanedMessageView, "messageId" | "sender" | "receivedAt">): CleanedMessageView {
  return {
    senderEmail: "",
    sourceText: "",
    cleanedText: "",
    attachments: [],
    collapsedQuotes: [],
    dimmedBlocks: [],
    tags: [],
    entities: [],
    ...partial,
  };
}

describe("threadTreeLaneRight", () => {
  const thread = {
    messages: [
      msg({ messageId: "root-me", sender: "Nicolas", receivedAt: "2026-09-14T13:21:00" }),
      msg({ messageId: "other", sender: "Secrétariat", receivedAt: "2026-09-17T09:44:00" }),
      msg({ messageId: "reply-me", sender: "Nicolas", receivedAt: "2026-09-18T11:00:00" }),
    ],
  };

  it("ne place plus personne sur une voie droite, y compris « moi » et la racine", () => {
    for (const message of thread.messages) {
      expect(threadTreeLaneRight(thread, message).laneRight).toBe(false);
    }
    expect(threadTreeLaneRight(thread, thread.messages[0]).isRoot).toBe(true);
    expect(threadTreeLaneRight(thread, thread.messages[1]).isRoot).toBe(false);
    expect(threadTreeLaneRight(thread, thread.messages[2]).isRoot).toBe(false);
  });
});
