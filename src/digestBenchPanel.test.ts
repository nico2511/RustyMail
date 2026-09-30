// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from "vitest";
import { handleDigestBenchAction } from "./app/mail/digestBenchActions";
import { digestBench } from "./app/mail/digestBenchState";
import { digestCut } from "./app/mail/digestCutState";
import { renderDigestBenchPanel } from "./app/ui/render/digestBenchRender";
import { state } from "./app/state";

beforeEach(() => {
  digestBench.queryDraft = "@deblock.com";
  digestBench.threads = [];
  digestBench.searchError = "";
  digestBench.searching = false;
  digestBench.selectedThreadId = null;
  digestBench.threadSubject = "";
  digestBench.messages = [];
  digestBench.selectedMessageId = null;
  digestBench.sampleMessageId = null;
  digestBench.validationMessageId = null;
  digestBench.yaml = "id: deblock\n";
  digestBench.yamlReady = true;
  digestBench.previewApplicable = null;
  digestBench.previewHtml = "";
  digestBench.previewError = "";
  digestBench.previewing = false;
  digestBench.compareMode = "split";
  digestBench.accepted = false;
  digestBench.acceptedFixtureId = null;
  digestBench.readingEnabled = false;
  digestBench.readingFixtureId = null;
  digestBench.notice = "";
});

describe("renderDigestBenchPanel", () => {
  it("shows search, yaml edit, accept, and a separate reading switch", () => {
    const html = renderDigestBenchPanel();
    expect(html).toContain("Banc d'essai fixtures");
    expect(html).toContain('data-action="digest-bench-search"');
    expect(html).toContain('id="digest-bench-yaml"');
    expect(html).toContain('data-action="digest-bench-accept"');
    expect(html).toContain('data-action="digest-bench-reject"');
    expect(html).toContain('data-action="digest-bench-enable"');
    expect(html).toContain("Accepter ne l&#039;allume pas");
    expect(html).toContain("pas le texte encore en cours d'édition");
    expect(html).toContain("Côte à côte");
    expect(html).toContain('data-action="digest-bench-cut"');
    expect(html).toContain("@domaine");
  });

  it("sanitizes the raw pane and explains a non-applicable fixture", () => {
    digestBench.messages = [
      {
        id: "m1",
        sender: "Deblock",
        senderEmail: "support@deblock.com",
        receivedAt: "2026-01-01",
        html: '<p>ok</p><script>alert(1)</script>',
      },
    ];
    digestBench.selectedMessageId = "m1";
    digestBench.previewApplicable = false;
    const html = renderDigestBenchPanel();
    expect(html).toContain("ok");
    expect(html).not.toContain("<script");
    expect(html).toContain("Fixture non applicable");
  });
});

describe("handleDigestBenchAction", () => {
  it("marks sample and validation, toggles compare, and focuses the yaml on tweak", async () => {
    digestBench.selectedThreadId = "t1";
    digestBench.threadSubject = "Virement";
    digestBench.messages = [
      {
        id: "m1",
        sender: "Deblock",
        senderEmail: "support@deblock.com",
        receivedAt: "2026-01-01",
        html: "<p>corps</p>",
      },
    ];
    document.body.innerHTML = renderDigestBenchPanel();
    const sample = document.querySelector<HTMLElement>('[data-action="digest-bench-sample"]');
    expect(await handleDigestBenchAction("digest-bench-sample", sample ?? undefined)).toBe(true);
    expect(digestBench.sampleMessageId).toBe("m1");
    const validation = document.querySelector<HTMLElement>('[data-action="digest-bench-validation"]');
    expect(await handleDigestBenchAction("digest-bench-validation", validation ?? undefined)).toBe(true);
    expect(digestBench.validationMessageId).toBe("m1");

    const raw = document.querySelector<HTMLElement>('[data-compare="raw"]');
    expect(await handleDigestBenchAction("digest-bench-compare", raw ?? undefined)).toBe(true);
    expect(digestBench.compareMode).toBe("raw");

    const yaml = document.querySelector<HTMLTextAreaElement>("#digest-bench-yaml");
    expect(yaml).not.toBeNull();
    if (yaml) yaml.value = "id: tweaked\n";
    expect(await handleDigestBenchAction("digest-bench-tweak")).toBe(true);
    expect(digestBench.yaml).toBe("id: tweaked\n");
    expect(digestBench.notice).toContain("Ajustez le YAML");
  });

  it("says accept does not turn reading on when the shell is not the app", async () => {
    document.body.innerHTML = `<textarea id="digest-bench-yaml">id: x</textarea>`;
    expect(await handleDigestBenchAction("digest-bench-accept")).toBe(true);
    expect(digestBench.notice).toContain("n'active pas la lecture");
    expect(digestBench.accepted).toBe(false);
    expect(digestBench.readingEnabled).toBe(false);
  });

  it("sends the selected mailbox message to the cut editor", async () => {
    digestBench.selectedMessageId = "m1";
    digestBench.threadSubject = "Facture";
    digestBench.messages = [
      {
        id: "m1",
        sender: "Shop",
        senderEmail: "notes@exemple.fr",
        receivedAt: "2026-01-01",
        html: "<p>Montant 12 EUR</p>",
      },
    ];
    expect(await handleDigestBenchAction("digest-bench-cut")).toBe(true);
    expect(digestCut.sourceKind).toBe("mailbox");
    expect(digestCut.html).toContain("Montant 12 EUR");
    expect(digestCut.senderEmail).toBe("notes@exemple.fr");
    expect(state.settingsTab).toBe("digestCut");
  });

  it("refuses a mailbox search when no account is selected", async () => {
    document.body.innerHTML = `<input id="digest-bench-query" value="@deblock.com reçu" />`;
    expect(await handleDigestBenchAction("digest-bench-search")).toBe(true);
    expect(digestBench.searchError).toContain("Choisissez un compte");
    expect(digestBench.threads).toEqual([]);
  });
});
