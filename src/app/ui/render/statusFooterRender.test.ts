// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from "vitest";
import { paintStatusBarProgressDom } from "../../mail/statusBarProgressPaintRun";
import { state } from "../../state";
import { registerRenderDeps, type RenderDeps } from "./renderDeps";
import { renderGlobalStatusFooter } from "./statusFooterRender";

beforeEach(() => {
  registerRenderDeps({
    currentAccount: () => ({ email: "ada@example.com" }),
    activeMessageTranslationJobCount: () => 0,
    activeSecurityLlmAugmentCount: () => 0,
  } as unknown as RenderDeps);
  state.view = "list";
  state.status = { appName: "RustyMail", version: "0.3.3", walEnabled: true, vaultKeyLocation: "", aiRuntime: "" };
  state.capabilities = {
    mailCore: true,
    readabilityModules: true,
    aiModules: true,
    dictation: false,
    storage: "sqlite",
  };
  state.llmJobLabel = "";
  state.syncInProgress = false;
  state.statusBarJobs = [];
  state.searchViewBatchJob = null;
});

describe("renderGlobalStatusFooter", () => {
  it("garde la version et retire le statut de debug", () => {
    const html = renderGlobalStatusFooter();
    expect(html).toContain("RustyMail 0.3.3");
    expect(html).toContain("ada@example.com");
    expect(html).not.toContain("cœur prêt");
    expect(html).not.toContain("lisibilité");
    expect(html).not.toContain("hors Tauri");
    expect(html).not.toContain("status-bar-compact");
    expect(html).not.toMatch(/Tauri ·/);
  });
});

describe("paintStatusBarProgressDom", () => {
  it("insère la progression après le nom de l’app", () => {
    document.body.innerHTML = `<footer class="status-bar-wrap"><footer class="status-bar"><span class="status-bar-app">RustyMail 0.3.3</span><span class="status-bar-account">ada</span></footer></footer>`;
    state.statusBarJobs = [{ id: "sync", label: "Synchronisation", done: 1, total: 4 }];
    paintStatusBarProgressDom();
    const app = document.querySelector(".status-bar-app");
    expect(app?.nextElementSibling?.classList.contains("status-bar-progress-slot")).toBe(true);
    state.statusBarJobs = [];
  });
});
