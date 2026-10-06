import { describe, expect, it } from "vitest";
import { buildMailShadowInnerHtml } from "./mailHtmlShadowInnerRun";

describe("mailHtmlShadowInner CSS tables", () => {
  it("applique les bordures seulement aux tableaux rm-mail-data", () => {
    const html = buildMailShadowInnerHtml("msg-1", "<p>hello</p>", true);
    expect(html).toContain(".mail table.rm-mail-data th,.mail table.rm-mail-data td");
    expect(html).toMatch(/\.mail table\.rm-mail-data th,\.mail table\.rm-mail-data td\{[^}]*border:1px solid/);
    // Pas de bordure générique sur toutes les cellules (régression layout / envelope).
    expect(html).not.toMatch(/\.mail table th,\.mail table td\{[^}]*border:1px/);
  });
});
