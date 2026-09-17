import { invoke } from "@tauri-apps/api/core";
import { render } from "../dispatch";
import { base64ToImageBlob, base64ToUtf8String } from "../lib/htmlMessage";
import { isTauriRuntime } from "../lib/tauriRuntime";
import type { InlineAttachPayload } from "../types";
import { state } from "../state";
import { openExternalFromMailHref, normalizeMailHrefForOpen } from "./mailLinkOpen";
import { sanitizeEmailHtml } from "./mailEmailHtmlSanitize";

export function pickImgSrcForLightbox(img: HTMLImageElement): string {
  // `getAttribute("src")` peut être vide si l’image vient de `srcset`.
  // `currentSrc` est la source réellement utilisée par le navigateur.
  const current = (img.currentSrc || "").trim();
  if (current) return current;
  const prop = (img.src || "").trim();
  if (prop) return prop;
  return (img.getAttribute("src") || "").trim();
}

function mailImageSrcLooksLikeCid(raw: string): boolean {
  return /^cid:/i.test(String(raw).trim());
}

function normalizeMailCidToken(cidUrl: string): string {
  const tail = cidUrl.trim().replace(/^cid:/i, "").trim();
  try {
    return decodeURIComponent(tail).replace(/^<|>$/g, "").trim().toLowerCase();
  } catch {
    return tail.replace(/^<|>$/g, "").trim().toLowerCase();
  }
}

export async function resolveSrcForMailImageLightbox(rawSrc: string, messageId?: string | null): Promise<{ src: string; revokeObjectUrl?: string | null }> {
  let src = String(rawSrc).trim();
  if (!src) return { src };

  const mid = (messageId ?? "").trim();
  if (mid && mailImageSrcLooksLikeCid(src) && isTauriRuntime()) {
    try {
      const token = normalizeMailCidToken(src);
      if (token) {
        const fetched = await invoke<InlineAttachPayload | null>("inline_attachment_fetch", { messageId: mid, cid: token });
        if (fetched?.dataBase64 && fetched.mimeType) {
          const blob = base64ToImageBlob(fetched.dataBase64, fetched.mimeType);
          const objectUrl = URL.createObjectURL(blob);
          return { src: objectUrl, revokeObjectUrl: objectUrl };
        }
      }
    } catch {
      /* garder rawSrc pour afficher l’icône « image cassée » */
    }
  }
  return { src };
}

function readMailHtmlRawFromHost(host: HTMLDivElement): string {
  const b64 = host.dataset.emailHtmlB64?.trim();
  if (b64) {
    try {
      return base64ToUtf8String(b64);
    } catch {
      return host.dataset.emailHtml ?? "";
    }
  }
  return host.dataset.emailHtml ?? "";
}

function buildMailShadowInnerHtml(messageId: string, raw: string, isCleanView = false): string {
  const allowRemoteImages = Boolean(messageId && state.remoteImagesAllowedByMessage[messageId]);
  const { html: sanitized } = sanitizeEmailHtml(raw, {
    allowRemoteImages,
    relocateUnsubscribe: true,
    stripOutlookNoise: isCleanView
  });
  const blockedRemoteImages = !allowRemoteImages && sanitized.includes("data-remote-src=");
  const remoteImageBanner = blockedRemoteImages ?
    `<div class="remote-images">
        <span>Images distantes bloquées pour protéger votre confidentialité.</span>
        <button type="button" class="mail-load-remote-images">Charger les images</button>
      </div>`
  : "";
  return `
      <style>
        :host{display:block;box-sizing:border-box;color:var(--text);font-family:system-ui,-apple-system,"Segoe UI","Helvetica Neue",Arial,sans-serif;padding:0 2px}
        .mail{padding:0;line-height:1.55;font-size:13px;background:transparent}
        .mail :is(p, ul, ol, blockquote, pre, table){margin:0 0 10px}
        .mail :is(h1,h2,h3){margin:8px 0 10px;font-family:ui-serif,Georgia,Cambria,"Times New Roman",serif;font-weight:400;letter-spacing:-0.02em}
        .mail a{color:var(--accent)}
        .remote-images{display:flex;flex-wrap:wrap;align-items:center;gap:10px 12px;margin:0 0 10px;padding:10px 16px;box-sizing:border-box;max-width:100%;border:1px solid rgba(232,228,223,.14);border-radius:10px;background:rgba(255,255,255,.035);color:var(--dim,rgba(238,240,238,.72));font-size:12px;line-height:1.45}
        .remote-images span{flex:1 1 10rem;min-width:0}
        .remote-images button{flex:0 0 auto;margin-left:auto;border:1px solid rgba(232,228,223,.18);border-radius:999px;background:rgba(255,255,255,.06);color:var(--text);padding:6px 12px;cursor:pointer}
        .mail a.mail-link-disabled{color:var(--dim,rgba(238,240,238,.56));text-decoration:line-through;cursor:not-allowed}
        .mail a.mail-unsubscribe-link{
          display:inline-flex;
          align-items:center;
          gap:6px;
          margin:12px 0;
          padding:9px 16px;
          border-radius:10px;
          font-weight:650;
          font-size:13px;
          line-height:1.25;
          text-decoration:none !important;
          color:var(--text) !important;
          background:rgba(108,200,138,.16);
          border:1px solid rgba(108,200,138,.42);
          box-shadow:0 1px 0 rgba(0,0,0,.12);
        }
        .mail a.mail-unsubscribe-link:hover{
          background:rgba(108,200,138,.26);
          border-color:rgba(108,200,138,.58);
        }
        .mail .mail-unsubscribe-link--relocated,
        .mail .mail-unsubscribe-section--relocated{display:none !important}
        .mail img{
          box-sizing:border-box;
          max-width:100% !important;
          width:auto !important;
          height:auto !important;
          max-height:min(50vh,520px) !important;
          object-fit:contain;
          display:block;
          border-radius:12px;
          border:1px solid rgba(232,228,223,.10);
          cursor:zoom-in
        }
        .mail img.mail-remote-image-blocked,.mail img.mail-image-blocked{
          min-height:42px;
          padding:10px;
          cursor:default;
          background:rgba(255,255,255,.035);
        }
        .mail code{background:rgba(255,255,255,.065);padding:3px 7px;border-radius:6px;font-size:12px}
        .mail article.rm-deblock-digest table,.mail article.rm-amazon-digest table{width:100%;border-collapse:collapse;font-size:inherit}
        .mail article.rm-deblock-digest th,.mail article.rm-deblock-digest td,
        .mail article.rm-amazon-digest th,.mail article.rm-amazon-digest td{padding:7px 12px 7px 0;vertical-align:top;text-align:left;line-height:1.45}
        .mail article.rm-deblock-digest th,.mail article.rm-amazon-digest tbody th{font-weight:600;white-space:nowrap;width:1%;color:var(--dim,rgba(238,240,238,.58))}
        .mail article.rm-deblock-digest tbody tr:not(:first-child) th,.mail article.rm-deblock-digest tbody tr:not(:first-child) td,
        .mail article.rm-amazon-digest tbody tr:not(:first-child) th,.mail article.rm-amazon-digest tbody tr:not(:first-child) td{border-top:1px solid rgba(120,119,117,.16)}
        .mail article.rm-conversation-report{display:flex;flex-direction:column;gap:14px;margin:0}
        .mail article.rm-conversation-report .rm-conversation-turn{padding:12px 14px;border:1px solid rgba(120,119,117,.18);border-radius:10px;background:rgba(255,255,255,.025)}
        .mail article.rm-conversation-report .rm-conversation-turn--cited{border-left:2px solid rgba(232,228,223,.14)}
        .mail article.rm-conversation-report .rm-conversation-turn--cited[data-depth="1"]{margin-left:12px}
        .mail article.rm-conversation-report .rm-conversation-turn--cited[data-depth="2"]{margin-left:24px}
        .mail article.rm-conversation-report .rm-conversation-turn--cited[data-depth="3"]{margin-left:36px}
        .mail article.rm-conversation-report .rm-conversation-turn--cited[data-depth="4"]{margin-left:48px}
        .mail article.rm-conversation-report .rm-conversation-turn--cited[data-depth="5"]{margin-left:60px}
        .mail article.rm-conversation-report .rm-conversation-envelope{width:100%;border-collapse:collapse;font-size:12px;margin:0 0 10px}
        .mail article.rm-conversation-report .rm-conversation-envelope th,.mail article.rm-conversation-report .rm-conversation-envelope td{padding:4px 12px 4px 0;vertical-align:top;text-align:left;line-height:1.4}
        .mail article.rm-conversation-report .rm-conversation-envelope th{font-weight:600;white-space:nowrap;width:1%;color:var(--dim,rgba(238,240,238,.58))}
        .mail article.rm-conversation-report .rm-conversation-envelope tr:not(:first-child) th,.mail article.rm-conversation-report .rm-conversation-envelope tr:not(:first-child) td{border-top:1px solid rgba(120,119,117,.12)}
        .mail article.rm-conversation-report .rm-conversation-participants{display:flex;flex-wrap:wrap;gap:6px;align-items:center}
        .mail article.rm-conversation-report .rm-conversation-chip{display:inline-flex;align-items:center;border-radius:999px;padding:3px 10px;font-size:12px;font-weight:600;line-height:1.3;background:rgba(173,188,216,.10);color:var(--text);border:1px solid rgba(173,188,216,.18);cursor:default}
        .mail article.rm-conversation-report .rm-conversation-body{margin:0;line-height:1.55}
        .mail article.rm-conversation-report .rm-conversation-body :is(p, div){margin:0 0 10px}
        .mail article.rm-conversation-report .rm-conversation-body br{display:block;content:"";margin-bottom:0.45em}
        .mail table{max-width:100%;width:100%;border-collapse:collapse}
        .mail blockquote{padding:8px 12px;border-left:2px solid rgba(232,228,223,.12);background:rgba(255,255,255,.02);border-radius:10px}
        .mail :is(.gmail_quote, .gmail_quote_container, blockquote.gmail_quote){display:none !important}
        .mail .rm-mail-signature{display:none !important}
        .mail :is(.rm-mail-forward-header, .rm-mail-outlook-quote-header){display:none !important}
        /* Vue clean : filet si le marqueur rm-mail-* manque (HTML déjà nettoyé sans wrapper). */
        .mail.mail--clean :is(#Signature, #x_Signature, #signature, #divRplyFwdMsg, #x_divRplyFwdMsg){display:none !important}
        .mail *{max-width:100%}
      </style>
      ${remoteImageBanner}
      <div class="mail${isCleanView ? " mail--clean" : ""}">${sanitized}</div>
    `;
}

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

function remountMailHtmlShadow(host: HTMLDivElement): void {
  const messageId = (host.dataset.messageId ?? "").trim();
  const shadow = host.shadowRoot ?? host.attachShadow({ mode: "open" });
  const isCleanView = host.classList.contains("message-html--clean");
  shadow.innerHTML = buildMailShadowInnerHtml(messageId, readMailHtmlRawFromHost(host), isCleanView);
  bindMailShadowClick(shadow, host);
}

export function hydrateEmailHtml() {
  const nodes = document.querySelectorAll<HTMLDivElement>(
    ".message-html[data-email-html-b64], .message-html[data-email-html]"
  );
  nodes.forEach((host) => {
    if ((host as unknown as { __hydrated?: boolean }).__hydrated) return;
    (host as unknown as { __hydrated?: boolean }).__hydrated = true;
    remountMailHtmlShadow(host);
  });
}

