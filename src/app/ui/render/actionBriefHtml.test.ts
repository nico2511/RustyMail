import { describe, expect, it } from "vitest";

import type { ActionBriefResult } from "../../types";
import { renderActionBriefHtml } from "./actionBriefHtml";

function brief(outputPartial: boolean): ActionBriefResult {
  return {
    accountId: "a",
    mailbox: "INBOX",
    mode: "Deep",
    changes: [],
    decisions: [],
    recommendedActions: [],
    risks: [],
    ambiguities: [],
    evidenceLinks: [],
    confidence: 0.4,
    priorityBucket: "routine",
    verificationRecommended: outputPartial,
    outputPartial,
    executedSkills: [],
  };
}

describe("renderActionBriefHtml", () => {
  it("signale un brief dont le JSON a été réparé", () => {
    const html = renderActionBriefHtml(brief(true));
    expect(html).toContain("Brief partiel");
    expect(html).toContain("ne pas traiter comme une analyse complète");
    expect(html).toContain("Non disponible — JSON tronqué");
    expect(html).toContain("Brief d’action (partiel)");
    expect(renderActionBriefHtml(brief(false))).not.toContain("Brief partiel");
    expect(renderActionBriefHtml(brief(false))).not.toContain("JSON tronqué");
  });
});
