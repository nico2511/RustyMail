import { describe, expect, it } from "vitest";
import {
  ORG_V2_APPLY_CHUNK_SIZE,
  chunkStringIds,
  collectOrgProposalApplyIds,
  mergeOrgApplyProgress,
  orgV2ProposalBatchCleared,
} from "./organizationViewV2";
import type { OrgProposal } from "./organizationView";

function sampleProposal(overrides: Partial<OrgProposal> = {}): OrgProposal {
  return {
    id: "p1",
    kind: "staleInboxRead",
    title: "Test",
    rationale: "r",
    suggestedAction: "archive",
    totalCount: 2,
    threadIds: ["t1", "t2"],
    threadRefs: [
      { threadId: "t1", mailbox: "INBOX", subject: "a", from: "x", receivedAt: "" },
      { threadId: "t2", mailbox: "INBOX", subject: "b", from: "y", receivedAt: "" },
    ],
    applicable: true,
    ...overrides,
  } as OrgProposal;
}

describe("org V2 apply helpers", () => {
  it("collecte et découpe les ids", () => {
    const ids = collectOrgProposalApplyIds(sampleProposal());
    expect(ids).toEqual(["t1", "t2"]);
    expect(chunkStringIds(["a", "b", "c", "d", "e"], 2)).toEqual([
      ["a", "b"],
      ["c", "d"],
      ["e"],
    ]);
    expect(ORG_V2_APPLY_CHUNK_SIZE).toBeGreaterThan(0);
  });

  it("merge les progressions", () => {
    const merged = mergeOrgApplyProgress(
      { done: 2, total: 10, message: "a", errors: ["e1"], mailboxesToSync: ["INBOX"], threadsAffected: ["t1"] },
      { done: 3, total: 10, message: "b", errors: ["e2"], mailboxesToSync: ["INBOX", "Sent"], threadsAffected: ["t2"] },
    );
    expect(merged.done).toBe(5);
    expect(merged.errors).toEqual(["e1", "e2"]);
    expect(merged.mailboxesToSync.sort()).toEqual(["INBOX", "Sent"]);
  });

  it("détecte un lot vidé", () => {
    expect(orgV2ProposalBatchCleared(undefined)).toBe(true);
    expect(
      orgV2ProposalBatchCleared(
        sampleProposal({ totalCount: 0, threadRefs: [], threadIds: [] }),
      ),
    ).toBe(true);
    expect(orgV2ProposalBatchCleared(sampleProposal())).toBe(false);
  });
});
