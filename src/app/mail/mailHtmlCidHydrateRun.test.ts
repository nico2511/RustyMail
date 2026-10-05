// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { hydrateCidImagesInMailShadow } from "./mailHtmlCidHydrateRun";

vi.mock("./mailHtmlImageLightboxRun", () => ({
  resolveSrcForMailImageLightbox: vi.fn(async (src: string, messageId?: string | null) => {
    if (messageId === "m1" && /^cid:img1-/i.test(src)) {
      return { src: "blob:resolved-photo", revokeObjectUrl: "blob:resolved-photo" };
    }
    return { src };
  }),
}));

describe("hydrateCidImagesInMailShadow", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("remplace cid: par l’URL résolue pour le message", async () => {
    const host = document.createElement("div");
    const shadow = host.attachShadow({ mode: "open" });
    shadow.innerHTML = `<div class="mail"><img src="cid:img1-abcdef12" alt="photo" /></div>`;
    hydrateCidImagesInMailShadow(shadow, "m1");
    await vi.waitFor(() => {
      const img = shadow.querySelector("img");
      expect(img?.getAttribute("src")).toBe("blob:resolved-photo");
    });
  });

  it("marque l’image manquante si le cid n’est pas résolu", async () => {
    const host = document.createElement("div");
    const shadow = host.attachShadow({ mode: "open" });
    shadow.innerHTML = `<div class="mail"><img src="cid:missing-1" alt="" /></div>`;
    hydrateCidImagesInMailShadow(shadow, "m1");
    await vi.waitFor(() => {
      const img = shadow.querySelector("img");
      expect(img?.classList.contains("mail-cid-missing")).toBe(true);
    });
  });
});
