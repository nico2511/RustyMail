// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from "vitest";
import { COMPOSE_HTML_MARK } from "./composeHtmlBody";
import {
  composeDraftUserHasEdited,
  draftBodyIdentity,
  draftCloseNeedsSavePrompt,
  draftHasMeaningfulContent,
  draftRevisionContentKey,
  draftSavedContentMatches,
  markComposeDraftEdited,
  rememberDraftContentSaved,
  resetDraftContentMemory,
  shouldAutosaveDraftRevision,
} from "./composeDraftContentKey";
import type { Draft } from "../types";

function draft(partial: Partial<Draft> = {}): Draft {
  return {
    id: "draft-local",
    kind: "New",
    to: [],
    cc: [],
    bcc: [],
    subject: "",
    markdownBody: "",
    sendHtml: true,
    inReplyTo: null,
    references: [],
    attachmentPaths: [],
    threadId: null,
    ...partial,
  };
}

const sessionId = "session-1";

beforeEach(() => {
  resetDraftContentMemory();
});

describe("contenu de brouillon pour l’historique", () => {
  it("ignore les zones HTML vides", () => {
    expect(draftHasMeaningfulContent(draft({ markdownBody: `${COMPOSE_HTML_MARK}<p></p>` }))).toBe(false);
    expect(draftHasMeaningfulContent(draft({ markdownBody: `${COMPOSE_HTML_MARK}<p><br></p>` }))).toBe(false);
    expect(
      draftHasMeaningfulContent(
        draft({ markdownBody: `${COMPOSE_HTML_MARK}<p><br class="ProseMirror-trailingBreak"></p>` }),
      ),
    ).toBe(false);
    expect(draftHasMeaningfulContent(draft({ markdownBody: "   \n" }))).toBe(false);
  });

  it("garde un sujet, un texte, une image ou un destinataire", () => {
    expect(draftHasMeaningfulContent(draft({ subject: "Objet" }))).toBe(true);
    expect(draftHasMeaningfulContent(draft({ markdownBody: "Bonjour" }))).toBe(true);
    expect(
      draftHasMeaningfulContent(draft({ markdownBody: `${COMPOSE_HTML_MARK}<p><img src="data:image/png;base64,AA" alt="x"></p>` })),
    ).toBe(true);
    expect(draftHasMeaningfulContent(draft({ to: [{ email: "a@b.c" }] }))).toBe(true);
  });

  it("donne la même clé aux coquilles vides et à l’ordre des destinataires", () => {
    const emptyHtml = draft({ subject: "Objet", markdownBody: `${COMPOSE_HTML_MARK}<p></p>` });
    const empty = draft({ subject: "Objet", markdownBody: "" });
    expect(draftRevisionContentKey(emptyHtml)).toBe(draftRevisionContentKey(empty));

    const a = draft({
      subject: "Objet",
      markdownBody: "Corps",
      to: [
        { name: "Alice", email: "alice@ex.com" },
        { email: "bob@ex.com" },
      ],
    });
    const b = draft({
      subject: "Objet",
      markdownBody: "Corps",
      to: [
        { email: "bob@ex.com" },
        { name: "Alice", email: "alice@ex.com" },
      ],
    });
    expect(draftRevisionContentKey(a)).toBe(draftRevisionContentKey(b));
    expect(draftBodyIdentity(`${COMPOSE_HTML_MARK}<p>Bonjour<br class="ProseMirror-trailingBreak"></p>`)).toBe(
      draftBodyIdentity(`${COMPOSE_HTML_MARK}<p>Bonjour</p>`),
    );
  });

  it("ne propose pas d’enregistrer après une simple consultation de versions", () => {
    const saved = draft({ subject: "Objet", markdownBody: "Texte enregistré" });
    rememberDraftContentSaved(sessionId, saved);
    expect(composeDraftUserHasEdited()).toBe(false);
    expect(draftSavedContentMatches(sessionId, saved)).toBe(true);
    expect(shouldAutosaveDraftRevision(saved, sessionId)).toBe(false);
    expect(draftCloseNeedsSavePrompt(saved, sessionId)).toBe(false);
  });

  it("n’autosauvegarde pas un corps vide ni un contenu identique", () => {
    const empty = draft({ markdownBody: `${COMPOSE_HTML_MARK}<p><br></p>` });
    markComposeDraftEdited();
    expect(shouldAutosaveDraftRevision(empty, sessionId)).toBe(false);
    expect(draftCloseNeedsSavePrompt(empty, sessionId)).toBe(false);

    const text = draft({ markdownBody: "Bonjour" });
    expect(shouldAutosaveDraftRevision(text, sessionId)).toBe(true);
    expect(draftCloseNeedsSavePrompt(text, sessionId)).toBe(true);
    rememberDraftContentSaved(sessionId, text);
    markComposeDraftEdited();
    expect(shouldAutosaveDraftRevision(text, sessionId)).toBe(false);
    expect(draftCloseNeedsSavePrompt(text, sessionId)).toBe(false);
  });

  it("demande d’enregistrer seulement si le texte a changé depuis le dernier snapshot", () => {
    const saved = draft({ markdownBody: "Version A" });
    rememberDraftContentSaved(sessionId, saved);
    const next = draft({ markdownBody: "Version B" });
    expect(draftCloseNeedsSavePrompt(next, sessionId)).toBe(false);
    markComposeDraftEdited();
    expect(draftCloseNeedsSavePrompt(next, sessionId)).toBe(true);
    expect(shouldAutosaveDraftRevision(next, sessionId)).toBe(true);
  });
});
