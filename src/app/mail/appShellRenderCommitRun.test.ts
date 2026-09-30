// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from "vitest";
import { adoptHydratedMailHosts, commitAppShellHtml, resetAppShellMainCache } from "./appShellRenderCommitRun";

beforeEach(() => {
  resetAppShellMainCache();
});

describe("commitAppShellHtml", () => {
  it("garde le nœud de lecture quand seul le chrome change", () => {
    const root = document.createElement("div");
    const main = `<main class="main"><p id="letter">Bonjour</p></main>`;
    const first = commitAppShellHtml(
      root,
      `<aside class="sidebar">liste</aside>${main}<footer class="status-bar-wrap">a</footer>`,
      main,
      true,
    );
    expect(first.domChanged).toBe(true);
    const letter = root.querySelector("#letter");
    expect(letter).not.toBeNull();
    letter?.setAttribute("data-hydrated", "1");
    const mainNode = letter?.parentElement;

    const again = commitAppShellHtml(
      root,
      `<aside class="sidebar">liste</aside>${main}<footer class="status-bar-wrap">b</footer>`,
      main,
      true,
    );
    expect(again.domChanged).toBe(true);
    const kept = root.querySelector("#letter");
    expect(kept).toBe(letter);
    expect(kept?.parentElement).toBe(mainNode);
    expect(kept?.getAttribute("data-hydrated")).toBe("1");
    expect(root.querySelector("footer")?.textContent).toBe("b");
    expect(root.querySelector("main.main")).toBe(mainNode);
  });

  it("ne reconstruit pas le shell quand le HTML est identique", () => {
    const root = document.createElement("div");
    const main = `<main class="main"><p id="letter">Bonjour</p></main>`;
    const html = `<aside class="sidebar">liste</aside>${main}<footer class="status-bar-wrap">a</footer>`;
    commitAppShellHtml(root, html, main, true);
    const before = root.querySelector("#letter");
    const again = commitAppShellHtml(root, html, main, true);
    expect(again.domChanged).toBe(false);
    expect(root.querySelector("#letter")).toBe(before);
  });

  it("remplace la colonne quand le fil change et réinsère le corps hydraté", () => {
    const root = document.createElement("div");
    const first = `<main class="main"><div class="message-html" data-message-id="m1" data-email-html-b64="QQ=="></div></main>`;
    commitAppShellHtml(root, first, first, true);
    const host = root.querySelector(".message-html") as HTMLDivElement;
    host.attachShadow({ mode: "open" }).innerHTML = "<p id='body'>A</p>";
    const scroller = document.createElement("div");
    scroller.className = "thread-messages";
    scroller.scrollTop = 0;
    root.querySelector("main.main")?.prepend(scroller);

    const second = `<main class="main"><div class="thread-messages"></div><div class="message-html" data-message-id="m1" data-email-html-b64="QQ=="></div><p id="extra">x</p></main>`;
    const committed = commitAppShellHtml(root, second, second, true);
    expect(committed.domChanged).toBe(true);
    const kept = root.querySelector(".message-html");
    expect(kept).toBe(host);
    expect(kept?.shadowRoot?.querySelector("#body")?.textContent).toBe("A");
    expect(root.querySelector("#extra")?.textContent).toBe("x");
  });
});

describe("adoptHydratedMailHosts", () => {
  it("ignore un hôte dont le HTML source a changé", () => {
    const previous = document.createElement("main");
    previous.innerHTML = `<div class="message-html" data-message-id="m1" data-email-html-b64="QQ=="></div>`;
    const host = previous.querySelector(".message-html") as HTMLDivElement;
    host.attachShadow({ mode: "open" }).innerHTML = "<p>old</p>";
    const incoming = document.createElement("main");
    incoming.innerHTML = `<div class="message-html" data-message-id="m1" data-email-html-b64="Qg=="></div>`;
    adoptHydratedMailHosts(previous, incoming);
    expect(incoming.querySelector(".message-html")).not.toBe(host);
    expect(previous.querySelector(".message-html")).toBe(host);
  });
});
