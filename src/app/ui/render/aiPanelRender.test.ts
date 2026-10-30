// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./renderDeps", () => ({
  renderDeps: () => ({
    threadIdsMatch: () => true,
    agentStepProgressLabel: () => "",
    agentSkillEnabled: () => true,
    agentOfferSlotsStep: () => false,
    currentAccount: () => ({ id: "acc" }),
  }),
}));

import { renderAgentPrepareReplyPanelHtml } from "./aiPanelRender";
import { state } from "../../state";

describe("aiPanelRender assist facts", () => {
  beforeEach(() => {
    state.selectedThreadId = "t1";
  });

  it("affiche Extraction partielle quand outputPartial est vrai", () => {
    state.agentSession = {
      threadId: "t1",
      accountId: "acc",
      assistMode: "deep",
      enabledSkills: [],
      busy: false,
      step: "extractFacts",
      telemetry: [],
      recommendations: [],
      clarificationQuestions: [],
      safetyFlags: [],
      consistencyIssues: [],
      slots: [],
      draft: "",
      forceDraft: false,
      facts: {
        facts: [{ kind: "date", text: "demain" }],
        ambiguities: [],
        confidence: 0.4,
        outputPartial: true,
      },
    };
    const html = renderAgentPrepareReplyPanelHtml();
    expect(html).toContain("Extraction partielle");
  });
});
