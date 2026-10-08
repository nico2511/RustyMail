// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { state } from "../state";
import { buildMailShadowInnerHtml } from "./mailHtmlShadowInnerRun";

const REMOTE_MAIL = `<p>Bonjour,</p><img src="https://cdn.example/logo.png" alt="Logo" width="120" height="40"><p>Le texte continue ici.</p>`;

describe("images distantes dans le corps", () => {
  it("garde la mention en haut et n’affiche pas la pastille dans le texte", () => {
    const id = "msg-remote-hidden";
    delete state.remoteImagesAllowedByMessage[id];
    const html = buildMailShadowInnerHtml(id, REMOTE_MAIL);
    expect(html).toContain("Des images distantes sont bloquées.");
    expect(html).toContain('class="mail-load-remote-images"');
    expect(html).toContain("Afficher les images");
    expect(html).toContain('data-remote-src="https://cdn.example/logo.png"');
    expect(html).toContain("mail-remote-image-blocked");
    expect(html).toMatch(/\.mail img\.mail-remote-image-blocked\{[^}]*display:\s*none\s*!important/);
    expect(html).not.toMatch(/\.mail img\.mail-remote-image-blocked[^{]*\{[^}]*min-height/);

    const host = document.createElement("div");
    document.body.appendChild(host);
    const shadow = host.attachShadow({ mode: "open" });
    shadow.innerHTML = html;
    const img = shadow.querySelector("img.mail-remote-image-blocked");
    expect(img).toBeTruthy();
    expect(getComputedStyle(img!).display).toBe("none");
    expect(shadow.querySelector(".remote-images")?.textContent).toContain("Des images distantes sont bloquées.");
    expect(shadow.querySelector(".mail")?.textContent).toContain("Le texte continue ici.");
    host.remove();
  });

  it("réaffiche les images distantes quand le message est autorisé", () => {
    const id = "msg-remote-shown";
    state.remoteImagesAllowedByMessage[id] = true;
    const html = buildMailShadowInnerHtml(id, REMOTE_MAIL);
    expect(html).not.toContain('class="remote-images"');
    expect(html).not.toContain("Des images distantes sont bloquées.");
    expect(html).toContain('src="https://cdn.example/logo.png"');
    expect(html).not.toContain("data-remote-src=");
    delete state.remoteImagesAllowedByMessage[id];
  });
});
