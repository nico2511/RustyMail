// @vitest-environment happy-dom
/**
 * Stage screenshots for the digest cut editor.
 * The HTML in the loaded-mail shots is a render stand-in produced by the Rust
 * heuristic test. The app does not offer that HTML as a sample.
 * Run: CAPTURE_DIGEST_CUT=1 npx vitest run src/digestCutScreenshot.capture.test.ts
 */
import { execSync } from "node:child_process";
import { mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { digestCut, type DigestCutProposal } from "./app/mail/digestCutState";
import { renderDigestCutPanel } from "./app/ui/render/digestCutRender";

const CAPTURE = process.env.CAPTURE_DIGEST_CUT === "1";
const ROOT = join(import.meta.dirname, "..");
const OUT_DIR = join(ROOT, "docs", "screenshots");

function between(text: string, start: string, end: string): string {
  const startAt = text.indexOf(start);
  const endAt = text.indexOf(end);
  if (startAt < 0 || endAt < 0 || endAt <= startAt) {
    throw new Error(`missing ${start} in harness output:\n${text.slice(-2500)}`);
  }
  return text.slice(startAt + start.length, endAt).trim();
}

function loadStageFromRust(): { html: string; proposal: DigestCutProposal; yaml: string; previewHtml: string } {
  const out = execSync(
    "cargo test -p rustymail-modules --lib dump_cut_stage_preview_for_docs -- --ignored --nocapture 2>&1",
    { cwd: ROOT, encoding: "utf8", maxBuffer: 4 * 1024 * 1024 },
  );
  return {
    html: between(out, "DIGEST_CUT_HTML_START", "DIGEST_CUT_HTML_END"),
    proposal: JSON.parse(between(out, "DIGEST_CUT_PROPOSAL_START", "DIGEST_CUT_PROPOSAL_END")) as DigestCutProposal,
    yaml: between(out, "DIGEST_CUT_YAML_START", "DIGEST_CUT_YAML_END"),
    previewHtml: between(out, "DIGEST_CUT_PREVIEW_START", "DIGEST_CUT_PREVIEW_END"),
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

function chromeBin(): string {
  for (const bin of ["google-chrome-stable", "google-chrome", "chromium", "chromium-browser"]) {
    try {
      execSync(`command -v ${bin}`, { stdio: "ignore" });
      return bin;
    } catch {
      /* try the next binary */
    }
  }
  throw new Error("no chrome or chromium binary for screenshots");
}

function chromeScreenshot(htmlPath: string, pngPath: string): void {
  execSync(
    `${chromeBin()} --headless=new --disable-gpu --window-size=1440,1180 --hide-scrollbars --screenshot="${pngPath}" "file://${htmlPath}"`,
    { stdio: "inherit" },
  );
}

function resetCut(): void {
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
}

function shoot(name: string, panelHtml: string): void {
  const htmlPath = join(OUT_DIR, `_${name}.html`);
  const pngPath = join(OUT_DIR, `${name}.png`);
  writeFileSync(htmlPath, settingsShell(panelHtml));
  chromeScreenshot(htmlPath, pngPath);
  unlinkSync(htmlPath);
  expect(readFileSync(pngPath).length).toBeGreaterThan(10_000);
}

describe.skipIf(!CAPTURE)("digest cut stage screenshots", () => {
  it("writes pick, explain, and refine PNGs under docs/screenshots", () => {
    mkdirSync(OUT_DIR, { recursive: true });
    const stage = loadStageFromRust();

    resetCut();
    digestCut.queryDraft = "@exemple.fr";
    digestCut.notice = "Indiquez un domaine de votre boîte, ouvrez un fil, puis choisissez le message.";
    shoot("digest-cut-stage-pick", renderDigestCutPanel());

    resetCut();
    digestCut.sourceKind = "mailbox";
    digestCut.queryDraft = "@exemple.fr";
    digestCut.subject = "Votre commande est confirmée";
    digestCut.senderEmail = "notes@exemple.fr";
    digestCut.html = stage.html;
    digestCut.proposal = stage.proposal;
    digestCut.yaml = stage.yaml;
    digestCut.yamlReady = true;
    digestCut.notice = "Proposition structurelle, expliquée en français. Ajustez les zones, puis l'aperçu.";
    shoot("digest-cut-stage-explain", renderDigestCutPanel());

    digestCut.previewApplicable = true;
    digestCut.previewHtml = stage.previewHtml;
    digestCut.notice = "Pied masqué. L'aperçu montre la lecture coupée. Affiner redemande au modèle local.";
    if (digestCut.proposal) {
      digestCut.proposal.zones.footer.action = "hide";
    }
    shoot("digest-cut-stage-refine", renderDigestCutPanel());
  });
});
