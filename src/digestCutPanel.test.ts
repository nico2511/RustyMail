// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { handleDigestCutAction, importDigestCutEmlBase64 } from "./app/mail/digestCutActions";
import { digestCut } from "./app/mail/digestCutState";
import { renderDigestCutPanel } from "./app/ui/render/digestCutRender";
import { state } from "./app/state";

beforeEach(() => {
  digestCut.sourceKind = "none";
  digestCut.queryDraft = "";
  digestCut.searching = false;
  digestCut.searchError = "";
  digestCut.threads = [];
  digestCut.selectedThreadId = null;
  digestCut.threadSubject = "";
  digestCut.messages = [];
  digestCut.selectedMessageId = null;
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
  digestCut.showCode = false;
  digestCut.notice = "";
  digestCut.paintZone = null;
  digestCut.paintPick = null;
  state.selectedThread = undefined;
  state.selectedAccountId = undefined;
  state.accounts = [];
});

describe("renderDigestCutPanel", () => {
  it("shows a clear 3-step flow and keeps HTML code secondary", () => {
    const html = renderDigestCutPanel();
    expect(html).toContain("Éditeur de découpe");
    expect(html).toContain("digest-cut__steps");
    expect(html).toContain("Choisir");
    expect(html).toContain("Proposer");
    expect(html).toContain("Ajuster");
    expect(html).toContain('data-action="digest-cut-search"');
    expect(html).toContain('data-action="digest-cut-open-current"');
    expect(html).toContain('id="digest-cut-eml"');
    expect(html).toContain('data-action="digest-cut-propose"');
    expect(html).toContain('data-action="digest-cut-refine"');
    expect(html).toContain("ne change pas la lecture réelle");
    expect(html).not.toContain("digest-cut-load-sample");
    expect(html).not.toContain("échantillon");
    expect(html).not.toContain("Deblock");
    expect(html).not.toContain('id="digest-cut-yaml"');
  });

  it("shows the French explanation and zone controls, and the YAML only when code is open", () => {
    digestCut.sourceKind = "mailbox";
    digestCut.subject = "Commande";
    digestCut.senderEmail = "notes@exemple.fr";
    digestCut.html = "<p>Bonjour</p>";
    digestCut.proposal = {
      fixtureId: "exemple-fr",
      ruleSetVersion: "1",
      source: "heuristic",
      explanationFr: "L'en-tête est affiché. Le pied est masqué.",
      match: {
        senderDomains: [{ exact: "exemple.fr" }],
        structureRoot: "div.letter",
        minChildren: 2,
      },
      zones: {
        header: { action: "show", anchors: [{ selector: "h1", index: 0 }], rationale: "titre" },
        body: { action: "show", anchors: [{ selector: "p", index: 0 }], rationale: "corps" },
        footer: { action: "hide", anchors: [{ selector: "div", classContains: "footer" }], rationale: "pied" },
      },
    };
    const html = renderDigestCutPanel();
    expect(html).toContain("en-tête est affiché");
    expect(html).toContain('data-action="digest-cut-zone"');
    expect(html).toContain("En-tête");
    expect(html).toContain("depuis la boîte");
    expect(html).toContain("Repères :");
    expect(html).toContain("h1[0]");
    expect(html).toContain('data-action="digest-cut-paint-zone"');
    expect(html).toContain("Pointer dans le mail");
    expect(html).toContain('aria-pressed="true">Afficher');
    expect(html).toContain("Voir l’aperçu");
    expect(html).not.toContain('id="digest-cut-yaml"');
    digestCut.showCode = true;
    expect(renderDigestCutPanel()).toContain('id="digest-cut-yaml"');
  });
});

describe("handleDigestCutAction", () => {
  it("updates zone action and the French explanation without enabling reading", async () => {
    digestCut.proposal = {
      fixtureId: "exemple-fr",
      ruleSetVersion: "1",
      source: "heuristic",
      explanationFr: "avant",
      match: {
        senderDomains: [{ exact: "exemple.fr" }],
        structureRoot: "div.letter",
        minChildren: 2,
      },
      zones: {
        header: { action: "show", anchors: [] },
        body: { action: "show", anchors: [] },
        footer: { action: "show", anchors: [] },
      },
    };
    document.body.innerHTML = renderDigestCutPanel();
    const invokeMock = vi.fn();
    vi.stubGlobal("__TAURI_INTERNALS__", { invoke: invokeMock });
    const hide = document.querySelector<HTMLElement>('[data-zone="footer"][data-zone-action="hide"]');
    expect(await handleDigestCutAction("digest-cut-zone", hide ?? undefined)).toBe(true);
    expect(digestCut.proposal?.zones.footer.action).toBe("hide");
    expect(digestCut.proposal?.explanationFr).toContain("Pied masqué");
    expect(invokeMock).not.toHaveBeenCalledWith("digest_bench_enable_reading");
    vi.unstubAllGlobals();
  });

  it("refuses to propose before a mail is loaded", async () => {
    expect(await handleDigestCutAction("digest-cut-propose")).toBe(true);
    expect(digestCut.notice).toContain("boîte");
    expect(digestCut.proposal).toBeNull();
  });

  it("explains how to open the mail already on screen", async () => {
    expect(await handleDigestCutAction("digest-cut-open-current")).toBe(true);
    expect(digestCut.notice).toContain("Ouvrez un mail");
    expect(digestCut.html).toBe("");
  });

  it("loads the message currently open in the reader", async () => {
    state.selectedThread = {
      id: "t1",
      subject: "Facture",
      messages: [
        {
          messageId: "m1",
          sender: "Shop",
          senderEmail: "notes@exemple.fr",
          receivedAt: "",
          sourceText: "",
          cleanedText: "",
          htmlBody: "<p>Montant 12 EUR</p>",
          attachments: [],
          collapsedQuotes: [],
          dimmedBlocks: [],
          tags: [],
          entities: [],
        },
      ],
      tags: [],
      entities: [],
    };
    expect(await handleDigestCutAction("digest-cut-open-current")).toBe(true);
    expect(digestCut.sourceKind).toBe("open");
    expect(digestCut.subject).toBe("Facture");
    expect(digestCut.html).toContain("Montant 12 EUR");
  });

  it("does not import an eml outside the desktop app", async () => {
    await importDigestCutEmlBase64("YQ==");
    expect(digestCut.notice).toContain(".eml");
    expect(digestCut.html).toBe("");
  });
});
