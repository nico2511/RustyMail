// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from "vitest";
import type { Account } from "../../../accountSetup";
import { DEMO_PLAYGROUND_ACCOUNT_ID } from "../../core/demoAccount";
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

function account(id: string, email: string, displayName = ""): Account {
  return {
    id,
    displayName,
    email,
    imap: { host: "imap.example", port: 993, security: "Tls", allowInvalidTls: false },
    smtp: { host: "smtp.example", port: 587, security: "StartTls", allowInvalidTls: false },
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
  state.accounts = [];
  state.selectedAccountId = undefined;
  state.composeSendAccountId = undefined;
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

  it("n’affiche pas une correction dont le corps ne contient plus l’extrait", () => {
    state.composeBody = "";
    state.composeCanonicalBody = "";
    state.composeGrammarSuggestions = [
      { reason: "ponctuation", original: "Salu je mappel nicola", replacement: "Salut, je m'appelle Nicola" },
    ];
    const html = renderComposer();
    expect(html).not.toContain("Correction de texte");
    expect(html).not.toContain("Salu je mappel nicola");
    expect(state.composeGrammarSuggestions).toBeNull();
  });

  it("affiche De seulement avec au moins deux comptes hors démo", () => {
    state.accounts = [
      account(DEMO_PLAYGROUND_ACCOUNT_ID, DEMO_PLAYGROUND_ACCOUNT_ID, "Démo"),
      account("a1", "a@example.com", "Alice"),
    ];
    state.selectedAccountId = "a1";
    state.composeSendAccountId = "a1";
    expect(renderComposer()).not.toContain("compose-from-account");

    state.accounts = [
      account(DEMO_PLAYGROUND_ACCOUNT_ID, DEMO_PLAYGROUND_ACCOUNT_ID, "Démo"),
      account("a1", "a@example.com", "Alice"),
      account("b1", "b@example.com", "Bob"),
    ];
    state.composeSendAccountId = "b1";
    const html = renderComposer();
    expect(html).toContain('id="compose-from-account"');
    expect(html).toContain(">De<");
    expect(html).toContain('value="a1"');
    expect(html).toContain('value="b1" selected');
    expect(html).not.toContain(`value="${DEMO_PLAYGROUND_ACCOUNT_ID}"`);
  });
});
