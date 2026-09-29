// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from "vitest";
import { state } from "../state";
import { clearComposeGrammarUi, syncStaleComposeGrammarSuggestions } from "./composeGrammarPanelSync";
import { startNewDraftSession } from "./composeDraftSession";

beforeEach(() => {
  state.composeGrammarSuggestions = [
    { reason: "ponctuation", original: "Salu je mappel nicola", replacement: "Salut, je m'appelle Nicola" },
  ];
  document.body.innerHTML = `
    <aside class="compose-correction-panel">
      <ul>
        <li class="compose-correction-item">
          <button type="button" data-grammar-i="0">Appliquer</button>
        </li>
      </ul>
    </aside>`;
});

describe("syncStaleComposeGrammarSuggestions", () => {
  it("retire le panneau quand le corps ne contient plus l’extrait", () => {
    syncStaleComposeGrammarSuggestions("");
    expect(state.composeGrammarSuggestions).toBeNull();
    expect(document.querySelector(".compose-correction-panel")).toBeNull();
  });

  it("efface la correction à l’ouverture d’un nouveau message", () => {
    startNewDraftSession();
    expect(state.composeGrammarSuggestions).toBeNull();
    clearComposeGrammarUi();
  });
});
