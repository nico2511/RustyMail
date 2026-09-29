// @vitest-environment happy-dom
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "../..");

function readCss(rel: string): string {
  return readFileSync(resolve(root, rel), "utf8");
}

function installThreadCss(doc: Document) {
  const tokens = readCss("src/styles/tokens.css");
  const appearance = readCss("src/styles/appearance.css");
  const base = readCss("src/styles.css").replace(/@import\s+["'][^"']+["'];/g, "");
  const shell = readCss("src/styles/productivity-shell.css");
  const wave2 = readCss("src/styles/productivity-wave2.css");
  const style = doc.createElement("style");
  style.textContent = `${tokens}\n${appearance}\n${base}\n${shell}\n${wave2}`;
  doc.head.appendChild(style);
}

function message(className: string, avatarText: string): string {
  return `<article class="${className}">
    <span class="avatar thread-msg-avatar">${avatarText}</span>
    <div class="message-stack">
      <header class="message-head-row"><div class="thread-msg-head-main">${avatarText}</div></header>
      <div class="thread-msg-card">corps</div>
    </div>
  </article>`;
}

/** Règles du fil seulement. Le loquet dossier utilise `inset -2px` hors lecture. */
function threadMessageRules(css: string): string {
  return [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
    .filter((match) => /\.message|\.thread-msg|\.thread-reading|\.avatar/.test(match[1] ?? ""))
    .map((match) => match[0])
    .join("\n");
}

describe("fil de lecture aligné d’un seul côté", () => {
  it("n’inverse plus l’avatar ni la carte selon « moi » ou une voie droite", () => {
    const css = [readCss("src/styles.css"), readCss("src/styles/productivity-wave2.css"), readCss("src/styles/productivity-shell.css")].join("\n");
    expect(css).not.toMatch(/\border:\s*2\b/);
    expect(threadMessageRules(css)).not.toMatch(/inset\s+-/);
    expect(css).toMatch(/\.message\.mine \.avatar\s*\{[^}]*order:\s*0/);
    expect(css).toMatch(/\.thread-reading \.message\.mine \.thread-msg-card\s*\{[^}]*inset\s+3px\s+0\s+0/);

    installThreadCss(document);
    document.body.innerHTML = `<section class="thread-view thread-reading thread-reading--reading-layout">
      <div class="thread-messages thread-messages-reading">
        ${message("message thread-msg mine thread-msg--root thread-msg--head", "NL")}
        ${message("message thread-msg thread-msg--head", "S")}
        ${message("message thread-msg mine thread-msg--lane-right thread-msg--head", "NL")}
        ${message("message thread-msg thread-msg--lane-right thread-msg--other-right thread-msg--head", "A")}
      </div>
    </section>`;

    const sheet = document.querySelector("style")?.sheet;
    const rules = sheet && "cssRules" in sheet ? [...sheet.cssRules] : [];
    const orderValues = rules
      .filter((rule): rule is CSSStyleRule => "selectorText" in rule)
      .filter((rule) => rule.selectorText.includes(".message") || rule.selectorText.includes(".avatar"))
      .map((rule) => rule.style.order)
      .filter(Boolean);
    expect(orderValues.length).toBeGreaterThan(0);
    expect(orderValues.every((value) => value === "0")).toBe(true);

    for (const article of document.querySelectorAll("article")) {
      const avatar = article.querySelector(".thread-msg-avatar");
      expect(article.firstElementChild).toBe(avatar);
      expect(getComputedStyle(article).justifyContent).toBe("flex-start");
      expect(getComputedStyle(article).flexDirection).not.toBe("row-reverse");
    }
  });
});
