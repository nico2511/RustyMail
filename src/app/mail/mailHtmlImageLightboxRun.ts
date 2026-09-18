import { invoke } from "@tauri-apps/api/core";

import { base64ToImageBlob } from "../lib/htmlMessage";
import { isTauriRuntime } from "../lib/tauriRuntime";
import type { InlineAttachPayload } from "../types";

export function pickImgSrcForLightbox(img: HTMLImageElement): string {
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

export async function resolveSrcForMailImageLightbox(
  rawSrc: string,
  messageId?: string | null,
): Promise<{ src: string; revokeObjectUrl?: string | null }> {
  let src = String(rawSrc).trim();
  if (!src) return { src };

  const mid = (messageId ?? "").trim();
  if (mid && mailImageSrcLooksLikeCid(src) && isTauriRuntime()) {
    try {
      const token = normalizeMailCidToken(src);
      if (token) {
        const fetched = await invoke<InlineAttachPayload | null>("inline_attachment_fetch", {
          messageId: mid,
          cid: token,
        });
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
