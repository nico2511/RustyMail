// @vitest-environment happy-dom
/**
 * Generates docs screenshots for the digest cut editor (PR review).
 * Run: CAPTURE_DIGEST_CUT=1 npx vitest run src/digestCutScreenshot.capture.test.ts
 */
import { execSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { digestCut } from "./app/mail/digestCutState";
import { renderDigestCutPanel } from "./app/ui/render/digestCutRender";

const CAPTURE = process.env.CAPTURE_DIGEST_CUT === "1";
const ROOT = join(import.meta.dirname, "..");
const OUT_DIR = join(ROOT, "docs", "screenshots");
const RECEIVE = readFileSync(
  join(ROOT, "crates/rustymail-modules/tests/fixtures/deblock/receive_200eur.html"),
  "utf8",
);

function loadYamlAndPreviewFromRust(): { yaml: string; previewHtml: string } {
  const out = execSync(
    "cargo test -p rustymail-modules --lib dump_deblock_cut_preview_for_docs -- --ignored --nocapture 2>&1",
    { cwd: ROOT, encoding: "utf8", maxBuffer: 4 * 1024 * 1024 },
  );
  const yamlStart = out.indexOf("DIGEST_CUT_YAML_START");
  const yamlEnd = out.indexOf("DIGEST_CUT_YAML_END");
  const previewStart = out.indexOf("DIGEST_CUT_PREVIEW_START");
  const previewEnd = out.indexOf("DIGEST_CUT_PREVIEW_END");
  if (yamlStart < 0 || yamlEnd < 0 || previewStart < 0 || previewEnd < 0) {
    throw new Error(`preview harness failed:\n${out.slice(-2500)}`);
  }
  return {
    yaml: out.slice(yamlStart + "DIGEST_CUT_YAML_START".length + 1, yamlEnd).trim(),
    previewHtml: out
      .slice(previewStart + "DIGEST_CUT_PREVIEW_START".length + 1, previewEnd)
      .trim(),
  };
}

function settingsShell(panelHtml: string): string {
  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="utf-8" />
  <title>RustyMail — Éditeur de découpe</title>
  <link rel="stylesheet" href="file://${join(ROOT, "src/styles.css")}" />
  <style>
    body { margin: 0; background: var(--bg, #1a1b1a); color: var(--text, #eef0ee); }
    .settings-root { min-height: 100vh; }
  </style>
</head>
<body>
  <section class="settings-root compose-view thread-view thread-reading" aria-label="Paramètres">
    <header class="thread-reading-head">
      <div class="thread-reading-hero">
        <h1 class="thread-reading-title">Paramètres</h1>
      </div>
    </header>
    <nav class="settings-nav" role="tablist" aria-label="Sections">
      <div class="settings-nav__group">
        <div class="settings-nav__tabs">
          <button type="button" class="settings-nav__tab" aria-selected="false">Stockage</button>
          <button type="button" class="settings-nav__tab settings-nav__tab--active" aria-selected="true">Éditeur de découpe</button>
          <button type="button" class="settings-nav__tab" aria-selected="false">Banc d'essai</button>
        </div>
      </div>
    </nav>
    <div class="settings-body">${panelHtml}</div>
  </section>
</body>
</html>`;
}

function chromeScreenshot(htmlPath: string, pngPath: string): void {
  execSync(
    `google-chrome-stable --headless=new --disable-gpu --window-size=1440,1280 --hide-scrollbars --screenshot="${pngPath}" "file://${htmlPath}"`,
    { stdio: "inherit" },
  );
}

function resetDigestCutState(): void {
  digestCut.sampleLoaded = true;
  digestCut.html = RECEIVE;
  digestCut.senderEmail = "support@deblock.com";
  digestCut.subject = "Vous allez recevoir 200 EUR";
  digestCut.proposing = false;
  digestCut.previewing = false;
  digestCut.previewError = "";
  digestCut.notice =
    "Proposition heuristique (structure DOM). Le modèle local peut affiner si configuré.";
}

describe.skipIf(!CAPTURE)("digest cut screenshot capture", () => {
  it("writes PNGs under docs/screenshots", () => {
    mkdirSync(OUT_DIR, { recursive: true });
    const { yaml, previewHtml } = loadYamlAndPreviewFromRust();

    resetDigestCutState();
    digestCut.proposal = {
      fixtureId: "deblock-com",
      ruleSetVersion: "1",
      source: "heuristic",
      match: {
        senderDomains: [{ exact: "deblock.com" }, { suffix: ".deblock.com" }],
        structureRoot: "div.f-fallback",
        minChildren: 3,
      },
      zones: {
        header: {
          action: "show",
          presentation: "prominent",
          anchors: [
            { selector: "h3", index: 0, role: "title" },
            { selector: "div", classContains: "code", role: "amount" },
          ],
          rationale:
            "Premier titre et bloc montant dans div.f-fallback (structure Deblock).",
        },
        body: {
          action: "show",
          presentation: "key_value",
          anchors: [
            {
              selector: "h3",
              index: 1,
              textContainsAny: ["détails", "details", "👇"],
            },
          ],
          detailsHeading: "Détails",
          rowSelector: "p",
          rationale: "Lignes libellé/valeur après le second h3 jusqu'au pied.",
        },
        footer: {
          action: "hide",
          anchors: [{ selector: "div", classContains: "warning" }],
          rationale: "Pied marketing / avertissement (div.warning).",
        },
      },
    };
    digestCut.yaml = yaml;
    digestCut.yamlReady = true;
    digestCut.previewApplicable = null;
    digestCut.previewHtml = "";

    const proposeHtmlPath = join(OUT_DIR, "_digest-cut-propose.html");
    writeFileSync(proposeHtmlPath, settingsShell(renderDigestCutPanel()));
    chromeScreenshot(proposeHtmlPath, join(OUT_DIR, "digest-cut-editor.png"));
    // ephemeral harness pages (not committed)

    digestCut.previewApplicable = true;
    digestCut.previewHtml = previewHtml;
    const previewHtmlPath = join(OUT_DIR, "_digest-cut-preview.html");
    writeFileSync(previewHtmlPath, settingsShell(renderDigestCutPanel()));
    chromeScreenshot(previewHtmlPath, join(OUT_DIR, "digest-cut-preview.png"));

    expect(readFileSync(join(OUT_DIR, "digest-cut-editor.png")).length).toBeGreaterThan(10_000);
    expect(readFileSync(join(OUT_DIR, "digest-cut-preview.png")).length).toBeGreaterThan(10_000);
  });
});
