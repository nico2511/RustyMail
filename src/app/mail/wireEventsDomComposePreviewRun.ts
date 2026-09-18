// @ts-nocheck — DOM wiring; tighten types incrementally.
import { normalizeMailHrefForOpen, openExternalFromMailHref } from "./mailLinkOpen";
import {
  pickImgSrcForLightbox,
  resolveSrcForMailImageLightbox,
} from "./mailContentWireActions";
import { state } from "../state";
import { render } from "../dispatch";

export function wireEventsDomComposePreview(signal: AbortSignal): void {
  document.querySelector<HTMLElement>(".composer-body .preview")?.addEventListener(
    "click",
    (ev) => {
      const t = ev.target as HTMLElement | null;
      if (!t) return;
      const a = t.closest("a[href]") as HTMLAnchorElement | null;
      if (a) {
        const raw = a.getAttribute("href")?.trim() ?? "";
        const normalized = normalizeMailHrefForOpen(raw);
        if (normalized) {
          ev.preventDefault();
          void openExternalFromMailHref(normalized);
        }
        return;
      }
      if (t.tagName !== "IMG") return;
      const img = t as HTMLImageElement;
      const src = pickImgSrcForLightbox(img);
      if (!src) return;
      const alt = (img.getAttribute("alt") || "").trim();
      void resolveSrcForMailImageLightbox(src, null).then((resolved) => {
        state.imageModal = { src: resolved.src, alt, revokeObjectUrl: resolved.revokeObjectUrl ?? null };
        render();
      });
    },
    { signal },
  );
}
