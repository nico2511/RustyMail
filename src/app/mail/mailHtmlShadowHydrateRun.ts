import { render } from "../dispatch";
import { state } from "../state";
import { openExternalFromMailHref, normalizeMailHrefForOpen } from "./mailLinkOpen";
import {
  pickImgSrcForLightbox,
  resolveSrcForMailImageLightbox,
} from "./mailHtmlImageLightboxRun";
import { buildMailShadowInnerHtml, readMailHtmlRawFromHost } from "./mailHtmlShadowInnerRun";

function bindMailShadowClick(shadow: ShadowRoot, host: HTMLDivElement): void {
  const shadowState = shadow as unknown as { __mailClickBound?: boolean };
  if (shadowState.__mailClickBound) return;
  shadowState.__mailClickBound = true;
  shadow.addEventListener("click", (ev) => {
    const t = ev.target as HTMLElement | null;
    if (!t) return;
    const remoteBtn = t.closest(".mail-load-remote-images") as HTMLButtonElement | null;
    if (remoteBtn) {
      ev.preventDefault();
      ev.stopPropagation();
      const mid = (host.dataset.messageId ?? "").trim();
      if (mid) state.remoteImagesAllowedByMessage[mid] = true;
      remountMailHtmlShadow(host);
      return;
    }
    const a = t.closest("a[href]") as HTMLAnchorElement | null;
    if (a) {
      ev.preventDefault();
      ev.stopPropagation();
      const href = a.getAttribute("href")?.trim() ?? "";
      const normalized = normalizeMailHrefForOpen(href);
      if (normalized) void openExternalFromMailHref(normalized);
      return;
    }
    if (t.tagName !== "IMG") return;
    const img = t as HTMLImageElement;
    const messageId = (host.dataset.messageId ?? "").trim();
    const src = pickImgSrcForLightbox(img);
    if (!src) return;
    const alt = (img.getAttribute("alt") || "").trim();
    void resolveSrcForMailImageLightbox(src, messageId).then((resolved) => {
      state.imageModal = { src: resolved.src, alt, revokeObjectUrl: resolved.revokeObjectUrl ?? null };
      render();
    });
  });
}

export function remountMailHtmlShadow(host: HTMLDivElement): void {
  const messageId = (host.dataset.messageId ?? "").trim();
  const shadow = host.shadowRoot ?? host.attachShadow({ mode: "open" });
  const isCleanView = host.classList.contains("message-html--clean");
  shadow.innerHTML = buildMailShadowInnerHtml(messageId, readMailHtmlRawFromHost(host), isCleanView);
  bindMailShadowClick(shadow, host);
}

export function hydrateEmailHtml() {
  const nodes = document.querySelectorAll<HTMLDivElement>(
    ".message-html[data-email-html-b64], .message-html[data-email-html]",
  );
  nodes.forEach((host) => {
    if ((host as unknown as { __hydrated?: boolean }).__hydrated) return;
    (host as unknown as { __hydrated?: boolean }).__hydrated = true;
    remountMailHtmlShadow(host);
  });
}
