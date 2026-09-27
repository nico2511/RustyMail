import { describe, expect, it } from "vitest";
import {
  ORG_V2_APPLY_CHUNK_SIZE,
  chunkStringIds,
  collectOrgProposalApplyIds,
  defaultOrganizationV2State,
  mergeOrgApplyProgress,
  orgV2ProposalBatchCleared,
  orgV2ScanStatusLine,
  renderOrganizationV2View,
  type OrgV2ScanReport,
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
    const withExtra = collectOrgProposalApplyIds(
      sampleProposal({
        threadIds: ["t1", "t2", "t3"],
        totalCount: 3,
      }),
    );
    expect(withExtra).toEqual(["t1", "t2", "t3"]);
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

function bareReport(overrides: Partial<OrgV2ScanReport> = {}): OrgV2ScanReport {
  return {
    proposals: [],
    stats: { threadCount: 4, mailboxCount: 2 },
    mailboxStructure: {
      totalFolders: 2,
      foldersWithMessages: 1,
      rootPersonalCount: 0,
      maxDepth: 1,
      summaryLines: [],
      entries: [],
    },
    memory: { suppressedCount: 0, ignoredMailboxes: [] },
    focusNote: "note",
    ...overrides,
  };
}

describe("org V2 orientation", () => {
  it("n’invente pas de ligne de succès sans diagnostic", () => {
    const line = orgV2ScanStatusLine(
      bareReport({
        llmStatus: { succeeded: false, message: "Orientation indisponible : moteur arrêté." },
      }),
    );
    expect(line).toContain("moteur arrêté");
    expect(line).not.toContain("action(s) proposée");
  });

  it("affiche le diagnostic et masque les cartes s’il n’y a pas d’orientation", () => {
    const deps = {
      escapeHtml: (s: string) => s,
      escapeAttr: (s: string) => s,
      iconSvg: () => "",
      renderThreadSample: () => "<div>thread</div>",
      mailboxLabel: (m: string) => m,
    };
    const down = renderOrganizationV2View(
      {
        ...defaultOrganizationV2State(),
        report: bareReport({
          proposals: [sampleProposal({ title: "Carte heuristique secrète" })],
          llmStatus: { message: "Orientation indisponible : clé absente." },
        }),
      },
      deps,
    );
    expect(down).toContain("clé absente");
    expect(down).not.toContain("Carte heuristique secrète");
    expect(down).not.toContain("Aucune action en attente");

    const up = renderOrganizationV2View(
      {
        ...defaultOrganizationV2State(),
        report: bareReport({
          orientation: {
            diagnosis: "L’inbox est surtout des newsletters lues.",
            recommendations: ["Archiver le lot de plus de 30 jours."],
          },
          proposals: [sampleProposal({ title: "Archiver les lues" })],
        }),
      },
      deps,
    );
    expect(up).toContain("L’inbox est surtout des newsletters lues.");
    expect(up).toContain("Archiver le lot de plus de 30 jours.");
    expect(up).toContain("Archiver les lues");
  });
});
