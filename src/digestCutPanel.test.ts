// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { handleDigestCutAction } from "./app/mail/digestCutActions";
import { digestCut } from "./app/mail/digestCutState";
import { renderDigestCutPanel } from "./app/ui/render/digestCutRender";

beforeEach(() => {
  digestCut.sampleLoaded = false;
  digestCut.html = "";
  digestCut.senderEmail = "";
  digestCut.subject = "";
  digestCut.proposal = null;
  digestCut.yaml = "";
  digestCut.yamlReady = false;
  digestCut.proposing = false;
  digestCut.previewing = false;
  digestCut.previewApplicable = null;
  digestCut.previewHtml = "";
  digestCut.previewError = "";
  digestCut.notice = "";
});

describe("renderDigestCutPanel", () => {
  it("exposes propose, zone controls, and no reading enable switch", () => {
    const html = renderDigestCutPanel();
    expect(html).toContain("Éditeur de découpe");
    expect(html).toContain('data-action="digest-cut-propose"');
    expect(html).toContain('data-action="digest-cut-preview"');
    expect(html).toContain('id="digest-cut-yaml"');
    expect(html).not.toContain("digest-bench-enable");
    expect(html).toContain("ne l'active pas en lecture");
  });

  it("renders zone toggles when a proposal exists", () => {
    digestCut.proposal = {
      fixtureId: "deblock-com",
      ruleSetVersion: "1",
      source: "heuristic",
      match: {
        senderDomains: [{ exact: "deblock.com" }],
        structureRoot: "div.f-fallback",
        minChildren: 3,
      },
      zones: {
        header: { action: "show", anchors: [{ selector: "h3", index: 0 }], rationale: "titre" },
        body: { action: "show", anchors: [{ selector: "p", index: 0 }], rationale: "corps" },
        footer: { action: "hide", anchors: [{ selector: "div", classContains: "warning" }], rationale: "pied" },
      },
    };
    const html = renderDigestCutPanel();
    expect(html).toContain('data-action="digest-cut-zone"');
    expect(html).toContain("Masquer");
  });
});

describe("handleDigestCutAction", () => {
  it("updates zone action without calling reading enable", async () => {
    digestCut.proposal = {
      fixtureId: "deblock-com",
      ruleSetVersion: "1",
      source: "heuristic",
      match: {
        senderDomains: [{ exact: "deblock.com" }],
        structureRoot: "div.f-fallback",
        minChildren: 3,
      },
      zones: {
        header: { action: "show", anchors: [] },
        body: { action: "show", anchors: [] },
        footer: { action: "hide", anchors: [] },
      },
    };
    document.body.innerHTML = renderDigestCutPanel();
    const invokeMock = vi.fn();
    vi.stubGlobal("__TAURI_INTERNALS__", { invoke: invokeMock });
    const hide = document.querySelector<HTMLElement>(
      '[data-zone="footer"][data-zone-action="hide"]',
    );
    expect(await handleDigestCutAction("digest-cut-zone", hide ?? undefined)).toBe(true);
    expect(digestCut.proposal?.zones.footer.action).toBe("hide");
    expect(invokeMock).not.toHaveBeenCalledWith("digest_bench_enable_reading");
    vi.unstubAllGlobals();
  });
});
