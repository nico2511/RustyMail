import { afterEach, describe, expect, it } from "vitest";
import { clearThreadsRecentlyRemoved, isThreadRecentlyRemoved } from "../../recentlyRemovedThreads";
import { state } from "../state";
import type { ThreadListItem } from "../types";
import { visibleSavedDraftThreads } from "./mailListLoadSavedDraftsRun";
import { forgetSavedDraftLocally } from "./savedDraftListLocalForget";

function draftRow(id: string, subject: string): ThreadListItem {
  return {
    id,
    subject,
    preview: "",
    participants: ["Brouillon"],
    lastActivity: "2026-09-30T08:00:00Z",
    messageCount: 0,
    unread: false,
    pinned: false,
    tags: [],
  };
}

const IDS = ["saved-draft:sd-1", "saved-draft:sd-2"] as const;

afterEach(() => {
  clearThreadsRecentlyRemoved(IDS);
  state.threads = [];
  state.savedDraftsMailboxCount = 0;
  state.selectedThreadId = undefined;
  state.selectedThread = undefined;
  state.search = "";
});

describe("forgetSavedDraftLocally", () => {
  it("retire la ligne supprimée et décrémente le compteur Sauvés", () => {
    state.threads = [draftRow("saved-draft:sd-1", "Salut ça va ?"), draftRow("saved-draft:sd-2", "Autre")];
    state.savedDraftsMailboxCount = 2;
    state.selectedThreadId = "saved-draft:sd-1";

    forgetSavedDraftLocally("sd-1");

    expect(state.threads.map((t) => t.id)).toEqual(["saved-draft:sd-2"]);
    expect(state.savedDraftsMailboxCount).toBe(1);
    expect(state.selectedThreadId).toBe("saved-draft:sd-2");
    expect(isThreadRecentlyRemoved("saved-draft:sd-1")).toBe(true);
  });
});

describe("visibleSavedDraftThreads", () => {
  it("ne réaffiche pas un brouillon retiré, même si SQLite le renvoie encore", () => {
    const rows = [draftRow("saved-draft:sd-1", "Salut ça va ?"), draftRow("saved-draft:sd-2", "Autre")];
    forgetSavedDraftLocally("sd-1");
    state.threads = rows;

    expect(visibleSavedDraftThreads(rows).map((t) => t.subject)).toEqual(["Autre"]);
  });

  it("applique le filtre texte de la barre Sauvés", () => {
    state.search = "salut";
    const rows = [draftRow("saved-draft:sd-1", "Salut ça va ?"), draftRow("saved-draft:sd-2", "Facture")];
    expect(visibleSavedDraftThreads(rows).map((t) => t.id)).toEqual(["saved-draft:sd-1"]);
  });
});
