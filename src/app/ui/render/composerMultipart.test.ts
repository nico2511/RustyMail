// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from "vitest";
import { state } from "../../state";
import type { Draft } from "../../types";
import { renderComposer } from "./composerRender";
import { registerRenderDeps, type RenderDeps } from "./renderDeps";

function emptyDraft(): Draft {
  return {
    id: "draft-local",
    kind: "New",
    to: [],
    cc: [],
    bcc: [],
    subject: "",
    markdownBody: "",
    sendHtml: false,
    inReplyTo: null,
    references: [],
    attachmentPaths: [],
    threadId: null,
  };
}

beforeEach(() => {
  registerRenderDeps({
    draftHasRecipientsExtra: () => false,
    composeKindTitle: () => "Nouveau message",
    attachmentPathsJoinedForHiddenField: () => "",
    composeMicButtonTitle: () => "Dicter",
    micAriaLabel: () => "Micro",
    formatDraftRevisionStamp: () => "",
    sanitizeEmailHtml: (html: string) => ({ html, stripped: false }),
  } as unknown as RenderDeps);
  state.view = "compose";
  state.composeLayout = "write";
  state.composeAdvancedOpen = true;
  state.composeBody = "Bonjour";
  state.composeCanonicalBody = "Bonjour";
  state.draft = emptyDraft();
});

describe("renderComposer", () => {
  it("n’affiche plus le réglage multipart et garde la barre IA", () => {
    const html = renderComposer();
    expect(html).not.toContain("compose-send-html");
    expect(html).not.toContain("Options techniques");
    expect(html).not.toContain("multipart HTML");
    expect(html).not.toContain("toggle-compose-advanced");
    expect(html).toContain("compose-tiptap");
    expect(html).toContain("Réécrire");
    expect(html).toContain("Correction");
    expect(html).toContain('data-compose-cmd="ai:grammar"');
    expect(html).toContain('data-compose-cmd="ai:rewrite"');
  });
});
